#!/usr/bin/env bash
set -euo pipefail

db_url="${CONTENT_FACTORY_PG17_URL:?CONTENT_FACTORY_PG17_URL is required}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

# CF10-R9 ordering contract:
#   * the fixture puts pgcrypto in `extensions` ONLY — there is no public.digest shim at any point,
#   * CF04/CF07/CF08/CF09 schema migrations are applied byte-for-byte (they still ship the
#     unqualified digest calls that production has today),
#   * the R9 forward migration (20260819225000) re-creates the three hashing functions with
#     `extensions.digest(...)`. It is idempotent and is re-applied after every dependency migration
#     that re-defines one of those functions (CF04, CF08, CF09), because each of those already
#     applied migrations still ships the unqualified call,
#   * every runtime assert (stage manifest / stage domain bundle / authoritative identity binding)
#     therefore EXECUTES against the qualified functions with NO public.digest reachable, and CF10
#     runs last, after the production-search-path guard.
psql "$db_url" -v ON_ERROR_STOP=1 \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-04-fixture.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-07-storage-fixture.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819190000_content_factory_04_package_staging.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819225000_content_factory_dependency_pgcrypto_namespace_r9.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-04-assert.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819200000_content_factory_07_verified_bundle_intake.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-07-assert.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819210000_content_factory_08_atomic_domain_staging.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819225000_content_factory_dependency_pgcrypto_namespace_r9.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-08-assert.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-09-fixture.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819220000_content_factory_09_authoritative_identity_binding.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819225000_content_factory_dependency_pgcrypto_namespace_r9.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-09-assert.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-10-r8-production-search-path.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-10-fixture.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819230000_content_factory_10_domain_materialization.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-10-assert.sql"
