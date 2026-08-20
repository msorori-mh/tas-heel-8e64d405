# CF11-R8B — Iron (الحديد Fe) Golden Lesson: publication-to-READY closure

Source-only closure. **No production writes and no migration apply were performed in this task.**

## Exact identities

| Item | Value |
| --- | --- |
| Remediation base commit | `9e8d9294e36b0a38b0094b8b58075423da6f85c5` |
| Revision | R9C (source-only; independent PG17 gate in progress) |
| CF11 migration | `supabase/migrations-pending/20260824000000_content_factory_11_publication.sql` |
| Current migration SHA-256 (R9C) | `0d88ec8605c25dbf4aafa6bd4d080273ceac43a032bbbbfdf6d53d0436d03957` |
| Production writes | 0 |
| Migration applied | NO |
| PG17 rehearsal (this task) | **BLOCKED — NOT EXECUTED.** No PostgreSQL 17 instance is reachable from this environment, so the R8/R8B SQL has **not** been executed anywhere. Every claim below is a source-level claim. |
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
CF08, CF09, R9, CF10 are unchanged).

**Ledgers are immutable.** `golden_lesson_publications`, `golden_lesson_ready_attestations`,
`golden_lesson_published_assets`, `golden_lesson_asset_attestations` and
`golden_lesson_ready_revocations` are append-only: `UPDATE`/`DELETE` are revoked and blocked by
trigger. They are **never** deleted, reset or rewritten — not during rollback, not during
remediation. There is no "reset the seven lifecycle rows" procedure, and any such instruction from
an earlier revision is withdrawn.

**The only audited withdrawal path** is the controlled RPC
`golden_lesson_revoke_cf11_ready(_batch_id, _actor_id, _reason, _mode, _idempotency_key)` (R7): it
is an authenticated human RPC (`actor = auth.uid()`, content staff only), requires a written
reason and a durable idempotency key on EXECUTE, opens a transaction-local revocation ticket, drives
exactly the canonical seven `READY -> DRAFT` inside one transaction, copies the original READY
evidence into `golden_lesson_ready_revocations`, and re-asserts `lesson_student_visible() = false`.
Direct `lesson_capability_transition` demotion of a CF11-managed lesson is refused (R8B), and there
is no `HOLD` status in production's lifecycle — `DRAFT` is the only supported non-visible state.

**If no audited path fits a given situation, the verdict is HOLD, not hand-written SQL.** Record
the HOLD, then ship a *forward remediation migration* that adds the missing audited transition
(new SECURITY DEFINER RPC + new append-only evidence rows). Never mutate history to reach the
desired state. The uploaded asset object and its machine attestation are content-addressed and
harmless to retain.

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


## R7 — closure of the remaining blockers

### A) Zero-write DRY_RUN (was: publish DRY_RUN silently uploaded and attested)

`golden-lesson-publication.server.ts` is split into a read-only resolver and an explicit writer:

* `resolveVerifiedAssets(batchId)` downloads and re-verifies the bundle and derives the exact
  content-addressed declarations. It contains **no** `.upload(`, no attestation and no RPC.
* `uploadVerifiedAssets(declarations, files)` is the only code path that writes bytes.
* `attestStoredAssets(...)` now accepts `mode: "EXECUTE"` only and throws
  `CF11_ATTESTATION_IS_WRITE_ONLY` otherwise — there is no DRY_RUN attestation path left.
* **R8 correction.** The earlier R7 wording ("publish EXECUTE uploads and attests") described a
  real defect, now removed: `publishGoldenLessonCf11` resolves in both modes and uploads/attests **never**. The old text said it uploaded when
  `mode === "EXECUTE"`. A DRY_RUN therefore performs zero storage writes and zero ledger rows;
  the response carries `writesPerformed: false`.
* PG17 negative `CF11_EXPECTED_DRY_RUN_ZERO_WRITES` counts `golden_lesson_published_assets` and
  `golden_lesson_asset_attestations` around a DRY_RUN and requires both counts unchanged.

### B) Applicability and exact state

`cf11_assert_exact_required_lifecycle_set()` wraps the exact-set assertion and additionally
requires `applicability = 'REQUIRED'` on all seven rows
(`CF11_LIFECYCLE_APPLICABILITY_NOT_REQUIRED`). It runs at the publication plan, in
`cf11_assert_replay_state`, at first READY and at READY replay. A first READY additionally
requires the REVIEW set to equal the canonical seven exactly, so a mixed REVIEW/READY lesson is
refused with `CF11_READY_REQUIRES_REVIEW_FOR_ALL: review=[...]` instead of being "completed".
The operator panel surfaces `notRequired` rows and blocks attestation on them.

### C) Pinned question identity and payload

The write plan is now `tamkeen.content-factory-11.write-plan.v2`. Each of the 45 questions is
recorded as `{code, questionId, revisionId, payloadHash, sourcePayloadHash}`:

* the plan refuses to form if any pin is unresolved (`CF11_QUESTION_PIN_INCOMPLETE`,
  `CF11_QUESTION_PIN_UNRESOLVED`), and the pins are inside the hashed plan;
* EXECUTE publishes exactly those `revisionId`s and re-checks payload identity first
  (`CF11_QUESTION_REVISION_DRIFT`) — it never re-derives a "latest" revision;
* assessment membership is inserted from the pinned self-test `questionId`s;
* `cf11_assert_replay_state` compares code, question id, revision id, `payload_hash` and
  `source_payload_hash` per question, plus assessment membership by **id and code**, so a
  same-count substitution or an edited payload is a conflict
  (`questionPlanUnpinned.*`, `questionRevision.*`, `assessmentMembers`).

### D) First READY revalidates the full live state

`golden_lesson_attest_cf11_ready` calls `cf11_assert_replay_state(pub.result)` **before** any
transition on the first (non-replay) path, so approval on stale evidence is impossible: asset
identity/version/eTag/size/MIME, pinned revisions, assessment set, official body and inline HTML
are all re-derived against the recorded plan.

### E) Truthful controlled withdrawal

`golden_lesson_revoke_cf11_ready(_batch_id, _actor_id, _reason, _idempotency_key, _mode)`:

* **authenticated full admin only**; actor re-derived from `auth.uid()`
  (`CF11_ACTOR_IDENTITY_MISMATCH`), and `service_role` / `anon` / `PUBLIC` are revoked;
* separation of duties — the human who attested READY cannot withdraw it;
* mandatory written reason (>= 12 chars) and, on EXECUTE, a durable idempotency key;
* preconditions: exactly the canonical seven, all `REQUIRED`, all `READY`, rows locked
  `FOR UPDATE`;
* **target state is `DRAFT`, and this is stated honestly**: production's
  `lesson_capability_transition` accepts only `DRAFT` / `REVIEW` / `READY` and rejects
  `READY -> REVIEW` with `REVIEW_REQUIRES_DRAFT`, so `DRAFT` is the only supported non-visible
  forward state for an already-READY capability. There is no `HOLD` status and none was invented;
* atomic: all seven transition in one transaction and the function re-reads the live set
  afterwards (`CF11_REVOKE_NOT_ATOMIC`) and asserts `lesson_student_visible()` is false
  (`CF11_REVOKE_STILL_STUDENT_VISIBLE`);
* evidence-preserving: the original READY attestation row is **copied** into the append-only
  `golden_lesson_ready_revocations` ledger (immutability trigger + `UPDATE`/`DELETE` revoked) and
  is never mutated or deleted;
* idempotent: the same key replays with `writes_performed: 0` after re-verifying the live
  withdrawn set (`CF11_REVOKE_REPLAY_CONFLICT`); a different key conflicts;
* terminal: `golden_lesson_attest_cf11_ready` refuses a withdrawn publication forever
  (`CF11_PUBLICATION_REVOKED`), so recovery requires a new package version / batch / publication;
* audited in `audit_logs` as `golden_lesson_cf11_ready_revoked`.

The operator console exposes a withdrawal card (DRY_RUN preview + EXECUTE) with the mandatory
reason field, the separation-of-duties block, and a "مسحوب" badge on withdrawn batches.

### F) Release identity and test truth

| Item | Value |
| --- | --- |
| Base commit (R8 remediation) | `509ed2a569b908d7368ccce1e55a55310bc083f6` |
| Base commit (R8B remediation) | `c605f43452be50c2b120cd9762140eba1dc0a859` |
| Current CF11 migration SHA-256 (R9C) | `0d88ec8605c25dbf4aafa6bd4d080273ceac43a032bbbbfdf6d53d0436d03957` |
| Migration applied | NO |
| Production writes | 0 |
| PG17 rehearsal | **BLOCKED — not executed in this environment** (no PostgreSQL 17 reachable; `CONTENT_FACTORY_PG17_URL` unset) |

## R8 — closure of the remaining blockers

### 1) Publish EXECUTE no longer writes assets, implicitly or otherwise

`verifyGoldenLessonCf11Assets` is now the **only** code path in the codebase that can upload an
object or call `golden_lesson_attest_cf11_asset`. `publishGoldenLessonCf11` — in **both** DRY_RUN and
EXECUTE — resolves the manifest declarations read-only and then calls a new read-only precondition,
`assertAssetsVerified(lessonId, declarations)`, which proves that every declared object already
exists in the private bucket at the attested size and that an immutable machine attestation
(`verification_origin = 'SERVER_BYTE_READBACK'`) matches its hash, size, MIME, bucket and path — as
an exact set. Anything missing, stale or extra fails with `CF11_ASSETS_NOT_VERIFIED`. The handler
contains no `.upload(`, no `uploadVerifiedAssets`, no `ensureVerifiedAssets` and no
`attestStoredAssets` in any branch.

Operator runbook order, enforced by the panel (CF11 buttons stay disabled until assets are
verified): **تحقق ورفع الأصول → CF11 DRY_RUN → CF11 EXECUTE**.

### 2) Asset metadata replay is fail-closed

Every `coalesce(..., attested_value)` fallback is gone from the replay join and from the first-READY
full replay. `storage.objects.metadata` must be non-null and must explicitly carry `size`,
`mimetype`/`contentType` and a non-empty `eTag`; each is compared exactly against the attested
value. Missing live metadata now fails instead of passing.

### 3) Revocation EXECUTE requires its idempotency key before any replay branch

`golden_lesson_revoke_cf11_ready` validates `_mode = 'EXECUTE' AND length(btrim(key)) >= 8` **before**
loading the existing ledger row. A replay succeeds only on an exact non-null key match; a null,
short or different key is refused (`CF11_REVOKE_IDEMPOTENCY_KEY_REQUIRED` /
`CF11_REVOKE_IDEMPOTENCY_KEY_CONFLICT`). DRY_RUN stays zero-write and may omit the key.

### 4) Honest tests

The stale R7 static file (byte-identical to R6, containing zero R7 cases — the R7 report's claim of
"six new R7 tests" was false) is replaced by
`tests/content-factory/content-factory-11-r8.static.test.mjs` with seven genuinely new R8 cases:
publish has no upload/attestation in either mode; only the verify function reaches upload and
attestation; the read-only precondition itself never writes; strict metadata rejection with no
coalesce fallback; applicability/status exactness plus pinned revision/payload and first-READY
revalidation; the revocation key gate ordering; and PG17 section-N executability.

### 5) PG17 negatives are executable

Section N was rewritten with **no** `EXCEPTION WHEN OTHERS THEN NULL`. Publication DRY_RUN and
revocation DRY_RUN must now actually succeed, must self-report `mode = DRY_RUN` and
`writes_performed = 0`, and every relevant counter (published assets, attestations, publications,
revocation ledger, `audit_logs`) is compared before and after. A **real** revocation EXECUTE runs
with a third fixture admin (separate from both publisher and attester) and asserts: exactly seven
`DRAFT` + `REQUIRED` rows equal to the canonical set, `lesson_student_visible = false`, exactly one
immutable ledger row, the original READY evidence preserved, one audit row, same-key replay with
`writes_performed = 0` and no new rows, null/different key refused, terminal re-attest refused, and
ledger immutability. The 9-argument machine-attestation signature is retained.

Executed in this task:

| Suite | Result |
| --- | --- |
| `bun run test` (core) | 209/209 PASS |
| `node --test tests/content-factory/*.mjs` (incl. the R8 + R8B + R9B statics) | 69/69 PASS |
| `tsgo --noEmit` | clean |

PG17 assertions are **written, not executed**.

## R8B — closure of the direct 21H transition bypass

**The finding.** 21H's `public.lesson_capability_transition` is `EXECUTE`-granted to
`authenticated` and only demands a full admin for `-> READY` and `REVIEW -> DRAFT`. `READY -> DRAFT`
needed nothing more than content staff. Any content manager could therefore un-publish an attested
Golden Lesson directly, bypassing the CF11 withdrawal entirely: no full admin, no separation of
duties, no reason, no idempotency key, and no immutable revocation ledger row. This was a real,
reachable critical hole, and R8 did not address it.

**How it is closed — without editing a single byte of 21H.** The CF11 migration runs after 21H and
supersedes the function:

1. **Transaction-local ticket.** `public.cf11_revocation_tickets` keys authorisation on
   `txid_current()`. The table has RLS enabled, no policies, and `REVOKE ALL` from `anon`,
   `authenticated` and `service_role`; the three `SECURITY DEFINER` helpers
   (`cf11_open_revocation_ticket`, `cf11_close_revocation_ticket`, `cf11_has_revocation_ticket`)
   are revoked from `PUBLIC` and from every Data API role. There is no GUC, no client-set
   `current_setting`, and no boolean bypass argument anywhere in the path, so nothing here is
   spoofable by an authenticated caller.
2. **Guarded generic RPC.** `lesson_capability_transition` is re-declared with the identical 21H
   signature and grants, and calls `public.cf11_assert_demotion_allowed(...)` before any privilege
   branch and before any mutation. For a lesson bound to a CF11 publication, any of the canonical
   seven capabilities marked `REQUIRED`, leaving `READY` for a non-`READY` status is refused with
   `CF11_DIRECT_TRANSITION_FORBIDDEN` (SQLSTATE 42501) unless a ticket for this exact transaction
   exists — i.e. unless the call is inside `golden_lesson_revoke_cf11_ready`.
3. **Table-level trigger.** `cf11_guard_lifecycle_demotion` fires `BEFORE UPDATE OR DELETE` on
   `lesson_capability_lifecycle` and applies the same policy to raw DML, so neither `service_role`
   nor direct SQL can route around the RPC.
4. **Grant truth asserted at install time.** The migration refuses to install if any Data API role
   holds `INSERT`/`UPDATE`/`DELETE` on the lifecycle table (`CF11_RAW_TABLE_BYPASS`), or if the
   ticket table or its helpers are reachable (`CF11_TICKET_TABLE_REACHABLE`, `CF11_TICKET_FORGEABLE`).
5. **Legacy behaviour untouched.** The guard returns immediately when the lesson has no CF11
   publication, so every non-Golden lesson keeps exactly the 21H semantics.

**Fixture honesty.** The PG17 fixture previously collapsed `is_content_staff` onto `admin`, which
would have hidden this bypass. It now matches production (`admin` OR `content_manager`), and a
legacy unmanaged lesson (`...099`) was added.

**PG17 section O** (written, not executed; no `EXCEPTION WHEN OTHERS`) asserts: non-admin content
staff direct `READY -> DRAFT` and `READY -> REVIEW` refused with zero lifecycle/audit writes and
visibility unchanged; a full admin refused on all seven the same way; ticket table/helpers
unreachable and raw lifecycle DML ungranted; owner-level raw `UPDATE`/`DELETE` refused by the
trigger; and the legacy lesson still transitioning `READY -> DRAFT -> REVIEW` normally. Section N
(unchanged) remains the only successful demotion: separate qualified admin, reason, exact
idempotency key, seven `DRAFT` + `REQUIRED`, visibility false, exactly one immutable ledger row,
same-key replay zero-write.

**FINAL_VERDICT = PASS_CF11_R8B_SOURCE_READY_FOR_INDEPENDENT_PG17_GATE**
(source-only; the independent PG17 gate remains outstanding and unexecuted).

## R9B — executable fixture ordering and required columns

Base commit: `78d382a896e88c165e97762d180e1c2c12be6556`. Source only, zero production writes.

An independent PG17 transaction established two facts:

- The exact R8B CF11 migration, alone, **installs successfully on the live production schema and
  rolls back cleanly**; no CF11 table, function, trigger or history row survives the rollback.
  `MIGRATION_SCHEMA_INSTALL_ROLLBACK=PASS`.
- The full clean-room fixture cannot run unchanged against the live production schema (expected),
  but it exposed two genuine fixture defects, both of which are now fixed once and for all:

| Defect | Fix |
| --- | --- |
| The legacy lesson `43000000-…-099` was inserted **before** the Iron lesson `…-012`, and derived its `subject_id` with `SELECT subject_id FROM public.lessons WHERE id = '…-012'` — a not-yet-created row, so `subject_id` was NULL and the FK failed. | The early legacy INSERT block is **removed entirely**. The legacy lesson is now inserted only **after** the authoritative fixture grade, subject and Iron lesson exist, with an **explicit** `subject_id = 42000000-0000-0000-0000-000000000012`. |
| The legacy insert omitted the required `lessons.title` (and other required fixture columns). | It now uses the **full explicit column list** matching the fixture lesson schema — `id, slug, subject_id, unit_id, title, is_free, semester, sort_order` — with non-null values, followed by its `READY` + `REQUIRED` lifecycle row. |

No CF11 migration or security code was touched; the migration SHA-256 is unchanged at
`311265f33580f2ce1cffbc56a974c0978e5d8bf7e2713141db637c975ac69691`.

Two new static tests (`CF11-R9B/1`, `CF11-R9B/2`) prove the ordering (grade → subject → Iron
lesson → legacy lesson), the absence of any `SELECT subject_id FROM public.lessons` derivation,
and the full non-null required column set including `title` and the explicit subject.

The full clean-room PG17 rehearsal remains **pending an independent rerun**; it has not been
executed in this environment.

**FINAL_VERDICT = PASS_CF11_R9B_SOURCE_READY_FOR_CLEAN_PG17_RERUN**


## R9C — independent PG17 findings and replay-plan closure

Base: R9B `05ccc375da25dfbddb0b4709cf4bcefb88ddf032`. Production writes: zero.

The repository-owned GitHub Actions gate executed the complete CF04→CF11 chain on a clean
PostgreSQL 17 instance. It correctly failed closed twice:

1. The clean fixture still carried a broad historical PostgREST grant on
   `lesson_capability_lifecycle`; the R9C fixture now mirrors the already-approved production
   20C hardening by revoking raw DML from `authenticated`.
2. The CF11 durable asset report omitted `storageBucket` and `storagePath`, although replay
   validates exact storage identity. This made a legitimate replay fail with
   `CF11_REPLAY_LIVE_STATE_CONFLICT: asset.OFFICIAL-FIGURE-1-1`.
   The plan now pins both fields and a static regression test enforces the contract.

Because the CF11 migration bytes changed, its current SHA-256 is
`0d88ec8605c25dbf4aafa6bd4d080273ceac43a032bbbbfdf6d53d0436d03957`.
The older `311265f3…` value remains historical for R8B/R9B only and must not be applied.
Production remains untouched until the refreshed clean PG17 run succeeds.
