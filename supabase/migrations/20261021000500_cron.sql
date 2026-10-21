-- Daily purge of places removed by the community (or moderators) once their
-- grace period is over. pg_cron is available on every Supabase project; the
-- block is tolerant so that the migration also runs where it is not.
do $outer$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    if exists (select 1 from cron.job where jobname = 'purge-removed-places') then
      perform cron.unschedule('purge-removed-places');
    end if;
    perform cron.schedule('purge-removed-places', '17 3 * * *', 'select private.purge_removed_places()');
  else
    raise notice 'pg_cron is not available: schedule private.purge_removed_places() another way';
  end if;
exception when others then
  raise notice 'pg_cron setup skipped: %', sqlerrm;
end
$outer$;
