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

# 2a. FAIL-CLOSED: without an explicit operator allow-list, the unreconcilable
#     READY row must abort the whole migration and leave the DB untouched.
echo "== 2a. fail-closed negative (expect R5_EMPTY_READY_SNAPSHOT + rollback)"
if psql -q -X -v ON_ERROR_STOP=1 -f "$R5" >"$WORK/failclosed.log" 2>&1; then
  echo "REHEARSAL_FAIL: empty snapshot did NOT abort the migration"; exit 1
fi
grep -q "R5_EMPTY_READY_SNAPSHOT" "$WORK/failclosed.log" \
  || { echo "REHEARSAL_FAIL: wrong abort reason"; cat "$WORK/failclosed.log"; exit 1; }
psql -X -A -t -c "
DO \$\$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema='public' AND table_name='lesson_capability_lifecycle'
                AND column_name='evidence_origin')
  THEN RAISE EXCEPTION 'REHEARSAL_FAIL: aborted migration left schema changes'; END IF;
END \$\$;"
echo "EMPTY_SNAPSHOT_FAIL_CLOSED=PASS"

ALLOW="SET tamkeen.r5_manual_review_allowlist = '99999999-9999-9999-9999-999999999999'"

# R5-R3 negative: a stored ready_hash without a stored ready_snapshot has no
# provable provenance and must roll the whole migration back.
echo "== 2a2. hash without snapshot (expect R5_READY_HASH_WITHOUT_SNAPSHOT + rollback)"
psql -q -X -v ON_ERROR_STOP=1 -c "
UPDATE public.lesson_capability_lifecycle SET ready_hash='deadbeef'
 WHERE capability='tamkeenExplanation' AND lesson_id='55555555-0000-0000-0000-000000000010';"
if psql -q -X -v ON_ERROR_STOP=1 -c "$ALLOW" -f "$R5" >"$WORK/hash_no_snapshot.log" 2>&1; then
  echo "REHEARSAL_FAIL: hash without snapshot did NOT abort"; exit 1
fi
grep -q "R5_READY_HASH_WITHOUT_SNAPSHOT" "$WORK/hash_no_snapshot.log" \
  || { echo "REHEARSAL_FAIL: wrong abort reason"; cat "$WORK/hash_no_snapshot.log"; exit 1; }
psql -q -X -v ON_ERROR_STOP=1 -c "
UPDATE public.lesson_capability_lifecycle SET ready_hash=NULL
 WHERE capability='tamkeenExplanation' AND lesson_id='55555555-0000-0000-0000-000000000010';"
echo "MISSING_SNAPSHOT_WITH_EXISTING_HASH_FAIL_CLOSED=PASS"

# R5-R3 negative: a stored snapshot whose stored hash does not describe it.
echo "== 2a3. snapshot/hash mismatch (expect R5_READY_SNAPSHOT_HASH_MISMATCH + rollback)"
psql -q -X -v ON_ERROR_STOP=1 -c "
UPDATE public.lesson_capability_lifecycle
   SET ready_snapshot='{\"snapshotVersion\":\"v3.snapshot.1\",\"capability\":\"tamkeenExplanation\",\"payload\":[{\"content\":\"x\"}]}'::jsonb,
       ready_hash='0000000000000000000000000000000000000000000000000000000000000000'
 WHERE capability='tamkeenExplanation' AND lesson_id='55555555-0000-0000-0000-000000000011';"
if psql -q -X -v ON_ERROR_STOP=1 -c "$ALLOW" -f "$R5" >"$WORK/hash_mismatch.log" 2>&1; then
  echo "REHEARSAL_FAIL: snapshot/hash mismatch did NOT abort"; exit 1
fi
grep -q "R5_READY_SNAPSHOT_HASH_MISMATCH" "$WORK/hash_mismatch.log" \
  || { echo "REHEARSAL_FAIL: wrong abort reason"; cat "$WORK/hash_mismatch.log"; exit 1; }
psql -q -X -v ON_ERROR_STOP=1 -c "
UPDATE public.lesson_capability_lifecycle SET ready_snapshot=NULL, ready_hash=NULL
 WHERE capability='tamkeenExplanation' AND lesson_id='55555555-0000-0000-0000-000000000011';"
echo "SNAPSHOT_HASH_MISMATCH_FAIL_CLOSED=PASS"



# 2b. Operator reviews the row, allow-lists it explicitly, and re-runs.
echo "== 2b. remediation candidate (R5-R2, with reviewed allow-list)"
psql -q -X -v ON_ERROR_STOP=1 \
  -c "SET tamkeen.r5_manual_review_allowlist = '99999999-9999-9999-9999-999999999999'" \
  -f "$R5"

echo "== 2c. production preflight (READ ONLY) against the remediated state"
psql -q -X -v ON_ERROR_STOP=1 -f "$ROOT/scripts/content-v3/production-preflight-readonly.sql" 2>&1 | tee "$WORK/preflight.log"
grep -q "STOP_PRODUCTION_STATE_INCOMPATIBLE" "$WORK/preflight.log" \
  && { echo "REHEARSAL_FAIL: preflight still blocking"; exit 1; }

run "3. migration 21H (byte-for-byte)" "$H21"
run "4. postverify" "$ROOT/scripts/content-v3/postverify-21h.sql"

echo "== 5. visibility diff + assertions"
psql -q -X -v ON_ERROR_STOP=1 -f "$ROOT/scripts/content-v3/pg17/assert-r5.sql"

