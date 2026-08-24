#!/usr/bin/env bash
set -euo pipefail

db_url="${GOLDEN_IDENTITY_PG17_URL:?GOLDEN_IDENTITY_PG17_URL is required}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

psql "$db_url" -v ON_ERROR_STOP=1 \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-04-fixture.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819190000_content_factory_04_package_staging.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819210000_content_factory_08_atomic_domain_staging.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-09-fixture.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819220000_content_factory_09_authoritative_identity_binding.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819225000_content_factory_dependency_pgcrypto_namespace_r9.sql" \
  -f "$root_dir/supabase/migrations-pending/20260824170000_golden_lesson_identity_preflight_rebind.sql" \
  -f "$root_dir/scripts/content-factory/pg17/golden-identity-rebind-assert.sql"
