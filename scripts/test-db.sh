#!/usr/bin/env bash
# Apply every Supabase migration to a throwaway database on a plain
# PostgreSQL + PostGIS + pgTAP server and run the pgTAP suite.
# Connection settings come from the usual PG* variables (PGHOST, PGPORT, PGUSER...).
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${DB:-geolausanne_test}"
PSQL=(psql -X -q -v ON_ERROR_STOP=1 -d "$DB")

dropdb --if-exists --force "$DB"
createdb "$DB"
"${PSQL[@]}" -f supabase/test-shim/supabase-auth-shim.sql
for migration in supabase/migrations/*.sql; do
  echo "applying ${migration}"
  "${PSQL[@]}" -f "$migration"
done
"${PSQL[@]}" -c "create extension if not exists pgtap"
"${PSQL[@]}" -f supabase/tests/00_helpers.sql
pg_prove -d "$DB" --verbose supabase/tests/[0-9][1-9]_*_test.sql
