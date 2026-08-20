# CF11 — Iron (الحديد Fe) Golden Lesson: publication-to-READY closure

Source-only closure. **No production writes and no migration apply were performed in this task.**

## Exact identities

| Item | Value |
| --- | --- |
| Source commit (base) | `d720dea513720316aa27ca945715702bd3219eac` |
| CF11 migration | `supabase/migrations-pending/20260824000000_content_factory_11_publication.sql` |
| Migration SHA-256 | `908e2626ffda702c60112e8fcaecc6f6f57c25b368b7c7f27853854dc89ff660` |
| Iron bundle | `content-packages/chemistry-g12-iron-v3/dist/CHEM-G12-IRON-FE.zip` |
| Bundle SHA-256 | `a7369bf13b6646bb2181ff39dac0c18f4fe3b00a9609f27cb7a451152988c100` |
| Furnace asset | `official-figure-1-1.jpg` |
| Asset MIME (verified by magic bytes `FF D8 FF`) | `image/jpeg` |
| Asset SHA-256 | `a5e17da2c7343bc3f4289a3258f646d635e7a8365b84f2b7c7209134f0614daf` |
| Asset size | 26,742 bytes |

The R1 declaration named the file `.png`. The real bytes are JPEG, so the declaration — not the
official content — was corrected. `assetMagicMatches("image/png", bytes)` is asserted to be `false`
in the test suite so the same mislabelling can never pass again.

## Changed files

* `scripts/content-factory/pg17/content-factory-11-assert.sql` — R5 machine-attestation and
  exhaustive-replay negatives.
* `src/lib/content-factory/golden-lesson-assets.ts` — CF11 supplemental asset contract: raster-only
  MIME allowlist with magic-byte sniffing, leaf-only names, size caps, exact SHA-256, HTML
  reference scanner (no base64, no URLs, no folders, no traversal).
* `src/lib/content-factory/golden-lesson-bundle-verifier.ts` — declared assets join hash pinning and
  ZIP file-set equality; every HTML body is scanned for undeclared references.
* `src/lib/content-factory/golden-lesson-publication.functions.ts` *(new)* — operator server
  functions: batch status read, CF10 materialize, asset verify/upload, CF11 publish, READY attest.
* `src/components/admin/GoldenLessonCf11OperatorPanel.tsx` *(new)* + `admin.import.tsx` — operator console.
* `supabase/migrations-pending/20260824000000_content_factory_11_publication.sql` — CF11 migration.
* `scripts/content-factory/pg17/*` — fixture, assertions, postverify, rehearsal runner.
* `scripts/e2e/iron-cf11-student-probe.mjs` *(new)* — read-only student probe at 390x844 / 1280x900.
* `tests/content-packages/chemistry-g12-iron-cf11-assets.test.ts` *(new)*, `chemistry-g12-iron-v3.test.mjs` (leaf/MIME assertion corrected).

## Security model (R3)

* **Manifest is the only declaration authority.** `cf11_manifest_assets(manifest, lesson_id)` derives
  the asset set deterministically from the CF07 hash-pinned package manifest. Whatever the client
  sends to `golden_lesson_publish_cf11` is an advisory echo: any difference raises
  `CF11_ASSET_DECLARATION_NOT_AUTHORITATIVE` (42501). No client, server function or operator can add,
  drop or edit a declaration.
* **Attestation is machine-only (R5).** `golden_lesson_attest_cf11_asset` is granted to `service_role`
  alone and refuses any call that carries an `auth.uid()`
  (`CF11_ASSET_ATTESTATION_MACHINE_ONLY`). The server downloads the stored object, re-measures it and
  records `verification_origin = 'SERVER_BYTE_READBACK'` — any other origin is rejected
  (`CF11_ASSET_VERIFICATION_ORIGIN_INVALID`). The operator who asked for the upload is recorded as
  `requested_by` and must be real content staff; no human can ever claim bytes.
* **Exhaustive replay (R5).** Before any replay may report success, `cf11_assert_replay_state`
  re-derives the live state of every category — official body hash, inline HTML artefacts, asset
  registration and storage-object identity, published questions, assessment membership (with no
  official-question leak) and the seven lifecycle rows. Any drift raises
  `CF11_REPLAY_LIVE_STATE_CONFLICT` instead of a comfortable idempotent success. Publication rows
  also require a non-null `idempotency_key`.
* **CF10 has no machine path.** The raw `golden_lesson_materialize_domain_batch` is revoked from
  `service_role` and `authenticated`; materialization is only reachable through the operator wrapper
  running on the human's own token.
* **Uploads are bound to real objects.** The attestation re-measures the upload
  (SHA-256, byte size, MIME, magic-byte prefix) against the manifest and binds it to the live
  `storage.objects` identity (`id` + `version` + `eTag`). Rows without real size/mimetype metadata are
  refused (`CF11_ASSET_OBJECT_METADATA_MISSING`), so a fabricated name-only object can never stand in
  for an upload. Publication fails closed when an attestation is missing, stale or when the attested
  set differs from the manifest set (`CF11_ASSET_ATTESTATION_MISSING`, `..._SET_MISMATCH`).
* **Append-only ledgers.** `golden_lesson_asset_attestations`, `golden_lesson_publications` and
  `golden_lesson_ready_attestations` have `UPDATE`/`DELETE` revoked from every role and immutability
  triggers behind them. READY evidence is a separate ledger row, never a mutation of the publication
  row.
* **Replay guards.** Publication is idempotent on (batch, plan hash); a replay whose plan hash,
  `manifest_assets_sha256` or `asset_attestation_sha256` differs from the recorded row is rejected
  instead of silently re-publishing.
* **Human identity only.** Both RPCs are granted to `authenticated`, re-derive `auth.uid()` and
  require `_actor_id = auth.uid()`; the server functions call them with the operator's own token
  (`context.supabase`) — never the service role. Separation of duties is in the schema
  (`ready_attested_by <> published_by`) and mirrored in the UI.
* Assets live in the private `golden-lesson-assets` bucket at the content-addressed path
  `<lesson_id>/<sha256>-<leaf>`. No public bucket, no overwrite: a differing hash for the same
  `asset_code` raises `CF11_ASSET_HASH_CONFLICT`. Raster MIME allowlist only — SVG and any
  script-capable type are refused, and path traversal is impossible (leaf names only).
* Only declared `src="<leaf>"` references are rewritten. The rewrite is proven reversible against
  the original body (`CF11_OFFICIAL_TEXT_DRIFT`), so official text cannot change; an undeclared
  reference raises `CF11_UNDECLARED_ASSET_REFERENCE`.
* Answers and rationales stay in `official_question_answers` / `question_option_rationales`; the
  initial student payload is scanned by `cf10_assert_no_answer_leak` for every published body.
* `DRAFT → REVIEW` is the only transition CF11 publication performs. READY is a separate RPC.

## Expected write counts (production, when applied and executed)

| Step | Writes |
| --- | --- |
| Asset upload (`verifyGoldenLessonCf11Assets`) | 1 storage object (idempotent; 0 on replay) |
| `golden_lesson_attest_cf11_asset(mode => 'EXECUTE')` (machine, service role) | 1 attestation row per asset (0 on replay) |
| `golden_lesson_publish_cf11(mode => 'DRY_RUN')` | 0 |
| `golden_lesson_publish_cf11(mode => 'EXECUTE')` | 1 publication row, 1 published-asset row, 1 book-content update, 2 `lesson_resources` (mindmap + experiment), 45 question revisions published, 40 assessment memberships, 7 lifecycle rows `DRAFT → REVIEW` |
| `golden_lesson_attest_cf11_ready(mode => 'DRY_RUN')` | 0 |
| `golden_lesson_attest_cf11_ready(mode => 'EXECUTE')` | 1 `golden_lesson_ready_attestations` row + lifecycle rows `REVIEW → READY` |

Replay of any RPC returns the recorded result with `writes_performed = 0`.

## Rollback

CF11 adds tables and functions only; it alters no earlier migration bytes (R5, 21H, CF04, CF07,
CF08, CF09, R9, CF10 are unchanged). The ledgers are append-only by design, so rollback is a
lifecycle operation, not a delete: reset the seven lifecycle rows to `DRAFT` (before READY) or to
`REVIEW` (after READY) — student visibility requires READY. The uploaded asset object and its
attestation are content-addressed and harmless to retain.

## Operator runbook

1. Sign in as a content operator (admin or content_manager) and open **الاستيراد → نشر الدرس الذهبي (CF11)**.
2. Build/upload the verified bundle and take the package through
   `DRAFT → SUBMITTED → CONTENT_APPROVED → APPROVED_FOR_STAGING` in the review panel.
3. Stage the domain bundle, bind the authoritative identity, then press **تجسيد CF10**.
4. Press **تحقق ورفع الأصول** — the server verifies JPEG magic bytes and the pinned hash, uploads to
   the private bucket, re-downloads the stored object and appends a machine attestation
   (`SERVER_BYTE_READBACK`) for every manifest asset, with the operator recorded as the requester.
5. Press **CF11 DRY_RUN**, read the plan, then **نشر إلى REVIEW**.
6. Open **معاينة الطالب** and run
   `node scripts/e2e/iron-cf11-student-probe.mjs --base <url> --lesson <lesson-uuid>`.
7. A **different** operator writes a review note and presses **فحص الاعتماد** then **اعتماد READY**.

## Verification performed in this task

* PG17 rehearsal R5 → 21H → CF04 → CF07 → CF08 → CF09 → R9 → CF10 → CF11 with the Iron fixture,
  assertions and `content-factory-11-postverify.sql`: `PASS_CONTENT_FACTORY_11_POSTVERIFY`,
  including the R3 attestation negatives (bytes/size/MIME/magic/undeclared/ledger immutability) and
  the R5 negatives: human-claimed attestation refused, fabricated verification origin refused,
  non-staff requester refused, raw CF10 denied to `service_role`, and a tampered replay refused for
  each of bookContent / inline HTML / assessment membership / lifecycle / stored asset object.
* Regressions: 209/209 core, 60/60 import contract, 37/37 QB source, 438/438 QB import.
  Typecheck clean. Production build OK.


## Remaining production-only steps

Applying the CF11 migration, running the operator sequence above, and executing the student probe
against the published lesson id. All three require an explicit production authorization.
