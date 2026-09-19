# Prepared offline descriptors: release gate

Baseline: main `143270d662a72f35b86e416a2730fe49c6e28276` (PR 287). The existing legacy reader remains the compatibility path only when the additive RPC is absent or its bounded backfill is incomplete. Permission, scope, validation and database timeout errors fail closed. The manifest endpoint still checks current subject access, lesson gates and assessment permissions on every request.

The new cache stores byte counts, fingerprints and approved-snapshot body hashes. Triggers refresh those descriptors atomically when content is written. A student's compact RPC uses the original source tables and their RLS, without retrieving content bodies or publication snapshots. There are no source-table rewrites, source UPDATEs, generated columns, original-policy changes, lab CSP changes or publication-state changes. Assessment answer generation remains governed by the existing runtime authorization.

## Required evidence

- Local TypeScript, relevant offline tests and manifest parity tests.
- Exact-head CI: isolated PG17 migration, SQL/JS metadata vectors, source preservation, automatic refresh/deletion, approval binding, RLS revocation and write/anonymous denial.
- UI: selected-only requests, failure isolation, true progress, interrupted HTTP and resume, offline cached reading and four viewport widths.
- Snapshot original source counts/identity/timestamps, policies and publication statuses before applying only `20260920010000_offline_prepared_descriptors.sql`. Never apply all pending migrations.
- Execute `offline_backfill_descriptors_v1(source,8)` in separate bounded requests per source until missing descriptors reach zero. It only locks source rows and inserts cache rows. Keep production requests available through legacy compatibility until complete.
- Verify unchanged source identity/timestamps/policies and no missing descriptors. Probe authenticated manifests and downloads for Quran and Physics, confirm only selected subjects are requested and inspect actual durations. No physical-device airplane-mode claim from server or browser tests.

## Exact rollback

First revert the manifest consumer to the previous deployed commit; cached student files and answers remain intact. In one transaction, remove only the five `offline_descriptor_*` triggers from their source tables, then `offline_manifest_sources_v1(uuid[])`, `offline_backfill_descriptors_v1(text,integer)`, `_offline_refresh_descriptor_v1()`, `offline_prepared_descriptors`, `_offline_snapshot_descriptor_v1(uuid,text,text,jsonb)`, `_offline_snapshot_canonical_safe_v1(jsonb)`, `_offline_text_descriptor_v1(text)`. Do not use CASCADE, alter original source policies or delete content/student data. Reload the PostgREST schema. No rollback is required merely to stop the backfill; missing descriptors use the original reader.
