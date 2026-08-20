# IRON-FIRST — Golden Lesson runbook (repeatable)

Scope: take a `content-packages/<pkg>` source folder to a **DRAFT** materialized lesson in
production. Nothing in this runbook publishes, sets `READY`, or makes a lesson student-visible.
CF11 (HTML publication) is a separate, later stage.

## 0. Source prep (no database, no network)

```bash
node scripts/content-factory/build-golden-lesson-bundle.mjs content-packages/chemistry-g12-iron-v3
bunx vitest run tests/content-packages/chemistry-g12-iron-golden-bundle.test.ts
```

Inputs the content team edits:

| File | Purpose |
| --- | --- |
| `golden-bundle.spec.json` | identity, profile, capability → leaf file mapping, answers companion |
| `<capability>.provenance.json` | required for every `OFFICIAL` capability |
| payload leaves (`*.html`, `*.json`) | one flat leaf file per capability, no folders |

Outputs (generated, not committed): `dist/golden-manifest.json`, `dist/<PACKAGE_CODE>.zip`.

The builder emits the manifest itself, so `schema`, `capabilityOrder`, `authority`, and profile
`applicability` can never drift from `src/lib/content-factory/golden-lesson-contract.ts`.

### Iron package identity (evidence-backed, nothing guessed)

| Field | Value | Evidence |
| --- | --- | --- |
| `gradeCode` | `GRADE-12` | CF09 matches it case-insensitively against `grades.slug = 'grade-12'` |
| `subjectCode` | `SUB-G12-012` | case-insensitive match on `subjects.code = 'sub-g12-012'` |
| `curriculumTrackCodes` | `aden`, `sanaa` | the only active `subject_curriculum_tracks` rows for the subject |
| `lessonSlug` | `الحديد-fe` | lesson natural key is `(subject_id, lessons.slug)` |
| `unitCode` | `null` | zero `units` rows exist for the subject; units are never invented |
| `semester` | `1` | official source set is the first unit (`تقويم الوحدة الأولى`) |
| `sortOrder` | `4` | official source file `الدرس الرابع-الحديد`, printed pages 14–18 |

`labExperimentHtml` is `OPTIONAL` under `GOLDEN_CHEMISTRY_V1`; it still ships bytes and a hash.

## 1. Two-person review chain (hard requirement)

`golden_lesson_advance_review` derives its actor from `auth.uid()` and enforces separation of
duties. It cannot be driven from a service-role script, psql, or an agent tool — only from an
authenticated staff session in the admin Content Factory UI.

| Transition | Required role | Identity rule |
| --- | --- | --- |
| `DRAFT → SUBMITTED` | `content_manager` | submitter |
| `SUBMITTED → CONTENT_APPROVED` | `content_manager` | **must differ from the submitter** |
| `CONTENT_APPROVED → APPROVED_FOR_STAGING` | `admin` | **must differ from the content approver** |

Required evidence flags: `packageValidationPassed`, then `officialProvenanceChecked` +
`answerSeparationChecked`, then `responsivePreviewChecked`.

**Prerequisite:** at least two distinct identities holding `content_manager`, one of which also
holds `admin` (or a third identity holding `admin`). With a single `content_manager` the chain
fails closed at `REVIEWER_MUST_DIFFER_FROM_SUBMITTER` and the package can never be staged.

## 2. Lesson shell (must exist before CF09)

CF09 binds an existing row; it never creates one. Create the shell exactly once:

```sql
INSERT INTO public.lessons (subject_id, slug, title, semester, sort_order, unit_id, is_free, delivery_mode)
SELECT '<subject_id>', 'الحديد-fe', 'الحديد Fe', 1, 4, NULL, true, 'in_app_content'
WHERE NOT EXISTS (
  SELECT 1 FROM public.lessons WHERE subject_id = '<subject_id>' AND lower(btrim(slug)) = 'الحديد-fe'
);
```

`is_free = true` keeps the lesson outside the paywall. It stays invisible to students regardless,
because `lesson_student_visible` returns `false` until every `REQUIRED` capability is `READY`.

## 3. Production sequence (single fail-closed run, admin session)

| # | Step | Entry point |
| --- | --- | --- |
| 1 | upload verified bundle to the private `golden-lesson-intake` bucket | `createGoldenLessonBundleUpload` |
| 2 | verify + stage manifest as `DRAFT`, then attest the bundle | `verifyAndStageGoldenLessonBundle` |
| 3 | review chain to `APPROVED_FOR_STAGING` | admin UI, two people (§1) |
| 4 | stage the domain bundle (staff-only payload rows) | `stageApprovedGoldenLessonDomainBundle` |
| 5 | bind authoritative identity | `bindApprovedGoldenLessonIdentity` (CF09) |
| 6 | materialize domain rows, `EXECUTE` mode | `golden_lesson_materialize_domain_batch` |

Any failing step rolls back that step. Never retry by relaxing a guard.

## 4. Post-verification

```sql
-- exactly one lesson, correct shape
SELECT count(*) FROM lessons WHERE subject_id = '<subject_id>';
-- exactly 7 lifecycle rows, all DRAFT
SELECT status, count(*) FROM lesson_capability_lifecycle WHERE lesson_id = '<lesson_id>' GROUP BY 1;
-- not student visible
SELECT lesson_student_visible('<lesson_id>');
-- no answer leak in the public payload
SELECT count(*) FROM question_options o
  JOIN question_revisions r ON r.id = o.question_revision_id
  JOIN question_targets t ON t.revision_id = r.id
 WHERE t.lesson_id = '<lesson_id>' AND o.is_correct;
SELECT count(*) FROM questions WHERE lesson_id = '<lesson_id>' AND correct_index >= 0;
-- CF10 defers all HTML: no mindmap/experiment rows
SELECT count(*) FROM lesson_resources WHERE lesson_id = '<lesson_id>';
-- exactly one materialization ledger row
SELECT count(*) FROM golden_lesson_domain_materializations WHERE lesson_id = '<lesson_id>';
```

Expected: `1`, `7 × DRAFT`, `false`, `0`, `0`, `0`, `1`.

## 5. Not in this stage

CF11 HTML publication, `REVIEW`/`READY` transitions, student visibility, publishing.
`mindMapHtml` and `labExperimentHtml` stay `deferred_to_cf11 = true` with zero domain rows.
