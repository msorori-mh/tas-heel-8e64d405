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

## Security model

* `golden_lesson_publish_cf11` and `golden_lesson_attest_cf11_ready` are granted to `authenticated`
  only and re-derive `auth.uid()`; `_actor_id` must agree. The server functions call them with the
  operator's own token (`context.supabase`) — never the service role. An agent cannot approve.
* Separation of duties is enforced in the schema:
  `CHECK (ready_attested_by IS NULL OR ready_attested_by <> published_by)`. The UI disables the
  attest controls for the operator who published.
* Assets live in the private `golden-lesson-assets` bucket at the content-addressed path
  `<lesson_id>/<sha256>-<leaf>`. No public bucket, no overwrite: a differing hash for the same
  `asset_code` raises `CF11_ASSET_HASH_CONFLICT`.
* Only declared `src="<leaf>"` references are rewritten. The rewrite is proven reversible against
  the original body (`CF11_OFFICIAL_TEXT_DRIFT`), so official text cannot change.
* Answers and rationales stay in `official_question_answers` / `question_option_rationales`; the
  initial student payload is scanned by `cf10_assert_no_answer_leak` for every published body.
* `DRAFT → REVIEW` is the only transition CF11 publication performs. READY is a separate RPC.

## Expected write counts (production, when applied and executed)

| Step | Writes |
| --- | --- |
| Asset upload (`verifyGoldenLessonCf11Assets`) | 1 storage object (idempotent; 0 on replay) |
| `golden_lesson_publish_cf11(mode => 'DRY_RUN')` | 0 |
| `golden_lesson_publish_cf11(mode => 'EXECUTE')` | 1 publication row, 1 published-asset row, 1 book-content update, 2 `lesson_resources` (mindmap + experiment), 45 question revisions published, 40 assessment memberships, 7 lifecycle rows `DRAFT → REVIEW` |
| `golden_lesson_attest_cf11_ready(mode => 'DRY_RUN')` | 0 |
| `golden_lesson_attest_cf11_ready(mode => 'EXECUTE')` | lifecycle rows `REVIEW → READY` + 1 publication row update (attestation evidence) |

Replay of either RPC returns the recorded result with `writes_performed = 0`.

## Rollback

CF11 adds tables and functions only; it alters no earlier migration bytes (R5, 21H, CF04, CF07,
CF08, CF09, R9, CF10 are unchanged). To roll back before READY: delete the
`golden_lesson_publications` row for the batch and reset the seven lifecycle rows to `DRAFT`; the
uploaded asset object is content-addressed and harmless to retain. After READY, roll back by
transitioning the lifecycle rows back to `REVIEW` — student visibility requires READY.

## Operator runbook

1. Sign in as a content operator (admin or content_manager) and open **الاستيراد → نشر الدرس الذهبي (CF11)**.
2. Build/upload the verified bundle and take the package through
   `DRAFT → SUBMITTED → CONTENT_APPROVED → APPROVED_FOR_STAGING` in the review panel.
3. Stage the domain bundle, bind the authoritative identity, then press **تجسيد CF10**.
4. Press **تحقق ورفع الأصول** — this verifies JPEG magic bytes and the pinned hash before upload.
5. Press **CF11 DRY_RUN**, read the plan, then **نشر إلى REVIEW**.
6. Open **معاينة الطالب** and run
   `node scripts/e2e/iron-cf11-student-probe.mjs --base <url> --lesson <lesson-uuid>`.
7. A **different** operator writes a review note and presses **فحص الاعتماد** then **اعتماد READY**.

## Verification performed in this task

* PG17 rehearsal R5 → 21H → CF04 → CF07 → CF08 → CF09 → R9 → CF10 → CF11 with the Iron fixture,
  assertions and `content-factory-11-postverify.sql`: `PASS_CONTENT_FACTORY_11_POSTVERIFY`.
* Regression: 209/209. Iron bundle + CF11 asset suites: 24/24. Typecheck clean. Production build OK.

## Remaining production-only steps

Applying the CF11 migration, running the operator sequence above, and executing the student probe
against the published lesson id. All three require an explicit production authorization.
