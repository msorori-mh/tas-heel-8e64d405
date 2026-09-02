#!/usr/bin/env bash
# OFFLINE-05 — disposable PostgreSQL 17 rehearsal. Remote hosts are rejected.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
: "${OFFLINE_PG17_URL:?OFFLINE_PG17_URL is required}"

if ! uri_host="$(node -e '
  try {
    const url = new URL(process.env.OFFLINE_PG17_URL);
    if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") process.exit(2);
    process.stdout.write(url.hostname);
  } catch {
    process.exit(2);
  }
')"; then
  echo "OFFLINE_PG17_URL must be a PostgreSQL URL" >&2
  exit 2
fi

case "$uri_host" in
  localhost|127.0.0.1|::1) ;;
  *) echo "OFFLINE_PG17_URL must target localhost" >&2; exit 2 ;;
esac

cd "$ROOT"
psql "$OFFLINE_PG17_URL" --set=ON_ERROR_STOP=1 --quiet \
  --file tests/offline/fixtures/pg17-offline-assessment-schema.sql \
  --file supabase/migrations/20260912030000_offline_assessment_answer_layer.sql

set +e
output="$(psql "$OFFLINE_PG17_URL" --set=ON_ERROR_STOP=1 \
  --file tests/offline/fixtures/pg17-offline-assessment-smoke.sql 2>&1)"
psql_rc=$?
set -e
echo "$output"
if [ "$psql_rc" -ne 0 ]; then
  exit "$psql_rc"
fi

pass_count="$(echo "$output" | grep -c 'PASS' || true)"
if [ "$pass_count" -lt 13 ]; then
  echo "Offline assessment rehearsal produced $pass_count PASS assertions; expected at least 13." >&2
  exit 1
fi
echo "RESULT: offline assessment PostgreSQL 17 rehearsal = PASS ($pass_count assertions)"
