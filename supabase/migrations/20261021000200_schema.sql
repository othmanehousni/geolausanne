-- GeoLausanne core schema: halal food places, community votes, reviews with
-- halal confirmations, reports and moderation.
--
-- Design rules (docs/backend/data-model.md):
--  * every table has RLS enabled; clients read through narrow grants and write
--    only through SECURITY DEFINER RPCs that validate input and enforce limits;
--  * vote counts, confirmation counts and the auto-removal decision are
--    computed server-side, never trusted from the client;
--  * votes measure community trust in a listing, they never change the halal
--    certification, which is a separate claim that only moderators can verify.

grant usage on schema private to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.place_category as enum (
  'restaurant', 'fast_food', 'cafe', 'bakery', 'butcher', 'grocery', 'food_truck', 'other'
);
create type public.halal_level as enum ('full', 'partial', 'unknown');
create type public.halal_certification as enum ('certified', 'self_declared', 'community');
create type public.place_status as enum ('active', 'hidden', 'removed');
create type public.app_role as enum ('user', 'moderator', 'admin');
create type public.report_reason as enum (
  'not_halal', 'closed', 'wrong_location', 'duplicate', 'spam', 'offensive', 'other'
);
create type public.report_status as enum ('open', 'resolved', 'dismissed');
create type public.confirmation_method as enum ('certificate', 'asked_staff', 'owner', 'other');

-- ---------------------------------------------------------------------------
-- Settings (tunable without a migration)
-- ---------------------------------------------------------------------------
create table private.settings (
  key text primary key,
  value jsonb not null,
  description text not null
);

insert into private.settings (key, value, description) values
  ('removal_min_downvotes', '5', 'A place is removed once it has at least this many downvotes...'),
  ('removal_max_score', '-5', '...and its score (upvotes - downvotes) is at or below this value.'),
  ('removal_grace_days', '14', 'Removed places are permanently deleted after this many days (moderators can restore them meanwhile).'),
  ('vote_min_account_age_minutes', '10', 'New accounts must wait this long before voting (slows down throwaway accounts).'),
  ('limit_places_per_day', '5', 'Places a user may submit per 24 h.'),
  ('limit_reviews_per_day', '20', 'Reviews a user may write per 24 h.'),
  ('limit_reports_per_day', '20', 'Reports a user may file per 24 h.'),
  ('limit_votes_per_hour', '120', 'Vote changes a user may make per hour.'),
  ('duplicate_radius_m', '40', 'Radius used to detect duplicate submissions.'),
  ('service_area', '[6.45, 46.44, 6.85, 46.65]', 'Accepted bounding box for new places (west, south, east, north, WGS84).');

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  role public.app_role not null default 'user',
  banned_until timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'Public profile per auth user. Role and bans are only changed by admins/moderators.';

-- ---------------------------------------------------------------------------
-- Places
-- ---------------------------------------------------------------------------
create table public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  category public.place_category not null default 'restaurant',
  cuisine text[] not null default '{}' check (cardinality(cuisine) <= 6),
  location extensions.geometry(point, 4326) not null,
  elevation real check (elevation between 300 and 1200),
  address text check (char_length(address) <= 160),
  website text check (website is null or (website ~* '^https?://[^ ]+$' and char_length(website) <= 300)),
  phone text check (char_length(phone) <= 40),
  opening_hours text check (char_length(opening_hours) <= 200),
  description text check (char_length(description) <= 600),
  halal_level public.halal_level not null default 'unknown',
  certification public.halal_certification not null default 'community',
  certifier text check (char_length(certifier) <= 80),
  certification_verified boolean not null default false,
  serves_alcohol boolean,
  upvotes integer not null default 0 check (upvotes >= 0),
  downvotes integer not null default 0 check (downvotes >= 0),
  score integer generated always as (upvotes - downvotes) stored,
  confirmations integer not null default 0 check (confirmations >= 0),
  last_confirmed_at timestamptz,
  review_count integer not null default 0 check (review_count >= 0),
  rating_sum integer not null default 0 check (rating_sum >= 0),
  rating_count integer not null default 0 check (rating_count >= 0),
  status public.place_status not null default 'active',
  removed_at timestamptz,
  removal_reason text,
  moderation_lock boolean not null default false,
  source text not null default 'community' check (source in ('community', 'osm', 'import')),
  osm_id text unique,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.places.moderation_lock is 'Set when a moderator restores a place: community votes can no longer auto-remove it.';
comment on column public.places.certification_verified is 'A moderator checked the certification evidence. Votes never change this.';

create index places_location_idx on public.places using gist (location);
create index places_status_idx on public.places (status);
create index places_created_by_idx on public.places (created_by);

-- ---------------------------------------------------------------------------
-- Votes
-- ---------------------------------------------------------------------------
create table public.votes (
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (place_id, user_id)
);
create index votes_user_idx on public.votes (user_id);

-- append-only log used for rate limiting and abuse investigations
create table private.vote_events (
  id bigint generated always as identity primary key,
  place_id uuid not null,
  user_id uuid not null,
  value smallint not null,
  created_at timestamptz not null default now()
);
create index vote_events_user_time_idx on private.vote_events (user_id, created_at);

-- ---------------------------------------------------------------------------
-- Reviews (with optional halal confirmation)
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  rating smallint check (rating between 1 and 5),
  body text not null default '' check (char_length(body) <= 1000),
  halal_confirmed boolean not null default false,
  confirmation_method public.confirmation_method,
  status text not null default 'visible' check (status in ('visible', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, user_id),
  check (halal_confirmed = (confirmation_method is not null)),
  check (rating is not null or char_length(btrim(body)) > 0 or halal_confirmed)
);
create index reviews_place_idx on public.reviews (place_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Reports and moderation log
-- ---------------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  place_id uuid references public.places (id) on delete cascade,
  review_id uuid references public.reviews (id) on delete cascade,
  reporter_id uuid references auth.users (id) on delete set null,
  reason public.report_reason not null,
  details text check (char_length(details) <= 500),
  status public.report_status not null default 'open',
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  resolution_note text check (char_length(resolution_note) <= 500),
  created_at timestamptz not null default now(),
  check (place_id is not null or review_id is not null)
);
create index reports_status_idx on public.reports (status, created_at);

create table public.moderation_events (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  place_id uuid,
  review_id uuid,
  report_id uuid,
  target_user_id uuid,
  note text,
  created_at timestamptz not null default now()
);
comment on table public.moderation_events is 'Audit trail of moderation and automatic removals (actor null = system).';
create index moderation_events_time_idx on public.moderation_events (created_at desc);
