-- Extensions live in the dedicated "extensions" schema, as on every Supabase project.
create schema if not exists extensions;

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Internal schema: helpers, triggers and settings that must never be exposed
-- through the PostgREST API (only "public" is exposed).
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to postgres, service_role;
