-- Helpers, triggers and the RPC API.
-- Every function is SECURITY DEFINER with a pinned search_path; client-facing
-- functions validate the caller, the input and the rate limits themselves.

-- ---------------------------------------------------------------------------
-- Helpers (private)
-- ---------------------------------------------------------------------------
create or replace function private.setting_int(k text)
returns integer
language sql stable security definer set search_path = ''
as $$ select (value #>> '{}')::integer from private.settings where key = k $$;

create or replace function private.setting_json(k text)
returns jsonb
language sql stable security definer set search_path = ''
as $$ select value from private.settings where key = k $$;

create or replace function private.current_app_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select coalesce((select p.role from public.profiles p where p.id = auth.uid()), 'user'::public.app_role)
$$;

create or replace function private.is_moderator()
returns boolean
language sql stable security definer set search_path = ''
as $$ select private.current_app_role() in ('moderator', 'admin') $$;

create or replace function private.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$ select private.current_app_role() = 'admin' $$;

grant execute on function private.is_moderator() to anon, authenticated;

/** Signed-in, not suspended user id or an error. */
create or replace function private.require_user()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  until timestamptz;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  select p.banned_until into until from public.profiles p where p.id = uid;
  if until is not null and until > now() then
    raise exception 'account_suspended' using errcode = '42501', detail = until::text;
  end if;
  return uid;
end;
$$;

create or replace function private.require_moderator()
returns uuid
language plpgsql stable security definer set search_path = ''
as $$
declare
  uid uuid := private.require_user();
begin
  if not private.is_moderator() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return uid;
end;
$$;

create or replace function private.assert_limit(used bigint, setting text)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if used >= private.setting_int(setting) then
    raise exception 'rate_limited' using errcode = '54000', detail = setting;
  end if;
end;
$$;

/** Lower-case, accent-free text for fuzzy matching ("Café" ~ "cafe"). */
create or replace function private.normalize(t text)
returns text
language sql immutable parallel safe set search_path = ''
as $$ select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(t, ''))) $$;

create index places_name_norm_trgm_idx on public.places
  using gin (private.normalize(name) extensions.gin_trgm_ops);

create or replace function private.clean_text(t text, max_len integer)
returns text
language sql immutable set search_path = ''
as $$ select nullif(left(regexp_replace(btrim(coalesce(t, '')), '\s+', ' ', 'g'), max_len), '') $$;

-- ---------------------------------------------------------------------------
-- Result type shared by every place-returning RPC
-- ---------------------------------------------------------------------------
create type public.place_result as (
  id uuid,
  name text,
  category public.place_category,
  cuisine text[],
  lon double precision,
  lat double precision,
  easting double precision,
  northing double precision,
  elevation real,
  address text,
  website text,
  phone text,
  opening_hours text,
  description text,
  halal_level public.halal_level,
  certification public.halal_certification,
  certifier text,
  certification_verified boolean,
  serves_alcohol boolean,
  upvotes integer,
  downvotes integer,
  score integer,
  confirmations integer,
  last_confirmed_at timestamptz,
  review_count integer,
  avg_rating numeric,
  status public.place_status,
  removed_at timestamptz,
  source text,
  created_at timestamptz,
  creator_name text,
  is_mine boolean,
  my_vote smallint
);

create or replace function private.to_result(p public.places)
returns public.place_result
language sql stable security definer set search_path = ''
as $$
  select row(
    p.id, p.name, p.category, p.cuisine,
    extensions.st_x(p.location), extensions.st_y(p.location),
    extensions.st_x(extensions.st_transform(p.location, 2056)),
    extensions.st_y(extensions.st_transform(p.location, 2056)),
    p.elevation, p.address, p.website, p.phone, p.opening_hours, p.description,
    p.halal_level, p.certification, p.certifier, p.certification_verified, p.serves_alcohol,
    p.upvotes, p.downvotes, p.score, p.confirmations, p.last_confirmed_at,
    p.review_count,
    case when p.rating_count > 0 then round(p.rating_sum::numeric / p.rating_count, 2) end,
    p.status, p.removed_at, p.source, p.created_at,
    (select pr.display_name from public.profiles pr where pr.id = p.created_by),
    coalesce(p.created_by = auth.uid(), false),
    (select v.value from public.votes v where v.place_id = p.id and v.user_id = auth.uid())
  )::public.place_result
$$;

/** Can the caller see this place? Active for everyone; creators and moderators see more. */
create or replace function private.can_see(p public.places)
returns boolean
language sql stable security definer set search_path = ''
as $$ select p.status = 'active' or p.created_by = auth.uid() or private.is_moderator() $$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger places_touch before update on public.places
  for each row execute function private.touch_updated_at();
create trigger reviews_touch before update on public.reviews
  for each row execute function private.touch_updated_at();
create trigger votes_touch before update on public.votes
  for each row execute function private.touch_updated_at();

/** New auth user -> public profile. */
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  -- privacy by default: never derive the public name from the e-mail address
  -- or an OAuth profile; members choose a display name themselves
  name text := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    'member-' || substr(replace(new.id::text, '-', ''), 1, 6)
  );
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(name, 40))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

/** Community auto-removal: enough downvotes and a low enough score. */
create or replace function private.apply_auto_removal(pid uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  removed public.places;
begin
  update public.places p
     set status = 'removed', removed_at = now(), removal_reason = 'community_downvotes'
   where p.id = pid
     and p.status = 'active'
     and not p.moderation_lock
     and p.downvotes >= private.setting_int('removal_min_downvotes')
     and p.score <= private.setting_int('removal_max_score')
  returning * into removed;
  if removed.id is not null then
    insert into public.moderation_events (actor_id, action, place_id, note)
    values (null, 'auto_remove', pid, format('score %s with %s downvotes', removed.score, removed.downvotes));
    return true;
  end if;
  return false;
end;
$$;

create or replace function private.on_vote_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  pid uuid := coalesce(new.place_id, old.place_id);
begin
  update public.places p set
    upvotes = (select count(*) from public.votes v where v.place_id = pid and v.value = 1),
    downvotes = (select count(*) from public.votes v where v.place_id = pid and v.value = -1)
  where p.id = pid;
  perform private.apply_auto_removal(pid);
  return null;
end;
$$;

create trigger votes_recount after insert or update or delete on public.votes
  for each row execute function private.on_vote_change();

create or replace function private.on_review_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  pid uuid := coalesce(new.place_id, old.place_id);
begin
  update public.places p set
    review_count = s.n,
    rating_sum = s.rsum,
    rating_count = s.rn,
    confirmations = s.conf,
    last_confirmed_at = s.last_conf
  from (
    select count(*) filter (where r.status = 'visible') as n,
           coalesce(sum(r.rating) filter (where r.status = 'visible' and r.rating is not null), 0) as rsum,
           count(r.rating) filter (where r.status = 'visible') as rn,
           count(*) filter (where r.status = 'visible' and r.halal_confirmed) as conf,
           max(r.updated_at) filter (where r.status = 'visible' and r.halal_confirmed) as last_conf
      from public.reviews r
     where r.place_id = pid
  ) s
  where p.id = pid;
  return null;
end;
$$;

create trigger reviews_recount after insert or update or delete on public.reviews
  for each row execute function private.on_review_change();

/**
 * Defence in depth: only moderators/admins (or the RPCs, which run as the
 * owner) may change roles or bans. SECURITY INVOKER on purpose, so that
 * current_user is the role performing the update.
 */
create or replace function private.guard_profile()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.banned_until is distinct from old.banned_until)
     and current_user not in ('postgres', 'supabase_admin', 'service_role')
     and not private.is_moderator() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard before update on public.profiles
  for each row execute function private.guard_profile();

-- ---------------------------------------------------------------------------
-- Read API (anon + authenticated)
-- ---------------------------------------------------------------------------
create or replace function public.places_in_bbox(
  west double precision,
  south double precision,
  east double precision,
  north double precision,
  max_results integer default 400
)
returns setof public.place_result
language sql stable security definer set search_path = ''
as $$
  select private.to_result(p)
    from public.places p
   where p.location operator(extensions.&&) extensions.st_makeenvelope(west, south, east, north, 4326)
     and p.status = 'active'
   order by p.score desc, p.created_at desc
   limit least(greatest(max_results, 1), 1000)
$$;
comment on function public.places_in_bbox is 'Active places inside a WGS84 box, best first. Includes LV95 coordinates for the 3D world.';

create or replace function public.place_detail(place_id uuid)
returns public.place_result
language sql stable security definer set search_path = ''
as $$
  select private.to_result(p) from public.places p where p.id = place_id and private.can_see(p)
$$;

create or replace function public.search_places(query text, max_results integer default 10)
returns setof public.place_result
language sql stable security definer set search_path = ''
as $$
  with q as (select private.normalize(btrim(query)) as t)
  select private.to_result(p)
    from public.places p, q
   where p.status = 'active'
     and char_length(q.t) >= 2
     and (
       private.normalize(p.name) operator(extensions.%) q.t
       or private.normalize(p.name) like '%' || q.t || '%'
       or private.normalize(array_to_string(p.cuisine, ' ')) like '%' || q.t || '%'
       or private.normalize(p.address) like '%' || q.t || '%'
     )
   order by extensions.similarity(private.normalize(p.name), q.t) desc, p.score desc
   limit least(greatest(max_results, 1), 50)
$$;

create or replace function public.nearby_places(lon double precision, lat double precision, radius_m double precision default 60)
returns setof public.place_result
language sql stable security definer set search_path = ''
as $$
  select private.to_result(p)
    from public.places p
   where p.status = 'active'
     and extensions.st_dwithin(
       p.location::extensions.geography,
       extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography,
       least(greatest(radius_m, 1), 500)
     )
   order by extensions.st_distance(
       p.location::extensions.geography,
       extensions.st_setsrid(extensions.st_makepoint(lon, lat), 4326)::extensions.geography)
   limit 20
$$;

create or replace function public.list_reviews(place_id uuid, max_results integer default 50)
returns table (
  id uuid,
  rating smallint,
  body text,
  halal_confirmed boolean,
  confirmation_method public.confirmation_method,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  author_name text,
  is_mine boolean
)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.rating, r.body, r.halal_confirmed, r.confirmation_method, r.status,
         r.created_at, r.updated_at,
         (select pr.display_name from public.profiles pr where pr.id = r.user_id),
         r.user_id = auth.uid()
    from public.reviews r
   where r.place_id = list_reviews.place_id
     and (r.status = 'visible' or r.user_id = auth.uid() or private.is_moderator())
   order by (r.user_id = auth.uid()) desc, r.updated_at desc
   limit least(greatest(max_results, 1), 200)
$$;

-- ---------------------------------------------------------------------------
-- Write API (authenticated)
-- ---------------------------------------------------------------------------
create or replace function public.create_place(
  p_name text,
  p_lon double precision,
  p_lat double precision,
  p_category public.place_category default 'restaurant',
  p_cuisine text[] default '{}',
  p_elevation real default null,
  p_address text default null,
  p_website text default null,
  p_phone text default null,
  p_opening_hours text default null,
  p_description text default null,
  p_halal_level public.halal_level default 'unknown',
  p_certification public.halal_certification default 'community',
  p_certifier text default null,
  p_serves_alcohol boolean default null
)
returns public.place_result
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  area jsonb := private.setting_json('service_area');
  pt extensions.geometry := extensions.st_setsrid(extensions.st_makepoint(p_lon, p_lat), 4326);
  clean_name text := private.clean_text(p_name, 80);
  dup uuid;
  created public.places;
begin
  perform private.assert_limit(
    (select count(*) from public.places p where p.created_by = uid and p.created_at > now() - interval '24 hours'),
    'limit_places_per_day');
  if clean_name is null or char_length(clean_name) < 2 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if p_lon is null or p_lat is null
     or p_lon < (area ->> 0)::float8 or p_lat < (area ->> 1)::float8
     or p_lon > (area ->> 2)::float8 or p_lat > (area ->> 3)::float8 then
    raise exception 'outside_service_area' using errcode = '22023';
  end if;
  select p.id into dup
    from public.places p
   where p.status in ('active', 'hidden')
     and extensions.st_dwithin(p.location::extensions.geography, pt::extensions.geography, private.setting_int('duplicate_radius_m'))
     and extensions.similarity(private.normalize(p.name), private.normalize(clean_name)) > 0.45
   limit 1;
  if dup is not null then
    raise exception 'duplicate_place' using errcode = '23505', detail = dup::text;
  end if;
  insert into public.places (
    name, category, cuisine, location, elevation, address, website, phone, opening_hours, description,
    halal_level, certification, certifier, serves_alcohol, created_by, source
  ) values (
    clean_name,
    coalesce(p_category, 'restaurant'),
    coalesce((select array_agg(distinct lower(private.clean_text(c, 30))) from unnest(p_cuisine) c where private.clean_text(c, 30) is not null), '{}'),
    pt,
    p_elevation,
    private.clean_text(p_address, 160),
    private.clean_text(p_website, 300),
    private.clean_text(p_phone, 40),
    private.clean_text(p_opening_hours, 200),
    private.clean_text(p_description, 600),
    coalesce(p_halal_level, 'unknown'),
    coalesce(p_certification, 'community'),
    private.clean_text(p_certifier, 80),
    p_serves_alcohol,
    uid,
    'community'
  ) returning * into created;
  return private.to_result(created);
end;
$$;

create or replace function public.update_place(
  p_id uuid,
  p_name text,
  p_category public.place_category,
  p_cuisine text[],
  p_address text,
  p_website text,
  p_phone text,
  p_opening_hours text,
  p_description text,
  p_halal_level public.halal_level,
  p_certification public.halal_certification,
  p_certifier text,
  p_serves_alcohol boolean
)
returns public.place_result
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  target public.places;
  updated public.places;
begin
  select * into target from public.places p where p.id = p_id for update;
  if target.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not private.is_moderator()
     and not (target.created_by = uid and target.created_at > now() - interval '7 days' and target.status = 'active') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.places p set
    name = coalesce(private.clean_text(p_name, 80), p.name),
    category = coalesce(p_category, p.category),
    cuisine = coalesce((select array_agg(distinct lower(private.clean_text(c, 30))) from unnest(p_cuisine) c where private.clean_text(c, 30) is not null), '{}'),
    address = private.clean_text(p_address, 160),
    website = private.clean_text(p_website, 300),
    phone = private.clean_text(p_phone, 40),
    opening_hours = private.clean_text(p_opening_hours, 200),
    description = private.clean_text(p_description, 600),
    halal_level = coalesce(p_halal_level, p.halal_level),
    certification = coalesce(p_certification, p.certification),
    certifier = private.clean_text(p_certifier, 80),
    -- a changed certification claim must be re-verified
    certification_verified = p.certification_verified and coalesce(p_certification, p.certification) = p.certification
                             and private.clean_text(p_certifier, 80) is not distinct from p.certifier,
    serves_alcohol = p_serves_alcohol
  where p.id = p_id
  returning * into updated;
  return private.to_result(updated);
end;
$$;

create or replace function public.cast_vote(p_place_id uuid, p_value smallint)
returns public.place_result
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  target public.places;
  joined timestamptz;
begin
  if p_value not in (-1, 0, 1) then
    raise exception 'invalid_vote' using errcode = '22023';
  end if;
  select * into target from public.places p where p.id = p_place_id;
  if target.id is null or target.status <> 'active' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if target.created_by = uid then
    raise exception 'own_place' using errcode = '42501';
  end if;
  select u.created_at into joined from auth.users u where u.id = uid;
  if joined is not null and joined > now() - make_interval(mins => private.setting_int('vote_min_account_age_minutes')) then
    raise exception 'account_too_new' using errcode = '42501';
  end if;
  perform private.assert_limit(
    (select count(*) from private.vote_events e where e.user_id = uid and e.created_at > now() - interval '1 hour'),
    'limit_votes_per_hour');

  if p_value = 0 then
    delete from public.votes v where v.place_id = p_place_id and v.user_id = uid;
  else
    insert into public.votes (place_id, user_id, value) values (p_place_id, uid, p_value)
    on conflict (place_id, user_id) do update set value = excluded.value
    where public.votes.value is distinct from excluded.value;
  end if;
  insert into private.vote_events (place_id, user_id, value) values (p_place_id, uid, p_value);

  select * into target from public.places p where p.id = p_place_id;
  return private.to_result(target);
end;
$$;
comment on function public.cast_vote is 'value: 1 upvote, -1 downvote, 0 clear. Returns the updated place; status becomes "removed" when the community removed it.';

create or replace function public.upsert_review(
  p_place_id uuid,
  p_rating smallint default null,
  p_body text default '',
  p_halal_confirmed boolean default false,
  p_confirmation_method public.confirmation_method default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  rid uuid;
begin
  if not exists (select 1 from public.places p where p.id = p_place_id and p.status = 'active') then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.assert_limit(
    (select count(*) from public.reviews r where r.user_id = uid and r.updated_at > now() - interval '24 hours'),
    'limit_reviews_per_day');
  if coalesce(p_halal_confirmed, false) and p_confirmation_method is null then
    raise exception 'confirmation_method_required' using errcode = '22023';
  end if;
  insert into public.reviews (place_id, user_id, rating, body, halal_confirmed, confirmation_method)
  values (
    p_place_id, uid, p_rating, coalesce(left(btrim(p_body), 1000), ''),
    coalesce(p_halal_confirmed, false),
    case when coalesce(p_halal_confirmed, false) then p_confirmation_method end
  )
  on conflict (place_id, user_id) do update set
    rating = excluded.rating,
    body = excluded.body,
    halal_confirmed = excluded.halal_confirmed,
    confirmation_method = excluded.confirmation_method
  returning id into rid;
  return rid;
end;
$$;

create or replace function public.delete_my_review(p_place_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_user();
begin
  delete from public.reviews r where r.place_id = p_place_id and r.user_id = uid;
end;
$$;

create or replace function public.submit_report(
  p_reason public.report_reason,
  p_place_id uuid default null,
  p_review_id uuid default null,
  p_details text default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  rid uuid;
begin
  if (p_place_id is null) = (p_review_id is null) then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  perform private.assert_limit(
    (select count(*) from public.reports r where r.reporter_id = uid and r.created_at > now() - interval '24 hours'),
    'limit_reports_per_day');
  select r.id into rid from public.reports r
   where r.reporter_id = uid and r.status = 'open'
     and r.place_id is not distinct from p_place_id and r.review_id is not distinct from p_review_id;
  if rid is not null then
    update public.reports set reason = p_reason, details = private.clean_text(p_details, 500) where id = rid;
    return rid;
  end if;
  insert into public.reports (place_id, review_id, reporter_id, reason, details)
  values (p_place_id, p_review_id, uid, p_reason, private.clean_text(p_details, 500))
  returning id into rid;
  return rid;
end;
$$;

create or replace function public.my_profile()
returns table (id uuid, display_name text, role public.app_role, banned_until timestamptz, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$ select p.id, p.display_name, p.role, p.banned_until, p.created_at from public.profiles p where p.id = auth.uid() $$;

create or replace function public.update_my_profile(p_display_name text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_user();
  clean text := private.clean_text(p_display_name, 40);
begin
  if clean is null then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  update public.profiles set display_name = clean where id = uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation API (moderators / admins)
-- ---------------------------------------------------------------------------
create or replace function public.mod_list_reports(p_status public.report_status default 'open', max_results integer default 100)
returns table (
  id uuid,
  reason public.report_reason,
  details text,
  status public.report_status,
  created_at timestamptz,
  reporter_name text,
  place_id uuid,
  place_name text,
  place_status public.place_status,
  review_id uuid,
  review_body text,
  open_reports_for_target bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_moderator();
  return query
    select r.id, r.reason, r.details, r.status, r.created_at,
           (select pr.display_name from public.profiles pr where pr.id = r.reporter_id),
           coalesce(r.place_id, rv.place_id),
           p.name, p.status, r.review_id, rv.body,
           (select count(*) from public.reports o
             where o.status = 'open'
               and o.place_id is not distinct from r.place_id
               and o.review_id is not distinct from r.review_id)
      from public.reports r
      left join public.reviews rv on rv.id = r.review_id
      left join public.places p on p.id = coalesce(r.place_id, rv.place_id)
     where r.status = p_status
     order by r.created_at asc
     limit least(greatest(max_results, 1), 500);
end;
$$;

create or replace function public.mod_resolve_report(p_report_id uuid, p_status public.report_status, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_moderator();
begin
  if p_status = 'open' then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.reports
     set status = p_status, resolved_by = uid, resolved_at = now(), resolution_note = private.clean_text(p_note, 500)
   where id = p_report_id;
  insert into public.moderation_events (actor_id, action, report_id, note)
  values (uid, 'report_' || p_status::text, p_report_id, private.clean_text(p_note, 500));
end;
$$;

create or replace function public.mod_set_place_status(p_place_id uuid, p_status public.place_status, p_note text default null)
returns public.place_result
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_moderator();
  updated public.places;
begin
  update public.places p set
    status = p_status,
    removed_at = case when p_status = 'removed' then now() else null end,
    removal_reason = case when p_status = 'removed' then 'moderator' else null end,
    -- a restore protects the place from being auto-removed again by the same voters
    moderation_lock = case when p_status = 'active' then true else p.moderation_lock end
  where p.id = p_place_id
  returning * into updated;
  if updated.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.moderation_events (actor_id, action, place_id, note)
  values (uid, 'place_' || p_status::text, p_place_id, private.clean_text(p_note, 500));
  return private.to_result(updated);
end;
$$;

create or replace function public.mod_verify_certification(p_place_id uuid, p_verified boolean, p_note text default null)
returns public.place_result
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_moderator();
  updated public.places;
begin
  update public.places p set
    certification_verified = p_verified,
    certification = case when p_verified then 'certified'::public.halal_certification else p.certification end
  where p.id = p_place_id
  returning * into updated;
  if updated.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  insert into public.moderation_events (actor_id, action, place_id, note)
  values (uid, case when p_verified then 'certification_verified' else 'certification_unverified' end, p_place_id,
          private.clean_text(p_note, 500));
  return private.to_result(updated);
end;
$$;

create or replace function public.mod_delete_place(p_place_id uuid, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_moderator();
begin
  delete from public.places where id = p_place_id;
  insert into public.moderation_events (actor_id, action, place_id, note)
  values (uid, 'place_deleted', p_place_id, private.clean_text(p_note, 500));
end;
$$;

create or replace function public.mod_set_review_status(p_review_id uuid, p_status text, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_moderator();
begin
  if p_status not in ('visible', 'hidden') then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.reviews set status = p_status where id = p_review_id;
  insert into public.moderation_events (actor_id, action, review_id, note)
  values (uid, 'review_' || p_status, p_review_id, private.clean_text(p_note, 500));
end;
$$;

create or replace function public.mod_list_places(p_status public.place_status default 'removed', max_results integer default 100)
returns setof public.place_result
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_moderator();
  return query
    select (private.to_result(p)).* from public.places p
     where p.status = p_status
     order by coalesce(p.removed_at, p.updated_at) desc
     limit least(greatest(max_results, 1), 500);
end;
$$;

create or replace function public.mod_list_events(max_results integer default 100)
returns table (
  id bigint,
  action text,
  note text,
  created_at timestamptz,
  actor_name text,
  place_id uuid,
  place_name text,
  review_id uuid,
  report_id uuid,
  target_user_id uuid
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_moderator();
  return query
    select e.id, e.action, e.note, e.created_at,
           (select pr.display_name from public.profiles pr where pr.id = e.actor_id),
           e.place_id, (select p.name from public.places p where p.id = e.place_id),
           e.review_id, e.report_id, e.target_user_id
      from public.moderation_events e
     order by e.created_at desc
     limit least(greatest(max_results, 1), 500);
end;
$$;

create or replace function public.mod_ban_user(p_user_id uuid, p_until timestamptz, p_note text default null)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_moderator();
  target_role public.app_role;
begin
  select p.role into target_role from public.profiles p where p.id = p_user_id;
  if target_role is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if target_role <> 'user' and not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.profiles set banned_until = p_until where id = p_user_id;
  insert into public.moderation_events (actor_id, action, target_user_id, note)
  values (uid, case when p_until is null or p_until <= now() then 'user_unbanned' else 'user_banned' end, p_user_id,
          private.clean_text(p_note, 500));
end;
$$;

create or replace function public.admin_set_role(p_user_id uuid, p_role public.app_role)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_user();
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  insert into public.moderation_events (actor_id, action, target_user_id, note)
  values (uid, 'role_' || p_role::text, p_user_id, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Maintenance
-- ---------------------------------------------------------------------------
/** Permanently delete places removed (by votes or moderators) longer than the grace period ago. */
create or replace function private.purge_removed_places()
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  n integer;
begin
  with gone as (
    delete from public.places p
     where p.status = 'removed'
       and p.removed_at < now() - make_interval(days => private.setting_int('removal_grace_days'))
    returning p.id
  )
  select count(*) into n from gone;
  if n > 0 then
    insert into public.moderation_events (actor_id, action, note) values (null, 'purge', format('%s places deleted', n));
  end if;
  return n;
end;
$$;
