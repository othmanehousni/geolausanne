-- Row level security and grants.
--
-- Clients never write tables directly: all writes go through the
-- SECURITY DEFINER RPCs in 20261021000300_functions.sql. Table privileges are
-- therefore revoked from the API roles, and RLS policies describe what a role
-- could read if a grant were ever added (defence in depth).

alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.votes enable row level security;
alter table public.reviews enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_events enable row level security;
alter table private.settings enable row level security;
alter table private.vote_events enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

create policy "profiles are public" on public.profiles
  for select to anon, authenticated using (true);

create policy "active places are public; creators and moderators see more" on public.places
  for select to anon, authenticated
  using (status = 'active' or created_by = (select auth.uid()) or (select private.is_moderator()));

create policy "users see their own votes" on public.votes
  for select to authenticated using (user_id = (select auth.uid()));

create policy "visible reviews are public" on public.reviews
  for select to anon, authenticated
  using (status = 'visible' or user_id = (select auth.uid()) or (select private.is_moderator()));

create policy "moderators read reports" on public.reports
  for select to authenticated using ((select private.is_moderator()));

create policy "moderators read the moderation log" on public.moderation_events
  for select to authenticated using ((select private.is_moderator()));

-- Narrow read grants (no PII: created_by / user ids are not granted).
grant select (display_name, role, created_at, id) on public.profiles to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Function privileges: deny by default, then allow the public API.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_moderator() to anon, authenticated;

grant execute on function public.places_in_bbox(double precision, double precision, double precision, double precision, integer) to anon, authenticated;
grant execute on function public.place_detail(uuid) to anon, authenticated;
grant execute on function public.search_places(text, integer) to anon, authenticated;
grant execute on function public.nearby_places(double precision, double precision, double precision) to anon, authenticated;
grant execute on function public.list_reviews(uuid, integer) to anon, authenticated;

grant execute on function public.create_place(text, double precision, double precision, public.place_category, text[], real, text, text, text, text, text, public.halal_level, public.halal_certification, text, boolean) to authenticated;
grant execute on function public.update_place(uuid, text, public.place_category, text[], text, text, text, text, text, public.halal_level, public.halal_certification, text, boolean) to authenticated;
grant execute on function public.cast_vote(uuid, smallint) to authenticated;
grant execute on function public.upsert_review(uuid, smallint, text, boolean, public.confirmation_method) to authenticated;
grant execute on function public.delete_my_review(uuid) to authenticated;
grant execute on function public.submit_report(public.report_reason, uuid, uuid, text) to authenticated;
grant execute on function public.my_profile() to authenticated;
grant execute on function public.update_my_profile(text) to authenticated;

-- moderation RPCs check the caller's role themselves
grant execute on function public.mod_list_reports(public.report_status, integer) to authenticated;
grant execute on function public.mod_resolve_report(uuid, public.report_status, text) to authenticated;
grant execute on function public.mod_set_place_status(uuid, public.place_status, text) to authenticated;
grant execute on function public.mod_verify_certification(uuid, boolean, text) to authenticated;
grant execute on function public.mod_delete_place(uuid, text) to authenticated;
grant execute on function public.mod_set_review_status(uuid, text, text) to authenticated;
grant execute on function public.mod_list_places(public.place_status, integer) to authenticated;
grant execute on function public.mod_list_events(integer) to authenticated;
grant execute on function public.mod_ban_user(uuid, timestamptz, text) to authenticated;
grant execute on function public.admin_set_role(uuid, public.app_role) to authenticated;

-- Removes Supabase's default grants to anon and authenticated on functions
-- created later in public. PostgreSQL's own EXECUTE-to-PUBLIC default is
-- global and cannot be revoked per schema, so every new function is revoked
-- explicitly (see 000600) and supabase/tests/03_hardening_test.sql lists the
-- functions each API role can call.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
