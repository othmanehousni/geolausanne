begin;
select plan(24);

select tests.as_superuser();
create temporary table ids (k text primary key, v uuid) on commit drop;
grant all on ids to anon, authenticated;
insert into ids values
  ('owner', tests.create_user('owner@example.ch')),
  ('carla', tests.create_user('carla@example.ch')),
  ('dan', tests.create_user('dan@example.ch')),
  ('troll', tests.create_user('troll@example.ch')),
  ('mod', tests.create_user('mod@example.ch')),
  ('admin', tests.create_user('admin@example.ch'));
update public.profiles set role = 'moderator' where id = (select v from ids where k = 'mod');
update public.profiles set role = 'admin' where id = (select v from ids where k = 'admin');

select tests.authenticate_as((select v from ids where k = 'owner'));
insert into ids select 'place', (public.create_place('Le Bosphore', 6.6331, 46.5213, p_halal_level => 'partial')).id;

-- reviews & confirmations ---------------------------------------------------------
select tests.authenticate_as((select v from ids where k = 'carla'));
select throws_ok(
  $$ select public.upsert_review((select v from ids where k = 'place'), 5::smallint, 'Great', true, null) $$,
  '22023', 'confirmation_method_required', 'a halal confirmation needs a method');
select lives_ok(
  $$ select public.upsert_review((select v from ids where k = 'place'), 5::smallint, 'Excellent, certificate on the wall.', true, 'certificate') $$,
  'a user can review and confirm');
select tests.authenticate_as((select v from ids where k = 'dan'));
select lives_ok(
  $$ select public.upsert_review((select v from ids where k = 'place'), 3::smallint, 'OK', false, null) $$,
  'a second review');
select is((select review_count from public.place_detail((select v from ids where k = 'place'))), 2, 'review count');
select is((select avg_rating from public.place_detail((select v from ids where k = 'place'))), 4.00::numeric, 'average rating');
select is((select confirmations from public.place_detail((select v from ids where k = 'place'))), 1, 'confirmation count');
select lives_ok(
  $$ select public.upsert_review((select v from ids where k = 'place'), 4::smallint, 'Asked the staff: all meat is halal.', true, 'asked_staff') $$,
  'reviews are editable (one per user and place)');
select is((select confirmations from public.place_detail((select v from ids where k = 'place'))), 2, 'editing updates confirmations');
select is((select count(*)::int from public.list_reviews((select v from ids where k = 'place'))), 2, 'reviews are listed');
select ok((select is_mine from public.list_reviews((select v from ids where k = 'place')) limit 1), 'my own review comes first');

-- reports ---------------------------------------------------------------------------
select tests.authenticate_as((select v from ids where k = 'troll'));
select lives_ok(
  $$ select public.upsert_review((select v from ids where k = 'place'), 1::smallint, 'spam spam spam', false, null) $$,
  'a bad review');
select tests.authenticate_as((select v from ids where k = 'carla'));
select lives_ok(
  $$ select public.submit_report('spam', p_review_id => (select id from public.list_reviews((select v from ids where k = 'place')) where body = 'spam spam spam')) $$,
  'users can report a review');
select lives_ok(
  $$ select public.submit_report('spam', p_review_id => (select id from public.list_reviews((select v from ids where k = 'place')) where body = 'spam spam spam'), p_details => 'same troll') $$,
  'reporting twice updates the open report');
select throws_ok($$ select * from public.mod_list_reports() $$, '42501', 'forbidden', 'only moderators list reports');

select tests.authenticate_as((select v from ids where k = 'mod'));
select is((select count(*)::int from public.mod_list_reports()), 1, 'moderators see the open report once');
select lives_ok(
  $$ select public.mod_set_review_status((select review_id from public.mod_list_reports() limit 1), 'hidden', 'spam') $$,
  'moderators can hide a review');
select lives_ok(
  $$ select public.mod_resolve_report((select id from public.mod_list_reports() limit 1), 'resolved', 'hidden') $$,
  'and resolve the report');
select is((select review_count from public.place_detail((select v from ids where k = 'place'))), 2, 'hidden reviews no longer count');
select tests.anonymous();
select is((select count(*)::int from public.list_reviews((select v from ids where k = 'place'))), 2, 'hidden reviews are not public');

-- certification is independent from votes ----------------------------------------------
select tests.authenticate_as((select v from ids where k = 'mod'));
select is((public.mod_verify_certification((select v from ids where k = 'place'), true, 'checked the certifier list')).certification,
  'certified'::public.halal_certification, 'moderators verify certifications');

-- bans and roles ---------------------------------------------------------------------------
select lives_ok($$ select public.mod_ban_user((select v from ids where k = 'troll'), now() + interval '7 days', 'spam') $$,
  'moderators can suspend users');
select tests.authenticate_as((select v from ids where k = 'troll'));
select throws_ok($$ select public.submit_report('other', p_place_id => (select v from ids where k = 'place')) $$,
  '42501', 'account_suspended', 'suspended users cannot write');
select tests.authenticate_as((select v from ids where k = 'mod'));
select throws_ok($$ select public.admin_set_role((select v from ids where k = 'dan'), 'moderator') $$,
  '42501', 'forbidden', 'only admins grant roles');
select tests.authenticate_as((select v from ids where k = 'admin'));
select lives_ok($$ select public.admin_set_role((select v from ids where k = 'dan'), 'moderator') $$, 'admins grant roles');

select * from finish();
rollback;
