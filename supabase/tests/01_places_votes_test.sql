begin;
select plan(35);

-- fixtures ------------------------------------------------------------------
select tests.as_superuser();
create temporary table ids (k text primary key, v uuid) on commit drop;
grant all on ids to anon, authenticated;
insert into ids values
  ('alice', tests.create_user('alice@example.ch')),
  ('bob', tests.create_user('bob@example.ch')),
  ('newbie', tests.create_user('newbie@example.ch', interval '1 minute')),
  ('mod', tests.create_user('mod@example.ch'));
insert into ids select 'voter' || g, tests.create_user('voter' || g || '@example.ch') from generate_series(1, 8) g;
update public.profiles set role = 'moderator' where id = (select v from ids where k = 'mod');

select is((select count(*)::int from public.profiles), 12, 'a profile is created for every new auth user');
select is((select display_name from public.profiles where id = (select v from ids where k = 'alice')), 'alice', 'display name comes from user metadata');
insert into auth.users (id, email, raw_user_meta_data, created_at)
values ('00000000-0000-4000-8000-0000000000aa', 'carol.private@example.ch', '{"full_name": "Carol Private"}'::jsonb, now());
select matches(
  (select display_name from public.profiles where id = '00000000-0000-4000-8000-0000000000aa'),
  '^member-[0-9a-f]{6}$',
  'without a chosen name the public name is a pseudonym, never the e-mail or the OAuth name');

-- anonymous visitors ---------------------------------------------------------
select tests.anonymous();
select throws_ok(
  $$ select public.create_place('Kebab du Flon', 6.6285, 46.521) $$,
  '42501', null, 'anonymous visitors cannot create places');
select is((select count(*)::int from public.places_in_bbox(6.5, 46.4, 6.8, 46.7)), 0, 'map query works anonymously');
select throws_ok($$ select * from public.places $$, '42501', null, 'tables are not directly readable');

-- creating places --------------------------------------------------------------
select tests.authenticate_as((select v from ids where k = 'alice'));
select lives_ok(
  $$ insert into ids select 'kebab', (public.create_place(
       p_name => '  Kebab   du Flon ', p_lon => 6.6285, p_lat => 46.5210, p_category => 'fast_food',
       p_cuisine => array['Kebab', 'turkish', 'kebab'], p_halal_level => 'full', p_certification => 'self_declared')).id $$,
  'a signed-in user can create a place');
select is((select name from public.place_detail((select v from ids where k = 'kebab'))), 'Kebab du Flon', 'names are trimmed and whitespace-collapsed');
select is((select cuisine from public.place_detail((select v from ids where k = 'kebab'))), array['kebab', 'turkish'], 'cuisine tags are normalised and deduplicated');
select ok(
  (select abs(easting - 2537834.4) < 1.5 and abs(northing - 1152510.7) < 1.5 from public.place_detail((select v from ids where k = 'kebab'))),
  'LV95 coordinates are returned for the 3D world');
select throws_ok(
  $$ select public.create_place('Kebab du Flon!', 6.62852, 46.52101) $$,
  '23505', 'duplicate_place', 'a near-identical place nearby is rejected as a duplicate');
select throws_ok(
  $$ select public.create_place('Döner Zurich', 8.54, 47.37) $$,
  '22023', 'outside_service_area', 'places outside the Lausanne area are rejected');
select throws_ok($$ select public.create_place('x', 6.63, 46.52) $$, '22023', 'invalid_name', 'names need two characters');
select lives_ok($$ select public.create_place('Boucherie Pontaise', 6.6255, 46.5300, p_category => 'butcher') $$, 'second place');
select lives_ok($$ select public.create_place('Tacos Gare', 6.6291, 46.5168) $$, 'third place');
select lives_ok($$ select public.create_place('Pita Ouchy', 6.6267, 46.5070) $$, 'fourth place');
select lives_ok($$ select public.create_place('Grill Bel-Air', 6.6290, 46.5225) $$, 'fifth place');
select throws_ok($$ select public.create_place('Sixth Spot', 6.6400, 46.5300) $$, '54000', 'rate_limited', 'at most five places per day');
select is((select count(*)::int from public.search_places('kebab flon')), 1, 'fuzzy search finds the place');
select is((select count(*)::int from public.search_places('KEBAB')), 1, 'search is case-insensitive');

-- voting -------------------------------------------------------------------------
select throws_ok(
  $$ select public.cast_vote((select v from ids where k = 'kebab'), 1::smallint) $$,
  '42501', 'own_place', 'creators cannot vote on their own place');
select tests.authenticate_as((select v from ids where k = 'newbie'));
select throws_ok(
  $$ select public.cast_vote((select v from ids where k = 'kebab'), 1::smallint) $$,
  '42501', 'account_too_new', 'brand new accounts must wait before voting');
select tests.authenticate_as((select v from ids where k = 'bob'));
select is((public.cast_vote((select v from ids where k = 'kebab'), 1::smallint)).upvotes, 1, 'an upvote is counted');
select is((public.cast_vote((select v from ids where k = 'kebab'), 1::smallint)).upvotes, 1, 'voting twice the same way is idempotent');
select is((public.cast_vote((select v from ids where k = 'kebab'), -1::smallint)).score, -1, 'a vote can be switched');
select is((public.cast_vote((select v from ids where k = 'kebab'), 0::smallint)).score, 0, 'a vote can be cleared');
select throws_ok($$ insert into public.votes values ((select v from ids where k = 'kebab'), auth.uid(), 1) $$,
  '42501', null, 'votes cannot be written directly');

-- community removal ----------------------------------------------------------------
select tests.as_superuser();
do $$
declare
  r record;
begin
  for r in select v from ids where k like 'voter%' order by k limit 4 loop
    perform tests.authenticate_as(r.v);
    perform public.cast_vote((select v from ids where k = 'kebab'), -1::smallint);
    perform tests.as_superuser();
  end loop;
end
$$;
select is((select status from public.places where id = (select v from ids where k = 'kebab')), 'active'::public.place_status,
  'four downvotes are not enough');
select tests.authenticate_as((select v from ids where k = 'voter5'));
select is((public.cast_vote((select v from ids where k = 'kebab'), -1::smallint)).status, 'removed'::public.place_status,
  'the fifth downvote removes the place');
select tests.anonymous();
select is((select count(*)::int from public.places_in_bbox(6.5, 46.4, 6.8, 46.7) where name = 'Kebab du Flon'), 0,
  'removed places disappear from the map');
select tests.authenticate_as((select v from ids where k = 'mod'));
select is((select count(*)::int from public.mod_list_places('removed')), 1, 'moderators can review removed places');
select is((public.mod_set_place_status((select v from ids where k = 'kebab'), 'active', 'certificate checked in person')).status,
  'active'::public.place_status, 'moderators can restore a place');
select tests.authenticate_as((select v from ids where k = 'voter6'));
select is((public.cast_vote((select v from ids where k = 'kebab'), -1::smallint)).status, 'active'::public.place_status,
  'a restored place is protected from further auto-removal');

-- purge ------------------------------------------------------------------------------
select tests.as_superuser();
update public.places set status = 'removed', removed_at = now() - interval '30 days'
 where name = 'Tacos Gare';
select is(private.purge_removed_places(), 1, 'removed places are deleted after the grace period');
select is((select count(*)::int from public.moderation_events where action in ('auto_remove', 'place_active', 'purge')), 3,
  'automatic and manual moderation is logged');

select * from finish();
rollback;
