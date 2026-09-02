#!/usr/bin/env bash
# MINISTERIAL_TRACK_PACKAGE_IMPORT_V1 — disposable PostgreSQL 17 rehearsal.
# The caller must provide a clean local database. Remote Supabase hosts are rejected.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${MINISTERIAL_PG17_URL:?MINISTERIAL_PG17_URL is required}"

if ! uri_host="$(node -e '
  try {
    const url = new URL(process.env.MINISTERIAL_PG17_URL);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") process.exit(2);
    process.stdout.write(url.hostname);
  } catch {
    process.exit(2);
  }
')"; then
  echo "MINISTERIAL_PG17_URL must be a PostgreSQL URL" >&2
  exit 2
fi
case "$uri_host" in
  localhost|127.0.0.1|::1) ;;
  *) echo "MINISTERIAL_PG17_URL must target localhost" >&2; exit 2 ;;
esac

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
  supabase/migrations/20260816010000_ministerial_session_nullable_score_14h_defect01.sql
  supabase/migrations/20260816010500_ministerial_analytics_grading_status_14h_defect02.sql
  supabase/migrations/20260825010000_ministerial_cross_track_mufadala_parity_14i.sql
  supabase/migrations/20260912010000_ministerial_track_package_import.sql
  supabase/migrations/20260912020000_ministerial_aden_text_answers.sql
)

cd "$ROOT"
for file in "${CHAIN[@]}"; do
  psql "$MINISTERIAL_PG17_URL" --set=ON_ERROR_STOP=1 --quiet --file "$file"
done

output="$(psql "$MINISTERIAL_PG17_URL" --set=ON_ERROR_STOP=1 --file \
  tests/import/fixtures/pg17-ministerial-track-package-smoke.sql 2>&1)"
echo "$output" | grep 'PASS' || true
pass_count="$(echo "$output" | grep -c 'PASS' || true)"
if [ "$pass_count" -lt 24 ]; then
  echo "Ministerial package rehearsal produced $pass_count PASS assertions; expected at least 24." >&2
  exit 1
fi
echo "RESULT: ministerial track package PostgreSQL 17 rehearsal = PASS ($pass_count assertions)"
