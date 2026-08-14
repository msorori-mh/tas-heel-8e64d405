#!/usr/bin/env bash
# =============================================================================
# MINISTERIAL_EXAMS_END_TO_END_CLOSURE_14H — local PostgreSQL 17 rehearsal
#
# Verification only. Replays the whole 14A→14G chain on a disposable cluster and
# drives the real RPCs end to end (M01/M02 → publish → student attempts →
# results → 14F analytics → 14G repeated questions).
#
# Never touches the shared datastore.
#   bash tests/import/run-pg17-ministerial-e2e-closure-14h-rehearsal.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN="${TMPDIR:-/tmp}/pg17-14h"
DATA="$RUN/data"; SOCK="$RUN/sock"
FAILURES=0
MIN_PASS=101

CHAIN=(
  tests/import/fixtures/pg17-baseline-schema.sql
  tests/import/fixtures/pg17-prereq-13c-14b-dependencies.sql
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
  supabase/migrations/20260813201920_99aedcc6-49ad-4dac-aed7-7f3bda1621cb.sql
  supabase/migrations/20260813221804_ff8b3137-d6db-4d26-a679-1d4fa2766d92.sql
  supabase/migrations/20260814011809_33bebe6e-ad5c-4d20-8288-e79d98ce9735.sql
  supabase/migrations/20260814012432_88ef196b-8b25-4bb5-8333-e1ed6085b546.sql
  supabase/migrations/20260814020000_content_entry_readiness_13.sql
  supabase/migrations/20260814191249_40464e5c-d6f2-4bf1-b799-85084cf854c0.sql
  supabase/migrations/20260814191412_e12db419-e88a-4416-a479-ec569c0f040f.sql
  supabase/migrations/20260814211702_99c9fbbe-9aa9-4109-8908-5e28513ac14f.sql
  supabase/migrations/20260814212111_26ab8f73-028a-4afb-9a92-cac7d36f0ef7.sql
  supabase/migrations/20260814214232_c35530ab-85f2-4cc7-98e8-f66d3d59d55e.sql
  supabase/migrations/20260814222506_6efb5704-26e4-41df-b56b-5abec69f5f4b.sql
  supabase/migrations/20260814222944_a75fe867-2d64-4872-bfcf-597caa7f38df.sql
  supabase/migrations/20260815020000_ministerial_analytics_14f_14g.sql
  supabase/migrations/20260816010000_ministerial_session_nullable_score_14h_defect01.sql
  supabase/migrations/20260816010500_ministerial_analytics_grading_status_14h_defect02.sql
)

cd "$ROOT"
rm -rf "$DATA" "$SOCK"; mkdir -p "$SOCK"
chown -R 1000:1000 "$RUN"
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$DATA" -U postgres --auth=trust -E UTF8 >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$DATA" -o "-k $SOCK -h ''" -w -l "$DATA/pg.log" start >/dev/null
trap 'setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true' EXIT

PSQL=(psql -h "$SOCK" -U postgres -v ON_ERROR_STOP=1 -qtA)

createdb -h "$SOCK" -U postgres t14h
for f in "${CHAIN[@]}"; do
  "${PSQL[@]}" -d t14h -f "$f" >/dev/null
done
"${PSQL[@]}" -d t14h -f tests/import/fixtures/pg17-prereq-14fg-analytics.sql >/dev/null

echo "== end-to-end closure smoke"
OUT="$(psql -h "$SOCK" -U postgres -d t14h -qtA -f tests/import/fixtures/pg17-ministerial-e2e-closure-14h-smoke.sql 2>&1 || true)"
echo "$OUT" | grep -E 'PASS|FAIL|ERROR' || true
FAIL_COUNT=$(echo "$OUT" | grep -cE 'FAIL|ERROR' || true)
PASS_COUNT=$(echo "$OUT" | grep -c 'PASS' || true)
FAILURES=$((FAILURES + FAIL_COUNT))
if [ "$PASS_COUNT" -lt "$MIN_PASS" ]; then
  echo "FAIL  smoke produced only $PASS_COUNT PASS lines (expected >= $MIN_PASS)"
  FAILURES=$((FAILURES + 1))
fi

echo
if [ "$FAILURES" -eq 0 ]; then
  echo "RESULT: 14H E2E CLOSURE REHEARSAL = PASS ($PASS_COUNT assertions)"; exit 0
else
  echo "RESULT: 14H E2E CLOSURE REHEARSAL = FAIL ($FAILURES failures, $PASS_COUNT passes)"; exit 1
fi
