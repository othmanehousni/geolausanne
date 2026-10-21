-- Concurrent writes (20261021000600_hardening.sql). Two side sessions (dblink)
-- write at the same time; the first one holds its transaction open while the
-- second runs, then commits. Fixtures are committed through a third session
-- (other sessions cannot see this test's transaction) and deleted at the end.
begin;
select plan(3);
create extension if not exists dblink;

-- Side sessions connect as "postgres" when that role exists: on CI the server
-- (OS user postgres) authenticates its own socket connections by peer.
create function pg_temp.conninfo(app text) returns text language sql as $$
  select format('host=%s port=%s dbname=%s user=%s application_name=%s',
                split_part(current_setting('unix_socket_directories'), ',', 1),
                current_setting('port'), current_database(),
                case when exists (select 1 from pg_roles where rolname = 'postgres') then 'postgres' else current_user end,
                app)
$$;
-- wait until a side session is blocked on a lock or done (at most ~5 s)
create function pg_temp.settle(conn text) returns void language plpgsql as $$
begin
  for i in 1..100 loop
    exit when dblink_is_busy(conn) = 0
           or exists (select 1 from pg_stat_activity a where a.application_name = conn and a.wait_event_type = 'Lock');
    perform pg_sleep(0.05);
  end loop;
end $$;
-- collect every result of an asynchronous multi-statement query
create function pg_temp.drain(conn text) returns void language plpgsql as $$
declare n int;
begin
  loop
    select count(*) into n from dblink_get_result(conn, false) as t(x text);
    exit when n = 0;
  end loop;
  perform dblink_exec(conn, 'rollback', false);
end $$;

select dblink_connect('fx', pg_temp.conninfo('fx'));
select dblink_exec('fx', $$
  create table public.concurrency_fixture (k text primary key, v uuid);
  insert into public.concurrency_fixture values
    ('owner', tests.create_user('cc-owner@example.ch')),
    ('a', tests.create_user('cc-a@example.ch')),
    ('b', tests.create_user('cc-b@example.ch')),
    ('spammer', tests.create_user('cc-spam@example.ch')),
    ('place', gen_random_uuid());
  insert into public.places (id, name, location, created_by)
    select v, 'Concurrency Kebab', extensions.st_setsrid(extensions.st_makepoint(6.6331, 46.5213), 4326),
           (select v from public.concurrency_fixture where k = 'owner')
      from public.concurrency_fixture where k = 'place';
  -- the spammer already submitted 4 of the 5 spots allowed per day
  insert into public.places (name, location, created_by)
    select 'Spam ' || g, extensions.st_setsrid(extensions.st_makepoint(6.55 + g * 0.01, 46.60), 4326),
           (select v from public.concurrency_fixture where k = 'spammer')
      from generate_series(1, 4) g;
  grant select on public.concurrency_fixture to anon, authenticated;
$$);
select dblink_connect('a', pg_temp.conninfo('a'));
select dblink_connect('b', pg_temp.conninfo('b'));

-- votes: A upvotes and keeps its transaction open while B upvotes ----------------------
select dblink_exec('a', 'begin');
select * from dblink('a', $$ select tests.authenticate_as((select v from public.concurrency_fixture where k = 'a'))::text $$) as t(x text);
select * from dblink('a', $$ select public.cast_vote((select v from public.concurrency_fixture where k = 'place'), 1::smallint)::text $$) as t(x text);
select dblink_send_query('b', $$
  begin;
  select tests.authenticate_as((select v from public.concurrency_fixture where k = 'b'));
  select public.cast_vote((select v from public.concurrency_fixture where k = 'place'), 1::smallint);
  commit; $$);
select pg_temp.settle('b');
select dblink_exec('a', 'commit');
select pg_temp.drain('b');
select is(
  (select n from dblink('fx', $$ select upvotes from public.places where name = 'Concurrency Kebab' $$) as t(n int)),
  2, 'two simultaneous upvotes are both counted');

-- reviews: the same pattern ------------------------------------------------------------
select dblink_exec('a', 'begin');
select * from dblink('a', $$ select tests.authenticate_as((select v from public.concurrency_fixture where k = 'a'))::text $$) as t(x text);
select * from dblink('a', $$ select public.upsert_review((select v from public.concurrency_fixture where k = 'place'), 5::smallint, 'certificate', true, 'certificate')::text $$) as t(x text);
select dblink_send_query('b', $$
  begin;
  select tests.authenticate_as((select v from public.concurrency_fixture where k = 'b'));
  select public.upsert_review((select v from public.concurrency_fixture where k = 'place'), 1::smallint, 'meh', false, null);
  commit; $$);
select pg_temp.settle('b');
select dblink_exec('a', 'commit');
select pg_temp.drain('b');
select is(
  (select n from dblink('fx', $$ select review_count * 10 + confirmations from public.places where name = 'Concurrency Kebab' $$) as t(n int)),
  21, 'two simultaneous reviews: both counted, the confirmation kept');

-- rate limits: two simultaneous submissions cannot both take the last slot ---------------
select dblink_exec('a', 'begin');
select * from dblink('a', $$ select tests.authenticate_as((select v from public.concurrency_fixture where k = 'spammer'))::text $$) as t(x text);
select * from dblink('a', $$ select public.create_place('Spam five', 6.70, 46.60)::text $$) as t(x text);
select dblink_send_query('b', $$
  begin;
  select tests.authenticate_as((select v from public.concurrency_fixture where k = 'spammer'));
  select public.create_place('Spam six', 6.75, 46.61);
  commit; $$);
select pg_temp.settle('b');
select dblink_exec('a', 'commit');
select pg_temp.drain('b');
select is(
  (select n from dblink('fx', $$ select count(*)::int from public.places
                                  where created_by = (select v from public.concurrency_fixture where k = 'spammer') $$) as t(n int)),
  5, 'simultaneous requests cannot exceed limit_places_per_day');

select dblink_exec('fx', $$
  delete from public.moderation_events where place_id in
    (select id from public.places where created_by in (select v from public.concurrency_fixture));
  delete from public.places where created_by in (select v from public.concurrency_fixture);
  delete from auth.users where id in (select v from public.concurrency_fixture);
  drop table public.concurrency_fixture;
$$);
select dblink_disconnect('a');
select dblink_disconnect('b');
select dblink_disconnect('fx');

select * from finish();
rollback;
