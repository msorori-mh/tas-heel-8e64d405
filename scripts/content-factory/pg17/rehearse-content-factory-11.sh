#!/usr/bin/env bash
set -euo pipefail

# =====================================================================================
# CF11 PG17 rehearsal.
#
# Ordering contract (extends the CF10 script; every earlier file is applied byte-for-byte):
#   R5/21H snapshot surface  -> copied verbatim into the CF10 fixture (the two forward
#                               migrations target the full production schema, which this
#                               rehearsal deliberately does not reconstruct; the functions
#                               they install — _v3_canonical_json_v1, v3_capability_snapshot,
#                               v3_capability_snapshot_hash, v3_capability_snapshot_is_reconcilable
#                               — are byte-identical in the fixture and are what CF11 consumes)
#   CF04 -> CF08 -> CF09 -> R9 -> CF07 -> CF10 -> production code baselines -> CF11
#
# There is NO public.digest shim at any point and no auth/separation guard is bypassed:
# every RPC runs as `authenticated` with a real request.jwt.claim.sub.
# =====================================================================================

db_url="${CONTENT_FACTORY_PG17_URL:?CONTENT_FACTORY_PG17_URL is required}"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"

psql "$db_url" -v ON_ERROR_STOP=1 \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-04-fixture.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-07-storage-fixture.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819190000_content_factory_04_package_staging.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819210000_content_factory_08_atomic_domain_staging.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-09-fixture.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819220000_content_factory_09_authoritative_identity_binding.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819225000_content_factory_dependency_pgcrypto_namespace_r9.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-04-assert.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819200000_content_factory_07_verified_bundle_intake.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-07-assert.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-08-assert.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-09-assert.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-10-r8-production-search-path.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-10-fixture.sql" \
  -f "$root_dir/supabase/migrations-pending/20260819230000_content_factory_10_domain_materialization.sql" \
  -f "$root_dir/supabase/migrations/20260827010000_cf10_managed_content_revision.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-10-assert.sql" \
  -f "$root_dir/tests/import/fixtures/pg17-prereq-resource-code.sql" \
  -f "$root_dir/tests/import/fixtures/pg17-prereq-content-code.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-11-fixture.sql" \
  -f "$root_dir/supabase/migrations-pending/20260824000000_content_factory_11_publication.sql" \
  -f "$root_dir/supabase/migrations/20260826020000_cf11_assessment_replay_identity_normalization.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-11-assert.sql" \
  -f "$root_dir/scripts/content-factory/pg17/content-factory-11-postverify.sql"
