#!/usr/bin/env bash
# =============================================================================
# G1_PUBLISHED_REVISION_TARGET_BINDING_11 — local PostgreSQL 17 rehearsal
#
# Applies the EXACT migration chain on a disposable cluster, then the pending
# stage-11 migration, then re-applies it (idempotency), then runs the runtime
# smoke matrix. Nothing here ever touches the shared production datastore.
#
#   bash tests/import/run-pg17-g1-target-binding-11-rehearsal.sh
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RUN="${TMPDIR:-/tmp}/pg17-g1-11"
DATA="$RUN/data"; SOCK="$RUN/sock"
MIG_11="supabase/migrations-pending/20260814010000_g1_published_revision_target_binding_11.sql"

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
createdb -h "$SOCK" -U postgres chain

cd "$ROOT"
P=(psql -h "$SOCK" -U postgres -d chain -v ON_ERROR_STOP=1 -q)

echo "== chain =="
for f in "${CHAIN[@]}"; do
  echo "--- $f"
  "${P[@]}" -f "$f" >/dev/null
done

echo "== stage 11 (first apply) =="
"${P[@]}" -f "$MIG_11" >/dev/null

echo "== stage 11 (re-apply / idempotency) =="
"${P[@]}" -f "$MIG_11" >/dev/null

echo "== runtime smoke =="
"${P[@]}" -f tests/import/fixtures/pg17-g1-target-binding-smoke.sql 2>&1 \
  | grep -E 'PASS|FAIL|ERROR' || true

echo "== backfill scenarios =="
"${P[@]}" -f tests/import/fixtures/pg17-g1-target-binding-backfill.sql 2>&1 \
  | grep -E 'PASS|FAIL|ERROR' || true
