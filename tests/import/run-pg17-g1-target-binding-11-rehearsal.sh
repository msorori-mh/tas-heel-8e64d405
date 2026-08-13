#!/usr/bin/env bash
# =============================================================================
# G1_PUBLISHED_REVISION_TARGET_BINDING_11 — local PostgreSQL 17 rehearsal
#
# Never touches the shared production datastore. It builds a disposable cluster,
# applies the EXACT migration chain, then exercises the pending stage-11
# migration in three independent databases cloned from the same pre-11 base:
#
#   smoke     : apply 11 twice (idempotency) + runtime binding matrix
#   bf_ok     : deterministic legacy targets  -> backfill must bind them exactly
#   bf_ambig  : ambiguous legacy targets      -> migration must abort fail-closed
#
#   bash tests/import/run-pg17-g1-target-binding-11-rehearsal.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN="${TMPDIR:-/tmp}/pg17-g1-11"
DATA="$RUN/data"; SOCK="$RUN/sock"
MIG_11="supabase/migrations-pending/20260814010000_g1_published_revision_target_binding_11.sql"
FAILURES=0

CHAIN=(
  tests/import/fixtures/pg17-baseline-schema.sql
  tests/import/fixtures/pg17-prereq-resource-code.sql
  tests/import/fixtures/pg17-prereq-qb-runtime.sql
  supabase/migrations/20260801120000_qb01_question_bank_schema_foundation.sql
  supabase/migrations-pending/20260813010000_import_staging_and_execution_03.sql
  supabase/migrations/20260813004255_4686d20e-c114-446a-b037-153d06eb2b80.sql
  supabase/migrations/20260813004424_3a452fe1-737d-43ad-8c58-dd9719dca1e1.sql
  supabase/migrations/20260813004908_b0e9f888-f786-4956-a458-1e3b859fdfe9.sql
  supabase/migrations/20260813005024_fc77a965-3b6a-4be5-9b91-05bb53145606.sql
  supabase/migrations/20260813005146_a5f7a00c-fa9b-4bce-a92a-bbf5d6b4bde4.sql
  supabase/migrations/20260813005253_999224a3-eb72-4d72-9202-aed5ab23ca38.sql
)

rm -rf "$DATA" "$SOCK"; mkdir -p "$SOCK"
initdb -D "$DATA" -U postgres --auth=trust -E UTF8 >/dev/null
pg_ctl -D "$DATA" -o "-k $SOCK -h ''" -w -l "$DATA/pg.log" start >/dev/null
trap 'pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true' EXIT

cd "$ROOT"
psql_db() { psql -h "$SOCK" -U postgres -d "$1" -v ON_ERROR_STOP=1 -q -f "$2"; }

createdb -h "$SOCK" -U postgres base
echo "== chain (pre stage-11 base) =="
for f in "${CHAIN[@]}"; do
  echo "--- $f"
  psql_db base "$f" >/dev/null
done

clone() { createdb -h "$SOCK" -U postgres -T base "$1"; }
clone smoke; clone bf_ok; clone bf_ambig

echo
echo "== A. smoke db: apply stage 11 =="
psql_db smoke "$MIG_11" >/dev/null && echo "PASS A1 stage-11 migration applied"
echo "== A2. re-apply (idempotency) =="
if psql_db smoke "$MIG_11" >/dev/null 2>&1; then
  echo "PASS A2 stage-11 migration is re-appliable"
else
  echo "FAIL A2 re-apply failed"; FAILURES=$((FAILURES+1))
fi

echo
echo "== B. runtime binding matrix =="
set +e
OUT="$(psql -h "$SOCK" -U postgres -d smoke -v ON_ERROR_STOP=1 -q \
        -f tests/import/fixtures/pg17-g1-target-binding-smoke.sql 2>&1)"
RC=$?
set -e
echo "$OUT" | grep -E 'PASS|FAIL|ERROR' || true
[ $RC -ne 0 ] && { echo "FAIL B smoke aborted"; FAILURES=$((FAILURES+1)); }

echo
echo "== C. deterministic backfill =="
psql_db bf_ok tests/import/fixtures/pg17-g1-target-binding-backfill-seed-ok.sql >/dev/null
set +e
psql_db bf_ok "$MIG_11" >/tmp/bf_ok.log 2>&1
RC=$?
set -e
if [ $RC -ne 0 ]; then
  echo "FAIL C stage-11 aborted on deterministic data"; tail -5 /tmp/bf_ok.log; FAILURES=$((FAILURES+1))
else
  set +e
  OUT="$(psql -h "$SOCK" -U postgres -d bf_ok -v ON_ERROR_STOP=1 -q \
          -f tests/import/fixtures/pg17-g1-target-binding-backfill-verify.sql 2>&1)"
  RC=$?
  set -e
  echo "$OUT" | grep -E 'PASS|FAIL|ERROR' || true
  [ $RC -ne 0 ] && { echo "FAIL C backfill verification failed"; FAILURES=$((FAILURES+1)); }
fi

echo
echo "== D. fail-closed backfill on ambiguous data =="
psql_db bf_ambig tests/import/fixtures/pg17-g1-target-binding-backfill-seed-ambiguous.sql >/dev/null
set +e
psql_db bf_ambig "$MIG_11" >/tmp/bf_ambig.log 2>&1
RC=$?
set -e
if [ $RC -eq 0 ]; then
  echo "FAIL D migration applied on ambiguous data"; FAILURES=$((FAILURES+1))
elif grep -q 'G1_BACKFILL_AMBIGUOUS_TARGETS' /tmp/bf_ambig.log; then
  echo "PASS D1 migration aborted with G1_BACKFILL_AMBIGUOUS_TARGETS"
  LEFT="$(psql -h "$SOCK" -U postgres -d bf_ambig -tAc \
    "SELECT count(*) FROM information_schema.columns WHERE table_schema='public'
       AND table_name='question_targets' AND column_name='revision_id'")"
  ROWS="$(psql -h "$SOCK" -U postgres -d bf_ambig -tAc "SELECT count(*) FROM public.question_targets")"
  if [ "$LEFT" = "0" ] && [ "$ROWS" = "1" ]; then
    echo "PASS D2 aborted transaction left no partial schema and deleted no data"
  else
    echo "FAIL D2 partial state after abort (col=$LEFT rows=$ROWS)"; FAILURES=$((FAILURES+1))
  fi
else
  echo "FAIL D migration failed for an unexpected reason"; tail -5 /tmp/bf_ambig.log; FAILURES=$((FAILURES+1))
fi

echo
FAILURES=$((FAILURES + $(echo "${OUT:-}" | grep -c 'FAIL' || true)))
if [ "$FAILURES" -eq 0 ]; then
  echo "REHEARSAL RESULT: PASS"
else
  echo "REHEARSAL RESULT: FAIL ($FAILURES)"; exit 1
fi
