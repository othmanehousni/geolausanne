-- Shared test helpers (loaded before every pgTAP file by scripts/test-db.sh;
-- `supabase test db` users can paste it into each test's preamble).
-- They live in a "tests" schema that is dropped with the transaction.
create schema if not exists tests;

create or replace function tests.create_user(email text, age interval default interval '30 days')
returns uuid
language plpgsql
as $$
declare
  uid uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_user_meta_data, created_at)
  values (uid, email, jsonb_build_object('display_name', split_part(email, '@', 1)), now() - age);
  return uid;
end;
$$;

create or replace function tests.authenticate_as(uid uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end;
$$;

create or replace function tests.anonymous()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end;
$$;

create or replace function tests.as_superuser()
returns void
language plpgsql
as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end;
$$;

grant usage on schema tests to anon, authenticated;
grant execute on all functions in schema tests to anon, authenticated;
