-- Hardening after the second review (docs/research/findings.md, "Second
-- pass"): exact counters under concurrent writes, rate limits that parallel
-- requests cannot overrun, moderation evidence that survives deletion, a
-- suspend action for moderators, and privacy fixes. Written as a new
-- migration so it applies on top of databases created from the first five.
--
-- New functions start executable by PUBLIC (PostgreSQL's global default,
-- which the per-schema rule in 000400 cannot remove), so each one is revoked
-- explicitly at the end; supabase/tests/03_hardening_test.sql lists exactly
-- which functions anon and authenticated may call.

insert into private.settings (key, value, description) values
  ('vote_log_retention_days', '30', 'Entries of the vote log (rate limiting, abuse checks) are deleted after this many days.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Privacy: no member directory, a vote log that follows the account
-- ---------------------------------------------------------------------------
-- Profiles are only read through RPCs (display names next to spots and
-- reviews); the table grant let anyone list every member's id and role.
revoke select on public.profiles from anon, authenticated;

delete from private.vote_events e where not exists (select 1 from auth.users u where u.id = e.user_id);
alter table private.vote_events
  add constraint vote_events_user_id_fkey foreign key (user_id) references auth.users (id) on delete cascade;

create or replace function private.prune_vote_events()
returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  n integer;
begin
  delete from private.vote_events e
   where e.created_at < now() - make_interval(days => private.setting_int('vote_log_retention_days'));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reports keep their evidence
-- ---------------------------------------------------------------------------
-- A report on a review now records the review's place, text and author when
-- it is filed. Deleting (or editing) the review no longer erases what the
-- moderators were asked to look at; deleting the author's account deletes
-- the reports about them, as the privacy policy says.
alter table public.reports
  add column review_snapshot text check (char_length(review_snapshot) <= 1000),
  add column review_author_id uuid references auth.users (id) on delete cascade;
alter table public.reports drop constraint reports_review_id_fkey;
alter table public.reports
  add constraint reports_review_id_fkey foreign key (review_id) references public.reviews (id) on delete set null;
update public.reports r
   set place_id = rv.place_id, review_snapshot = rv.body, review_author_id = rv.user_id
  from public.reviews rv
 where rv.id = r.review_id;

-- ---------------------------------------------------------------------------
-- Concurrency
-- ---------------------------------------------------------------------------
/**
 * Serialises one member's rate-limited writes. Without it, parallel requests
 * all counted the rows committed before any of them, so 40 simultaneous
 * submissions could pass a limit of 5.
 */
create or replace function private.lock_user_writes(uid uuid)
returns void
language sql volatile security definer set search_path = ''
as $$ select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('user-writes:' || uid::text, 0)) $$;

-- The recount triggers counted with a snapshot taken before a concurrent
-- writer committed and then stored a stale total: two upvotes at once counted
-- as one, and a spot could be auto-removed with a score it never had. Locking
-- the place row in a statement of its own makes the recount that follows see
-- every vote or review committed before the lock was granted.
create or replace function private.on_vote_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  pid uuid := coalesce(new.place_id, old.place_id);
begin
  perform 1 from public.places p where p.id = pid for update;
  update public.places p set
    upvotes = (select count(*) from public.votes v where v.place_id = pid and v.value = 1),
    downvotes = (select count(*) from public.votes v where v.place_id = pid and v.value = -1)
  where p.id = pid;
  perform private.apply_auto_removal(pid);
  return null;
end;
$$;

create or replace function private.on_review_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  pid uuid := coalesce(new.place_id, old.place_id);
begin
  perform 1 from public.places p where p.id = pid for update;
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

/** Only a change of content dates a review: hiding and showing it must not make an old halal confirmation look fresh. */
create or replace function private.touch_review_content()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  if (new.rating, new.body, new.halal_confirmed, new.confirmation_method)
     is distinct from (old.rating, old.body, old.halal_confirmed, old.confirmation_method) then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger reviews_touch on public.reviews;
create trigger reviews_touch before update on public.reviews
  for each row execute function private.touch_review_content();

-- ---------------------------------------------------------------------------
-- Read API
-- ---------------------------------------------------------------------------
-- Reviews of a spot the caller cannot see (hidden, removed) are not listed.
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
     and exists (select 1 from public.places p where p.id = r.place_id and private.can_see(p))
   order by (r.user_id = auth.uid()) desc, r.updated_at desc
   limit least(greatest(max_results, 1), 200)
$$;

-- ---------------------------------------------------------------------------
-- Write API
-- ---------------------------------------------------------------------------
-- Changes from 000300: the per-member lock, at most 6 cuisine tags (the
-- table's limit) instead of a constraint error, and a spot removed less than
-- removal_grace_days ago cannot be submitted again at the same place
-- ("recently_removed"; moderators can restore it instead).
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
  dup public.places;
  created public.places;
begin
  perform private.lock_user_writes(uid);
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
  select * into dup
    from public.places p
   where extensions.st_dwithin(p.location::extensions.geography, pt::extensions.geography, private.setting_int('duplicate_radius_m'))
     and extensions.similarity(private.normalize(p.name), private.normalize(clean_name)) > 0.45
   order by p.status = 'removed'
   limit 1;
  if dup.id is not null then
    if dup.status = 'removed' then
      raise exception 'recently_removed' using errcode = '23505', detail = dup.id::text;
    end if;
    raise exception 'duplicate_place' using errcode = '23505', detail = dup.id::text;
  end if;
  insert into public.places (
    name, category, cuisine, location, elevation, address, website, phone, opening_hours, description,
    halal_level, certification, certifier, serves_alcohol, created_by, source
  ) values (
    clean_name,
    coalesce(p_category, 'restaurant'),
    coalesce((select (array_agg(distinct lower(private.clean_text(c, 30))))[1:6] from unnest(p_cuisine) c where private.clean_text(c, 30) is not null), '{}'),
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

-- Changes from 000300: at most 6 cuisine tags, and a changed halal level
-- (not only a changed claim or certifier) needs a new verification.
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
    cuisine = coalesce((select (array_agg(distinct lower(private.clean_text(c, 30))))[1:6] from unnest(p_cuisine) c where private.clean_text(c, 30) is not null), '{}'),
    address = private.clean_text(p_address, 160),
    website = private.clean_text(p_website, 300),
    phone = private.clean_text(p_phone, 40),
    opening_hours = private.clean_text(p_opening_hours, 200),
    description = private.clean_text(p_description, 600),
    halal_level = coalesce(p_halal_level, p.halal_level),
    certification = coalesce(p_certification, p.certification),
    certifier = private.clean_text(p_certifier, 80),
    -- a changed certification claim, certifier or halal level must be re-verified
    certification_verified = p.certification_verified
                             and coalesce(p_certification, p.certification) = p.certification
                             and coalesce(p_halal_level, p.halal_level) = p.halal_level
                             and private.clean_text(p_certifier, 80) is not distinct from p.certifier,
    serves_alcohol = p_serves_alcohol
  where p.id = p_id
  returning * into updated;
  return private.to_result(updated);
end;
$$;

-- Changes from 000300: the per-member lock and a locked read of the spot, so
-- the status check and the vote see the same row.
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
  perform private.lock_user_writes(uid);
  select * into target from public.places p where p.id = p_place_id for update;
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

-- Changes from 000300: the per-member lock; no review (and so no halal
-- confirmation) of one's own spot, like votes; the daily limit counts new
-- reviews only, so a member at the limit can still correct or withdraw a
-- confirmation.
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
  target public.places;
  rid uuid;
begin
  perform private.lock_user_writes(uid);
  select * into target from public.places p where p.id = p_place_id for update;
  if target.id is null or target.status <> 'active' then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if target.created_by = uid then
    raise exception 'own_place' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reviews r where r.place_id = p_place_id and r.user_id = uid) then
    perform private.assert_limit(
      (select count(*) from public.reviews r where r.user_id = uid and r.created_at > now() - interval '24 hours'),
      'limit_reviews_per_day');
  end if;
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

-- A review a moderator hid cannot be deleted by its author: deleting and
-- posting it again would undo the moderator's decision.
create or replace function public.delete_my_review(p_place_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_user();
begin
  if exists (select 1 from public.reviews r where r.place_id = p_place_id and r.user_id = uid and r.status = 'hidden') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.reviews r where r.place_id = p_place_id and r.user_id = uid;
end;
$$;

-- Changes from 000300: the per-member lock, the target must exist and be
-- visible to the reporter, and a report on a review records its place, text
-- and author (see "Reports keep their evidence" above).
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
  review public.reviews;
  rid uuid;
begin
  if (p_place_id is null) = (p_review_id is null) then
    raise exception 'invalid_target' using errcode = '22023';
  end if;
  perform private.lock_user_writes(uid);
  if p_review_id is not null then
    select * into review from public.reviews r
     where r.id = p_review_id
       and (r.status = 'visible' or r.user_id = uid or private.is_moderator())
       and exists (select 1 from public.places p where p.id = r.place_id and private.can_see(p));
    if review.id is null then
      raise exception 'not_found' using errcode = 'P0002';
    end if;
  elsif not exists (select 1 from public.places p where p.id = p_place_id and private.can_see(p)) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.assert_limit(
    (select count(*) from public.reports r where r.reporter_id = uid and r.created_at > now() - interval '24 hours'),
    'limit_reports_per_day');
  select r.id into rid from public.reports r
   where r.reporter_id = uid and r.status = 'open'
     and case when p_review_id is not null then r.review_id = p_review_id
              else r.place_id = p_place_id and r.review_id is null and r.review_snapshot is null end;
  if rid is not null then
    update public.reports r set
      reason = p_reason,
      details = private.clean_text(p_details, 500),
      review_snapshot = coalesce(review.body, r.review_snapshot)
     where r.id = rid;
    return rid;
  end if;
  insert into public.reports (place_id, review_id, reporter_id, reason, details, review_snapshot, review_author_id)
  values (coalesce(review.place_id, p_place_id), p_review_id, uid, p_reason, private.clean_text(p_details, 500),
          review.body, review.user_id)
  returning id into rid;
  return rid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Moderation API
-- ---------------------------------------------------------------------------
-- New columns: whether the report is about a review and whether that review
-- is gone, the author's pseudonym and suspension (end date, and whether it is
-- in force now), and whether the author can be suspended from this report
-- (spots imported from OSM have none).
drop function public.mod_list_reports(public.report_status, integer);
create function public.mod_list_reports(p_status public.report_status default 'open', max_results integer default 100)
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
  is_review boolean,
  review_deleted boolean,
  author_name text,
  author_banned_until timestamptz,
  author_suspended boolean,
  can_suspend_author boolean,
  open_reports_for_target bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_moderator();
  return query
    with t as (
      select r.*,
             rv.body as live_body,
             (r.review_id is not null or r.review_snapshot is not null) as about_review,
             case when r.review_id is not null or r.review_snapshot is not null
                  then coalesce(rv.user_id, r.review_author_id) else p.created_by end as author_id,
             p.name as p_name, p.status as p_status
        from public.reports r
        left join public.reviews rv on rv.id = r.review_id
        left join public.places p on p.id = r.place_id
       where r.status = p_status
    )
    select t.id, t.reason, t.details, t.status, t.created_at,
           (select pr.display_name from public.profiles pr where pr.id = t.reporter_id),
           t.place_id, t.p_name, t.p_status, t.review_id,
           coalesce(t.live_body, t.review_snapshot),
           t.about_review,
           t.about_review and t.review_id is null,
           au.display_name,
           au.banned_until,
           coalesce(au.banned_until > now(), false),
           au.id is not null and au.id <> auth.uid() and (au.role = 'user' or private.is_admin()),
           (select count(*) from public.reports o
             where o.status = 'open'
               and o.place_id is not distinct from t.place_id
               and case when t.review_id is not null then o.review_id = t.review_id
                        else o.review_id is null and o.review_snapshot is not distinct from t.review_snapshot end)
      from t
      left join public.profiles au on au.id = t.author_id
     order by t.created_at asc
     limit least(greatest(max_results, 1), 500);
end;
$$;

/**
 * Suspends (p_days > 0) or reinstates (p_days = 0) the author of the content
 * a report is about, without revealing who that is to the moderator's
 * browser. Same rules as mod_ban_user: moderators suspend members, admins
 * anyone; nobody suspends themselves.
 */
create function public.mod_suspend_author(p_report_id uuid, p_days integer, p_note text default null)
returns timestamptz
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_moderator();
  author uuid;
  target_role public.app_role;
  until timestamptz;
begin
  if p_days is null or p_days < 0 or p_days > 365 then
    raise exception 'invalid_input' using errcode = '22023';
  end if;
  select case when r.review_id is not null or r.review_snapshot is not null
              then coalesce(rv.user_id, r.review_author_id) else p.created_by end
    into author
    from public.reports r
    left join public.reviews rv on rv.id = r.review_id
    left join public.places p on p.id = r.place_id
   where r.id = p_report_id;
  select pr.role into target_role from public.profiles pr where pr.id = author;
  if author is null or target_role is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if author = uid or (target_role <> 'user' and not private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  until := case when p_days = 0 then null else now() + make_interval(days => p_days) end;
  update public.profiles set banned_until = until where id = author;
  insert into public.moderation_events (actor_id, action, report_id, target_user_id, note)
  values (uid, case when until is null then 'user_unbanned' else 'user_banned' end, p_report_id, author,
          private.clean_text(p_note, 500));
  return until;
end;
$$;

-- Verifying confirms the certificate a spot claims; it no longer turns a
-- community or self-declared claim into "certified" (which unverifying then
-- left behind). Moderators edit the claim first if it is wrong.
create or replace function public.mod_verify_certification(p_place_id uuid, p_verified boolean, p_note text default null)
returns public.place_result
language plpgsql volatile security definer set search_path = ''
as $$
declare
  uid uuid := private.require_moderator();
  target public.places;
  updated public.places;
begin
  select * into target from public.places p where p.id = p_place_id for update;
  if target.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_verified and target.certification <> 'certified' then
    raise exception 'invalid_status' using errcode = '22023';
  end if;
  update public.places p set certification_verified = p_verified
   where p.id = p_place_id
  returning * into updated;
  insert into public.moderation_events (actor_id, action, place_id, note)
  values (uid, case when p_verified then 'certification_verified' else 'certification_unverified' end, p_place_id,
          private.clean_text(p_note, 500));
  return private.to_result(updated);
end;
$$;

-- ---------------------------------------------------------------------------
-- Privileges of the functions created here (replaced ones keep theirs)
-- ---------------------------------------------------------------------------
revoke execute on function private.lock_user_writes(uuid) from public, anon, authenticated;
revoke execute on function private.prune_vote_events() from public, anon, authenticated;
revoke execute on function private.touch_review_content() from public, anon, authenticated;
revoke execute on function public.mod_list_reports(public.report_status, integer) from public, anon, authenticated;
revoke execute on function public.mod_suspend_author(uuid, integer, text) from public, anon, authenticated;
grant execute on function public.mod_list_reports(public.report_status, integer) to authenticated;
grant execute on function public.mod_suspend_author(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Daily pruning of the vote log (same tolerant pattern as 000500)
-- ---------------------------------------------------------------------------
do $outer$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'prune-vote-events') then
      perform cron.unschedule('prune-vote-events');
    end if;
    perform cron.schedule('prune-vote-events', '27 3 * * *', 'select private.prune_vote_events()');
  else
    raise notice 'pg_cron is not installed: run private.prune_vote_events() daily another way';
  end if;
exception when others then
  raise notice 'pg_cron setup skipped: %', sqlerrm;
end
$outer$;
