-- Regressions for 20261021000600_hardening.sql (second review). Concurrency
-- is covered separately in 04_concurrency_test.sql.
begin;
select plan(23);

select tests.as_superuser();
create temporary table ids (k text primary key, v uuid) on commit drop;
grant all on ids to anon, authenticated;
insert into ids values
  ('owner', tests.create_user('owner@example.ch')),
  ('troll', tests.create_user('troll@example.ch')),
  ('carla', tests.create_user('carla@example.ch')),
  ('dan', tests.create_user('dan@example.ch')),
  ('leaver', tests.create_user('leaver@example.ch')),
  ('mod', tests.create_user('mod@example.ch')),
  ('mod2', tests.create_user('mod2@example.ch'));
update public.profiles set role = 'moderator' where id in ((select v from ids where k = 'mod'), (select v from ids where k = 'mod2'));

-- the API surface ------------------------------------------------------------------
create function pg_temp.executable(r text) returns text[] language sql as $$
  select array_agg(n.nspname || '.' || p.proname order by n.nspname, p.proname)
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname in ('public', 'private')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     and has_function_privilege(r, p.oid, 'execute')
$$;
select is(pg_temp.executable('anon'), array[
  'private.is_moderator', 'public.list_reviews', 'public.nearby_places', 'public.place_detail',
  'public.places_in_bbox', 'public.search_places'],
  'visitors can call exactly the read API (a new function must be revoked or granted explicitly)');
select is(pg_temp.executable('authenticated'), array[
  'private.is_moderator', 'public.admin_set_role', 'public.cast_vote', 'public.create_place', 'public.delete_my_review',
  'public.list_reviews', 'public.mod_ban_user', 'public.mod_delete_place', 'public.mod_list_events',
  'public.mod_list_places', 'public.mod_list_reports', 'public.mod_resolve_report', 'public.mod_set_place_status',
  'public.mod_set_review_status', 'public.mod_suspend_author', 'public.mod_verify_certification', 'public.my_profile',
  'public.nearby_places', 'public.place_detail', 'public.places_in_bbox', 'public.search_places',
  'public.submit_report', 'public.update_my_profile', 'public.update_place', 'public.upsert_review'],
  'members can call exactly the documented API');

-- privacy: no member directory -------------------------------------------------------
select tests.anonymous();
select throws_ok($$ select id, display_name, role, created_at from public.profiles $$, '42501', null,
  'visitors cannot list member ids, roles and sign-up dates');

-- spots -----------------------------------------------------------------------------
select tests.authenticate_as((select v from ids where k = 'owner'));
insert into ids select 'place', (public.create_place('Le Bosphore', 6.6331, 46.5213)).id;
insert into ids select 'fake', (public.create_place('Fake Halal Grill', 6.6400, 46.5250)).id;
insert into ids select 'tags', (public.create_place('Tag Kebab', 6.6200, 46.5200,
  p_cuisine => array['kebab', 'turkish', 'grill', 'falafel', 'burger', 'pizza', 'tacos', 'salad'])).id;
select is((select cardinality(cuisine) from public.place_detail((select v from ids where k = 'tags'))), 6,
  'extra cuisine tags are dropped instead of failing');
select throws_ok($$ select public.create_place('Le Bosphore', 6.6331, 46.5213) $$, '23505', 'duplicate_place',
  'an active spot is still a duplicate');
select tests.authenticate_as((select v from ids where k = 'mod'));
select public.mod_set_place_status((select v from ids where k = 'fake'), 'removed', 'fake listing');
select tests.authenticate_as((select v from ids where k = 'owner'));
select throws_ok($$ select public.create_place('Fake Halal Grill', 6.6400, 46.5250) $$, '23505', 'recently_removed',
  'a removed spot cannot be submitted again while it can still be restored');

-- reviews ----------------------------------------------------------------------------
select throws_ok(
  $$ select public.upsert_review((select v from ids where k = 'place'), 5::smallint, 'Mine is the best', true, 'owner') $$,
  '42501', 'own_place', 'authors cannot review or halal-confirm their own spot');

select tests.authenticate_as((select v from ids where k = 'troll'));
select public.upsert_review((select v from ids where k = 'place'), 1::smallint, 'offensive text', false, null);
select tests.authenticate_as((select v from ids where k = 'mod'));
select public.mod_set_review_status((select id from public.list_reviews((select v from ids where k = 'place')) limit 1), 'hidden', 'offensive');
select tests.authenticate_as((select v from ids where k = 'troll'));
select throws_ok($$ select public.delete_my_review((select v from ids where k = 'place')) $$, '42501', 'forbidden',
  'a review hidden by a moderator cannot be deleted by its author');
select public.upsert_review((select v from ids where k = 'place'), 1::smallint, 'offensive text', false, null);
select tests.anonymous();
select is((select count(*)::int from public.list_reviews((select v from ids where k = 'place'))), 0,
  'posting it again does not undo the moderator''s hide');

select tests.authenticate_as((select v from ids where k = 'carla'));
select public.upsert_review((select v from ids where k = 'place'), 4::smallint, 'certificate on the wall', true, 'certificate');
select tests.as_superuser();
set local session_replication_role = replica;
update public.reviews set updated_at = now() - interval '400 days' where user_id = (select v from ids where k = 'carla');
update public.places set last_confirmed_at = now() - interval '400 days' where id = (select v from ids where k = 'place');
set local session_replication_role = origin;
select tests.authenticate_as((select v from ids where k = 'mod'));
select public.mod_set_review_status((select id from public.list_reviews((select v from ids where k = 'place')) where body like 'certificate%'), 'hidden', null);
select public.mod_set_review_status((select id from public.list_reviews((select v from ids where k = 'place')) where body like 'certificate%'), 'visible', null);
select ok((select last_confirmed_at < now() - interval '399 days' from public.place_detail((select v from ids where k = 'place'))),
  'hiding and showing a review does not make an old halal confirmation look recent');

-- the daily review limit counts new reviews, so corrections stay possible
select tests.as_superuser();
update private.settings set value = '1' where key = 'limit_reviews_per_day';
select tests.authenticate_as((select v from ids where k = 'carla'));
select throws_ok(
  $$ select public.upsert_review((select v from ids where k = 'tags'), 3::smallint, 'second spot today', false, null) $$,
  '54000', 'rate_limited', 'a new review over the daily limit is refused');
select lives_ok(
  $$ select public.upsert_review((select v from ids where k = 'place'), 4::smallint, 'certificate on the wall', false, null) $$,
  'withdrawing a confirmation still works at the limit');
select tests.as_superuser();
update private.settings set value = '20' where key = 'limit_reviews_per_day';

select tests.authenticate_as((select v from ids where k = 'mod'));
select public.mod_set_place_status((select v from ids where k = 'place'), 'hidden', 'checking');
select tests.anonymous();
select is((select count(*)::int from public.list_reviews((select v from ids where k = 'place'))), 0,
  'reviews of a hidden spot are not listed to visitors');
select tests.authenticate_as((select v from ids where k = 'mod'));
select public.mod_set_place_status((select v from ids where k = 'place'), 'active', 'fine');

-- reports keep their evidence; moderators can suspend the author ---------------------------
select tests.authenticate_as((select v from ids where k = 'dan'));
select public.upsert_review((select v from ids where k = 'place'), 1::smallint, 'rude words', false, null);
select tests.authenticate_as((select v from ids where k = 'carla'));
select public.submit_report('offensive', p_review_id => (select id from public.list_reviews((select v from ids where k = 'place')) where body = 'rude words'));
select throws_ok($$ select public.submit_report('spam', p_place_id => (select v from ids where k = 'fake')) $$, 'P0002', 'not_found',
  'a removed spot cannot be reported');
select tests.authenticate_as((select v from ids where k = 'dan'));
select public.delete_my_review((select v from ids where k = 'place'));
select tests.authenticate_as((select v from ids where k = 'mod'));
select results_eq(
  $$ select review_body, review_deleted, can_suspend_author from public.mod_list_reports() where is_review $$,
  $$ values ('rude words', true, true) $$,
  'the reported text stays visible to moderators after its author deletes it');
select lives_ok(
  $$ select public.mod_suspend_author((select id from public.mod_list_reports() where is_review), 7, 'insults') $$,
  'moderators suspend the author of reported content');
select ok((select author_suspended from public.mod_list_reports() where is_review), 'the console shows the suspension');
select tests.authenticate_as((select v from ids where k = 'dan'));
select throws_ok($$ select public.cast_vote((select v from ids where k = 'place'), -1::smallint) $$, '42501', 'account_suspended',
  'the suspended author cannot write');

select tests.authenticate_as((select v from ids where k = 'mod2'));
select public.upsert_review((select v from ids where k = 'place'), 2::smallint, 'moderator opinion', false, null);
select tests.authenticate_as((select v from ids where k = 'carla'));
select public.submit_report('other', p_review_id => (select id from public.list_reviews((select v from ids where k = 'place')) where body = 'moderator opinion'));
select tests.authenticate_as((select v from ids where k = 'mod'));
select is((select can_suspend_author from public.mod_list_reports() where review_body = 'moderator opinion'), false,
  'the console does not offer to suspend a moderator');
select throws_ok(
  $$ select public.mod_suspend_author((select id from public.mod_list_reports() where review_body = 'moderator opinion'), 7, null) $$,
  '42501', 'forbidden', 'moderators cannot suspend another moderator');

-- certification ----------------------------------------------------------------------------
select throws_ok($$ select public.mod_verify_certification((select v from ids where k = 'place'), true, null) $$, '22023', 'invalid_status',
  'only a claimed certificate can be verified');
select tests.authenticate_as((select v from ids where k = 'owner'));
insert into ids select 'certified', (public.create_place('Halal Corner', 6.6250, 46.5180, p_halal_level => 'partial',
  p_certification => 'certified', p_certifier => 'Halal Control')).id;
select tests.authenticate_as((select v from ids where k = 'mod'));
select public.mod_verify_certification((select v from ids where k = 'certified'), true, null);
select tests.authenticate_as((select v from ids where k = 'owner'));
select ok(not (public.update_place((select v from ids where k = 'certified'), 'Halal Corner', 'restaurant', '{}', null, null, null, null, null,
    'full', 'certified', 'Halal Control', null)).certification_verified,
  'raising the halal level after verification needs a new verification');

-- the vote log follows the account and expires -------------------------------------------
select tests.authenticate_as((select v from ids where k = 'leaver'));
select public.cast_vote((select v from ids where k = 'place'), -1::smallint);
select tests.as_superuser();
delete from auth.users where id = (select v from ids where k = 'leaver');
insert into private.vote_events (place_id, user_id, value, created_at)
values ((select v from ids where k = 'place'), (select v from ids where k = 'carla'), 1, now() - interval '31 days');
select private.prune_vote_events();
select is((select count(*)::int from private.vote_events
            where user_id = (select v from ids where k = 'leaver') or created_at < now() - interval '30 days'), 0,
  'the vote log is deleted with the account and after 30 days');

select * from finish();
rollback;
