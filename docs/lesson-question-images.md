# Lesson and unit question images

Base: original application, main 2cfe143b81a841033fedd0b5e1c4f05d1ec54d74.
Scope: optional question stimulus in lesson XLSX 09/10, lesson display, unit practice, staff question preview and offline lesson packs.

## Authoring

Append-only columns preserve every existing template cell:
- question_image: insert a PNG/JPEG drawing **over cells**, with its top-left corner in this column on the question's row. Leave its cell value blank.
- question_image_alt: required description when a drawing is present.

One drawing per question; 512 KiB per image; 8 MiB workbook input; existing 5 MiB converted artifact cap still applies. WebP bytes are accepted by the raster contract when supported by the workbook writer. Excel IMAGE() and rich-value in-cell images are explicitly rejected with conversion guidance. URLs and unattached filenames are not treated as images. Text-only old workbooks remain valid.

Use the lesson component importer. The generic tabular dry run rejects drawings rather than losing them silently.

## Storage and access

The self-contained raster is a nullable JSONB field on question_revisions. It follows the existing immutable revision, hashing and publication lifecycle. The optional sorted canonical member leaves every pre-existing no-image canonical payload unchanged. Both CF10 and the active V2 publication path store the figure; the existing staff question editor copies it when creating a revision.

The new public APIs are invokers calling a non-exposed private implementation. Existing student RPCs remain authoritative for authentication, lesson access, publication readiness, question role and revision identity. No initial answer fields or public storage URLs are added. No production backfill or data cleanup is part of this feature.

Offline bundles retain the same embedded bytes and validate them before display; old bundles remain readable. The figure supports a responsive preview, keyboard-accessible modal and explicit zoom controls up to 400%.

## Verification

- Real XLSX parser and binary/row association tests.
- Existing text-only workbook and import contract tests.
- Existing offline assessment source/engine tests, plus image round-trip and unsafe URL rejection.
- CF11 rehearsal now includes the shipped self-test management migration and the image migration, followed by 28 image checks: real V2 import/publication, replay, old canonical payload preservation, invalid image rollback, access restrictions, answer separation, edit preservation, image removal and old revision preservation.
- The focused UI workflow imports the updated template in Chromium and checks rendering/zoom/answer preservation at 320, 390, 768 and 1280 pixels.
- Full build and TypeScript checks.

Local verification: 14 new parser/security/offline image checks, 5 actual figure component interaction checks, 25 existing import/offline checks, 28 isolated database checks, TypeScript and build passed. Chromium could not run in this workspace.

Remote verification on 2026-09-13: after the user's approval, PR #234 was opened on the original application. Commit 4ff6cf977467d6add5ae4ef5798e60ec9c598852 has the exact tree of local commit 6e5f53c7. The Chromium workflow (run 34777016441) passed at all four widths; screenshots confirmed the figure, responsive dialog and zoom. The CF11 PostgreSQL 17 job (103776876633) passed all 28 new image checks. Android and the application builds also passed. The first Web CI run identified formatting in the template generator and explicit-any types in test fixtures; those are corrected in the follow-up commit. See PR checks for the final current-head results.

Read-only production preflight found 502 questions and 639 revisions, no existing image column/schema, and all nine function patch anchors matched. Revision fingerprint before release: 31d8ecfc01329c4b59d77cf3f97a4232. Repeat the preflight immediately before any authorized release. No production change was applied.

The SQL file was created with the CLI and ordered immediately after the repository's already-shipped future-dated self-test management migration.

## Rollout and recovery

Before applying, confirm original project zbdhxyuulyovihjgeqbn, the absence of the new column/schema, matching function anchors, and existing revision counts/canonical hashes. Apply only the exact new migration transactionally; do not run a broad pending migration push. Verify old row counts/hashes and privileges are unchanged before deploying the matching application.

If frontend deployment fails, keep the additive schema and use the previous frontend: the original student RPC signatures remain intact. Never drop the image column after real imports. A failed migration transaction rolls back all schema/function changes. Production application and migration are a separate release gate.
