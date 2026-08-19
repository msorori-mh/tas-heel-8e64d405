#!/usr/bin/env bash
# PG17 rehearsal for the Content V3 legacy 20C reconciliation (R5).
#
#   1. legacy fixture (measured production counts)
#   2. remediation candidate (R5)
#   3. migration 21H, byte-for-byte
#   4. postverify
#   5. visibility diff
#
# Runs entirely against a throwaway local PostgreSQL 17 cluster.
# It never touches production.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
WORK="${WORK:-/tmp/v3/pg17}"
PGDATA="$WORK/data"
SOCK="$WORK/sock"
DB=v3rehearsal

R5="$ROOT/supabase/migrations-pending/20260819130000_content_v3_legacy_20c_reconciliation_r5.sql"
H21="$ROOT/supabase/migrations-pending/20260818210000_content_v3_21h_hardened_preflight.sql"
FIXTURE="$ROOT/scripts/content-v3/pg17/fixture-legacy-20c.sql"
SCHEMA="$ROOT/scripts/content-v3/pg17/fixture-schema.generated.sql"

rm -rf "$WORK"; mkdir -p "$PGDATA" "$SOCK"
initdb -D "$PGDATA" -U postgres --no-sync >/dev/null
pg_ctl -D "$PGDATA" -o "-k $SOCK -c listen_addresses=" -l "$WORK/pg.log" -w start >/dev/null
trap 'pg_ctl -D "$PGDATA" -m immediate -w stop >/dev/null 2>&1 || true' EXIT
export PGHOST="$SOCK" PGUSER=postgres PGDATABASE="$DB"
createdb "$DB"

psql -q -v ON_ERROR_STOP=1 -c "SELECT version();" | head -1

run() { echo "== $1"; psql -q -v ON_ERROR_STOP=1 -f "$2"; }

echo "== 0. server"; psql -X -A -t -c "show server_version"

echo "== 1. legacy fixture"
psql -q -X -v ON_ERROR_STOP=1 -v schema_file="$SCHEMA" -f "$FIXTURE"

# Visibility baseline BEFORE, evaluated from the real policy predicates.
psql -X -A -t -c "
CREATE TABLE _vis_before AS
SELECT l.id AS lesson_id, x.capability
  FROM public.lessons l
  JOIN public.lesson_capability_lifecycle x ON x.lesson_id = l.id AND x.status='READY'
 WHERE EXISTS (
   SELECT 1 FROM public.subjects s
     JOIN public.subject_curriculum_tracks sct ON sct.subject_id=s.id AND sct.is_active
     JOIN public.profiles p ON p.curriculum_track_id=sct.curriculum_track_id
    WHERE s.id=l.subject_id AND p.grade_uuid=s.grade_id);" >/dev/null

psql -X -A -t -c "SELECT 'FIXTURE_READY_ROWS=' || count(*) FROM public.lesson_capability_lifecycle WHERE status='READY'"

run "2. remediation candidate (R5)" "$R5"
run "3. migration 21H (byte-for-byte)" "$H21"
run "4. postverify" "$ROOT/scripts/content-v3/postverify-21h.sql"

echo "== 5. visibility diff + assertions"
psql -q -X -v ON_ERROR_STOP=1 -f "$ROOT/scripts/content-v3/pg17/assert-r5.sql"
