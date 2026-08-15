#!/usr/bin/env bash
# =============================================================================
# TAMKEEN_UNIFIED_PERFORMANCE_DUAL_SURFACE_15C — local PostgreSQL 17 rehearsal
#
# Disposable cluster only; never touches the shared datastore.
#   bash tests/import/run-pg17-unified-performance-15c-rehearsal.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN="${TMPDIR:-/tmp}/pg17-15c"
DATA="$RUN/data"; SOCK="$RUN/sock"
PREREQ="tests/import/fixtures/pg17-prereq-14fg-analytics.sql"
MIG_14FG="supabase/migrations/20260815020000_ministerial_analytics_14f_14g.sql"
MIG_15B="supabase/migrations/20260817010000_my_mistakes_derived_model_15b.sql"
MIG_15C="supabase/migrations-pending/20260818010000_unified_performance_dual_surface_15c.sql"
FAILURES=0

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
)

cd "$ROOT"
rm -rf "$DATA" "$SOCK"; mkdir -p "$SOCK"
chown -R 1000:1000 "$RUN"
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$DATA" -U postgres --auth=trust -E UTF8 >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$DATA" -o "-k $SOCK -h ''" -w -l "$DATA/pg.log" start >/dev/null
trap 'setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true' EXIT

PSQL=(psql -h "$SOCK" -U postgres -v ON_ERROR_STOP=1 -qtA)

createdb -h "$SOCK" -U postgres t15c
for f in "${CHAIN[@]}"; do
  "${PSQL[@]}" -d t15c -f "$f" >/dev/null
done

"${PSQL[@]}" -d t15c -f "$PREREQ" >/dev/null
"${PSQL[@]}" -d t15c -f "$MIG_14FG" >/dev/null

"${PSQL[@]}" -d t15c -f "$MIG_15B" >/dev/null
"${PSQL[@]}" -d t15c -f tests/import/fixtures/pg17-prereq-15c-progress.sql >/dev/null
echo "== applying 15C"
"${PSQL[@]}" -d t15c -f "$MIG_15C" >/dev/null
echo "== applying 15C again (idempotency)"
"${PSQL[@]}" -d t15c -f "$MIG_15C" >/dev/null

echo "== runtime smoke"
OUT="$(psql -h "$SOCK" -U postgres -d t15c -qtA -f tests/import/fixtures/pg17-unified-performance-15c-smoke.sql 2>&1 || true)"
echo "$OUT" | grep -E 'PASS|FAIL|ERROR' || true
FAIL_COUNT=$(echo "$OUT" | grep -cE 'FAIL|ERROR' || true)
PASS_COUNT=$(echo "$OUT" | grep -c 'PASS' || true)
FAILURES=$((FAILURES + FAIL_COUNT))
if [ "$PASS_COUNT" -lt 30 ]; then
  echo "FAIL  smoke produced only $PASS_COUNT PASS lines"
  FAILURES=$((FAILURES + 1))
fi

if [ "$FAILURES" -eq 0 ]; then
  echo; echo "RESULT: 15C REHEARSAL = PASS"; exit 0
else
  echo; echo "RESULT: 15C REHEARSAL = FAIL ($FAILURES failures)"; exit 1
fi
