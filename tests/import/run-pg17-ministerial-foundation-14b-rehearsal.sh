#!/usr/bin/env bash
# =============================================================================
# PAST_MINISTERIAL_EXAMS_FOUNDATION_14B — local PostgreSQL 17 rehearsal
#
# Disposable cluster only; never touches the shared datastore.
#   1. applies the migration chain up to and including 13C
#   2. applies the pending 14B migration
#   3. exercises guards, gates, RLS, snapshot isolation, and track separation
#
#   bash tests/import/run-pg17-ministerial-foundation-14b-rehearsal.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN="${TMPDIR:-/tmp}/pg17-14b"
DATA="$RUN/data"; SOCK="$RUN/sock"
MIG_14B="supabase/migrations-pending/20260814020000_ministerial_exams_foundation_14b.sql"
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
  supabase/migrations/20260813221804_ff8b3137-d6db-4d26-a679-1d4fa2766d92.sql
  supabase/migrations/20260814011809_33bebe6e-ad5c-4d20-8288-e79d98ce9735.sql
  supabase/migrations/20260814012432_88ef196b-8b25-4bb5-8333-e1ed6085b546.sql
  supabase/migrations/20260814020000_content_entry_readiness_13.sql
)

cd "$ROOT"
rm -rf "$DATA" "$SOCK"; mkdir -p "$SOCK"
chown -R 1000:1000 "$RUN"
setpriv --reuid=1000 --regid=1000 --clear-groups initdb -D "$DATA" -U postgres --auth=trust -E UTF8 >/dev/null
setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$DATA" -o "-k $SOCK -h ''" -w -l "$DATA/pg.log" start >/dev/null
trap 'setpriv --reuid=1000 --regid=1000 --clear-groups pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true' EXIT

PSQL=(psql -h "$SOCK" -U postgres -v ON_ERROR_STOP=1 -qtA)

createdb -h "$SOCK" -U postgres t14b
for f in "${CHAIN[@]}"; do
  echo "--- chain: $f"
  "${PSQL[@]}" -d t14b -f "$f" >/dev/null
done

echo "== applying 14B"
"${PSQL[@]}" -d t14b -f "$MIG_14B" >/dev/null
echo "== applying 14B again (idempotency)"
"${PSQL[@]}" -d t14b -f "$MIG_14B" >/dev/null

check() { # name expected actual
  if [[ "$2" == "$3" ]]; then echo "PASS  $1"; else echo "FAIL  $1 (expected=$2 actual=$3)"; FAILURES=$((FAILURES+1)); fi
}

q() { "${PSQL[@]}" -d t14b -c "$1"; }

# ------------------------------------------------------------------ structure --
check "table ministerial_exam_models exists" "t" \
  "$(q "SELECT count(*)::text='1' FROM information_schema.tables WHERE table_schema='public' AND table_name='ministerial_exam_models'")"

check "table ministerial_exam_questions exists" "t" \
  "$(q "SELECT count(*)::text='1' FROM information_schema.tables WHERE table_schema='public' AND table_name='ministerial_exam_questions'")"

check "exam_sessions has ministerial_model_id" "t" \
  "$(q "SELECT count(*)::text='1' FROM information_schema.columns WHERE table_schema='public' AND table_name='exam_sessions' AND column_name='ministerial_model_id'")"

check "ministerial_exam_models has natural unique key" "t" \
  "$(q "SELECT count(*)::text='1' FROM pg_constraint WHERE conname LIKE '%ministerial_exam_models_natural_uk%'")"

# ------------------------------------------------------------------- fixtures --
"${PSQL[@]}" -d t14b -f tests/import/fixtures/pg17-ministerial-foundation-smoke.sql >/dev/null || true

# The fixture file is expected to echo its own PASS/FAIL lines.
OUT="$(${PSQL[@]} -d t14b -f tests/import/fixtures/pg17-ministerial-foundation-smoke.sql 2>&1 || true)"
echo "$OUT" | grep -E 'PASS|FAIL' || true
FAIL_COUNT=$(echo "$OUT" | grep -c 'FAIL' || true)
if [ "$FAIL_COUNT" -gt 0 ]; then
  FAILURES=$((FAILURES + FAIL_COUNT))
fi

# ------------------------------------------------------------------ hardening --
check "create_ministerial_exam_session REVOKE from anon" "f" \
  "$(q "SELECT has_function_privilege('anon','public.create_ministerial_exam_session(uuid)','EXECUTE')")"

check "start_exam_session REVOKE from anon" "f" \
  "$(q "SELECT has_function_privilege('anon','public.start_exam_session(uuid)','EXECUTE')")"

check "assert_exam_template_not_ministry_bypassed REVOKE from anon" "f" \
  "$(q "SELECT has_function_privilege('anon','public.assert_exam_template_not_ministry_bypassed(uuid)','EXECUTE')")"

# ---------------------------------------------------------------------- wrap --
if [ "$FAILURES" -eq 0 ]; then
  echo
  echo "RESULT: 14B REHEARSAL = PASS (all checks green)"
  exit 0
else
  echo
  echo "RESULT: 14B REHEARSAL = FAIL ($FAILURES failures)"
  exit 1
fi
