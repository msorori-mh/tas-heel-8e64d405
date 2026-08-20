# CF11-R6 — Iron (الحديد Fe) Golden Lesson: publication-to-READY closure

Source-only closure. **No production writes and no migration apply were performed in this task.**

## Exact identities

| Item | Value |
| --- | --- |
| Remediation base commit | `c6d02ef9932282473f10101630bd289bd4d2739e` |
| Revision | R6 (source-only) |
| CF11 migration | `supabase/migrations-pending/20260824000000_content_factory_11_publication.sql` |
| Migration SHA-256 (final, after all R6 edits) | `170cac3651aee1fffe3b60e06aa1ad7ccccced6d5be8c9ed4d8c4c7919ec5183` |
| Production writes | 0 |
| Migration applied | NO |
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

## Security model (R6)

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
* **Exact-set semantics everywhere (R6).** The only valid lifecycle vocabulary is the canonical
  seven (`officialBookContent`, `tamkeenExplanation`, `quickReview`, `mindMap`, `simulation`,
  `checkUnderstanding`, `lessonAssessment`), mirrored from `src/lib/lessons/capability-mapping.ts`
  into `cf11_lifecycle_capabilities()`. Publication plan validation, `cf11_assert_replay_state`,
  READY first execution and READY replay all compare **sorted set equality**, never a count and
  never statuses alone, so a missing, extra, duplicate-equivalent, retired or substituted name is
  refused. The operator panel gates the READY button on the same imported set and names the
  missing / foreign / duplicated / non-REVIEW rows.
* **Exhaustive replay (R6).** Before any replay may report success, `cf11_assert_replay_state`
  re-derives the live state of every category: official body hash; inline HTML artefacts; the exact
  published-asset set with its immutable attestation and current storage object identity
  (`id`, `version`, eTag, metadata size, MIME); the exact planned 45 question-code set, each code
  resolving to its intended `PUBLISHED` revision on this lesson with no extra published question;
  assessment membership equal to the exact planned self-test set (a substituted member at an
  identical count fails) with zero official questions; and the exact seven lifecycle rows. Any drift
  raises `CF11_REPLAY_LIVE_STATE_CONFLICT`. Publication rows require a non-null `idempotency_key`.
  **Honest scope:** this SQL replay compares recorded identity and object metadata — the byte
  readback itself is the machine server attestation step, not something SQL performs.
* **READY snapshot replay (R6).** A READY replay re-derives all seven capability snapshots and
  hashes with the canonical Content V3 functions and compares them against the READY ledger
  evidence *and* the live `ready_snapshot` / `ready_hash`. A stored ledger checksum alone is never
  accepted as evidence about today's state.
* **Service-role editorial denial (R6).** The machine role keeps byte attestation and reads only.
  `golden_lesson_publish_cf11`, `golden_lesson_attest_cf11_ready`, the CF10 operator wrapper,
  `golden_lesson_advance_review` and identity binding are all revoked from `service_role`, `anon`
  and `PUBLIC`. Identity binding gained an authenticated admin wrapper
  (`golden_lesson_bind_authoritative_identity_operator`) that derives the actor from `auth.uid()`,
  and the server function now calls it with the operator's own token instead of the service key.
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
controlled **forward lifecycle transition**, never an ad-hoc `UPDATE`. To withdraw a lesson from
students, drive each of the canonical seven through `lesson_capability_transition` to `HOLD`
(the audited transition path), which removes student visibility while leaving every ledger row
intact for audit. Do not reset statuses with direct SQL: the immutability triggers exist precisely
to make that impossible, and a hand-written reset would destroy the evidence chain. The uploaded
asset object and its attestation are content-addressed and harmless to retain.

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

Executed in the R6 task:

* `tests/content-factory/content-factory-11-r6.static.test.mjs` (renamed from R4): 12/12 PASS,
  including the new exact-set, question/assessment/asset replay, READY-snapshot and service-role
  denial assertions.
* Content-factory + content-package suites: 54/54 (`node --import tsx --test`), Iron CF11 assets
  17/17, Iron golden bundle 7/7 (vitest).
* Core regression suite: 209/209 PASS. Typecheck clean (`tsgo --noEmit`). Production build OK.

Written but **not executed in this environment** (no PostgreSQL 17 instance is reachable here —
`CONTENT_FACTORY_PG17_URL` is unset, so the rehearsal is reported as BLOCKED, not PASS):

* `scripts/content-factory/pg17/content-factory-11-assert.sql` section K — service-role denial for
  every human editorial RPC, the identity-binding wrapper privileges, and the exact-set probe that
  refuses a substituted capability name at an identical row count. These run in the full
  R5 → 21H → CF04 → CF07 → CF08 → CF09 → R9 → CF10 → CF11 rehearsal alongside the earlier R3/R5
  attestation and tampered-replay negatives.
* `tests/content-packages/chemistry-g12-iron-v3-ui-runtime.mjs` — requires the Playwright package,
  which is not installed in this environment.


## Remaining production-only steps

Applying the CF11 migration, running the operator sequence above, and executing the student probe
against the published lesson id. All three require an explicit production authorization.
