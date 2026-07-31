# QB-01-DESIGN-FREEZE-DECISION-07

Source-only design freeze for Question Bank QB-01. No migration apply. No runtime change.

| Field | Value |
|---|---|
| Repository | `msorori-mh/tas-heel-8e64d405` |
| Base HEAD | `6e35245ed73eb4c3c8ea76a2c010d8e4d7b0348c` |
| Branch | `docs/qb-01-design-freeze-source-only-07` |
| Runtime baseline (architecture audit) | `9d6eb603fead085f8fa86f29647a8c5e51cab2af` |
| Migration under `supabase/migrations` | **NO** |
| SQL executed | **NO** |
| Decision status | **FROZEN for source design** — apply still gated |

---

## Runtime evidence (pre-freeze)

### correct_index

| Surface | Convention | Evidence |
|---|---|---|
| Exam UI / lesson quiz / unit practice | **0-based** array index `i` | `exams.strict.$templateId.tsx` (~366–377); `lessons.$lessonId.tsx` (~718–735); `units.$unitId.practice.tsx` (~415–422) |
| `answer_exam_question` | allows `selected_index = 0` | `20260607234143_…sql:230-232` |
| `check_lesson_question` / `grade_lesson_quiz` / `submit_exam_session` / unit grade | `selected_index = correct_index` (no ±1) | migrations cited in audit |
| Content-import validators / templates | **1-based 1–6** | `content-import-validators.ts:107-117` |

**Frozen:**

```text
Runtime DB / legacy cache: questions.correct_index = 0-based
Legacy Excel / dry-run: correct_index = 1-based
Official normalized import: option_code only (no correct_index column)
Conversion (explicit, never silent):
  Excel 1-based → resolve option position → option_code
  → question_options.is_correct
  → legacy questions.correct_index 0-based cache via qb_sync_question_legacy
```

`OWNER_DECISION_REQUIRED` for this convention is **closed**.

### Current attempt storage

| Fact | Answer |
|---|---|
| Pins revision? | **NO** |
| Question text snapshot? | **NO** |
| Option order snapshot? | **NO** |
| `question_revision_id`? | **NO** |
| Editable after session start? | **YES** (schema allows content-staff UPDATE on `questions`) |
| Grading basis | **LIVE** join to `questions` |
| Option shuffle in product today | **NO** (not implemented) |
| Legacy attempts may exist | **YES** — must not re-interpret scores |

`exam_session_answers` today: `session_id`, `question_id`, `selected_index`, grade fields only (`types.ts` / `20260607234143_…`).

### Role model

`app_role`: `admin | moderator | user | content_manager`.
`is_content_staff` = admin OR content_manager.
**No** `reviewer` / `grader` enum values. Do not invent them by default.

---

## 1. Logical question identity

**Frozen:** keep `public.questions` as the logical hub.

Minimum logical fields (additive, non-breaking):

- `id`, `code` (stable `question_code`)
- `current_published_revision_id` (nullable until first publish)
- `created_at`, `created_by`, `updated_at` (metadata only — **not** versioning)
- Legacy cache columns retained until QB-09: `options`, `correct_index` (0-based), `explanation`, `lesson_id`, `subject_id`, `unit` (text)

Permanent taxonomy that may stay on logical row (non-versioned): stable code, created_by, archival flags.
**Versioned content never lives solely on the logical row as SoT.**

---

## 2. Revision identity

**Frozen:** `question_revisions`

| Column | Notes |
|---|---|
| `id` | revision identity |
| `question_id` | logical FK |
| `revision_number` | monotonic per question |
| `status` | see below |
| `interaction_type` | TEXT + import/admin validation (no closed CHECK of 26) |
| `grading_mode` | `AUTO_SINGLE` \| `AUTO_TEXT` \| `MANUAL` |
| `educational_label` | optional display |
| `question_text` | required |
| `stimulus_text` | optional |
| `max_score` / default points | |
| `allow_partial` | |
| `requires_media` | |
| `manual_grading_required` | |
| `created_at` / `created_by` | |
| `reviewed_at` / `reviewed_by` | |
| `published_at` / `published_by` | |
| `superseded_at` | |
| `payload_hash` | integrity |
| `source_import_hash` | backfill/import provenance |

### Revision statuses

```text
DRAFT
READY_FOR_REVIEW
APPROVED
PUBLISHED
SUPERSEDED
REJECTED
```

Import Excel allowed inbound statuses: `DRAFT` \| `READY_FOR_REVIEW` only.
`Published` / `متاح` rejected (or legacy-warn only). Publishing is a **server-side capability action**, never an Excel apply side effect.

### Revision rules

1. Published revision is **immutable**.
2. Revision referenced by any attempt/session snapshot is **immutable**.
3. Edit of published content → **new** revision (DRAFT).
4. Re-import by `question_code` → new DRAFT revision; never mutate PUBLISHED/SUPERSEDED used rows.
5. At most **one** PUBLISHED revision per logical question (`current_published_revision_id`).
6. `updated_at` is **not** versioning.
7. Soft-archive logical question; never hard-delete history needed by attempts.
8. Used revisions: no hard delete.

---

## 3. Revision-scoped children

**Frozen:** all mutable content attaches to `question_revision_id`, **not** logical `question_id`.

| Entity | Attachment |
|---|---|
| `question_options` | `question_revision_id` |
| `question_accepted_answers` | `question_revision_id` |
| `question_solutions` | `question_revision_id` |
| `question_solution_steps` (optional P1) | `question_revision_id` |
| `question_media` | `question_revision_id` |
| Rubric / grading criteria | `question_revision_id` |
| `question_targets` | **logical `question_id`** for P0 curriculum binding (stable targeting); if a future edit must version targets, add revision-level override later — document as P1 |
| Stimulus text | column on `question_revisions` |
| Exam/assessment membership | pin `question_revision_id` at publish/session (see §4) |

**HOLD condition avoided:** options/solutions must not remain mutable on logical `question_id` while claiming immutable published revisions.

Normalized SoT for correctness: `question_options.option_code` + `is_correct` on the revision.

---

## 4. Attempt pinning model — **Model A (official)**

**Frozen choice: Model A — Session question snapshot**

New entity (design only):

```text
exam_session_questions
  exam_session_id
  question_revision_id
  logical_question_id          -- denormalized for joins
  question_order
  rendered_question_text
  rendered_stimulus
  rendered_options jsonb       -- [{option_code, body, display_index}, ...]
  option_order_mapping jsonb   -- display_index → option_code
  max_score
  payload_hash
  pin_mode = 'REVISION_PINNED'
```

Answers link to `exam_session_questions.id` (preferred) and store:

- `selected_option_code` (MCQ) **or** `response_text` / `response_payload` (text)
- optional `display_selected_index` only as derived of the **frozen** mapping (never sole SoT)

**Rejected as durable SoT:** `question_id + selected_index` alone.

Lesson quiz / unit practice: same pin pattern in their packages (QB-06), or temporary LEGACY path until cutover — new attempts after cutover must pin.

### Why not Model B alone

Model B (revision pin + option-order on answer row) is lighter but easier to under-specify for rendered text/stimulus. Model A makes the student-visible payload explicit and hashable.

### Shuffle

Not implemented today. When enabled: shuffle **only** at snapshot creation into `rendered_options` / `option_order_mapping`. Grade via `option_code`, never via live `sort_order`.

---

## 5. Option-order snapshot

Mandatory for REVISION_PINNED attempts:

- Persist display order at session start (or first render freeze).
- Grade MCQ by `selected_option_code` against revision’s `is_correct`.
- `selected_index` may exist as legacy/display helper **only** against frozen mapping.

---

## 6. Correct-index conventions (closed)

See Runtime evidence. Sync RPC writes **0-based** cache. Import adapters convert 1-based Excel explicitly.

---

## 7. Manual response storage

**Frozen:** do not overload `selected_index` for text.

Design entity (name may be unified with exam answer row extensions):

```text
student_question_responses  (or extended exam_session_answers + lesson/unit equivalents)
  pin_ref                    -- exam_session_questions.id or equivalent
  question_revision_id
  response_text
  selected_option_code
  response_payload jsonb
  submitted_at
  grading_status
  auto_score
  manual_score
  final_score
  max_score
  requires_manual_review
```

---

## 8. Manual grading lifecycle

```text
NOT_REQUIRED
PENDING_MANUAL_REVIEW
IN_REVIEW
GRADED
RETURNED_FOR_SECOND_REVIEW
FINALIZED
```

Entity: `question_response_reviews`

- `response_id`, `grader_id`, `score_awarded`, `feedback`, `previous_score`, `reason`, `created_at`, `is_final`
- Full audit on every score change

Session academic completion:

- `submitted_pending_grading` / `partially_graded` / `completed`
- Must not mark academically complete while required items remain `PENDING_MANUAL_REVIEW`
- `user_progress.quiz_score` remains MCQ legacy contract until a new contract in QB-06 — **no silent essay write**
- Post-FINALIZED score change: higher privilege + reason + audit

---

## 9. Accepted answers

`question_accepted_answers` → `question_revision_id`

- P0: `SHORT_TEXT` + `grading_mode=AUTO_TEXT` only with explicit rules
- Policies: `EXACT` | `TRIM` | `TRIM_COLLAPSE` | `CASEFOLD_AR`
- Linguistic ambiguity → `MANUAL`
- No fuzzy/AI matching in QB-01

---

## 10. Capability model

Logical capabilities (not new enum values by default):

| Capability | P0 mapping |
|---|---|
| `can_edit_question_bank` | `is_content_staff` |
| `can_review_question_content` | `is_content_staff` |
| `can_publish_question_revision` | `is_content_staff` (may tighten to admin later) |
| `can_grade_manual_response` | `is_content_staff` |
| `can_read_hidden_solutions` | `is_content_staff` OR grader path via SECURITY DEFINER RPC |

Future: optional `question_bank_capabilities` table for split reviewer/grader without inventing `app_role` values.
**Grader must not UPDATE bank tables** — only responses/reviews via RPC.

---

## 11. Media architecture

`question_media` → `question_revision_id`

Fields: `media_code`, `storage_path`, `mime_type`, `file_size`, `sha256`, `alt_text_ar`, `caption`, `sort_order`, `requires_media`, audit cols.

Bucket (design only, **not created now**): `question-media`

- Path: `qb/{question_code}/{revision_id}/{media_code}.{ext}`
- MIME allowlist: image/png, image/jpeg, image/webp, application/pdf (P0); audio later
- Max size: images 5MB, pdf 10MB (tunable)
- Thumbnails for weak-internet
- Signed URL read for entitled students
- Reject `..`, absolute paths, foreign buckets
- Never replace/delete object still referenced by PUBLISHED/used revision
- Orphan cleanup = separate job
- Offline: required media within budget only

---

## 12. Backfill model

For each legacy `questions` row:

1. Treat row as logical identity (`code` required or generate with report).
2. Create revision `#1` status `PUBLISHED` or `DRAFT` per policy (prefer DRAFT then controlled publish — **owner ops**; default freeze: backfill as `PUBLISHED` only if already served, else `DRAFT` — **implementation chooses with report**; recommended: revision 1 = `PUBLISHED` mirroring current production content to avoid breaking live joins during dual-read, then freeze immutability going forward).
3. Expand `options` JSON → `question_options` on that revision.
4. Map `correct_index` **0-based** → `is_correct` on matching sort position.
5. Copy `explanation` → `question_solutions`.
6. Create primary LESSON/SUBJECT target from `lesson_id`/`subject_id`.
7. Store source hash; dry-run compare.
8. Do not mutate legacy during dry-run.
9. Abort row on invalid data (missing options for MCQ, out-of-range index, etc.).

---

## 13. Compatibility direction

```text
Normalized revision (SoT) → Legacy cache  ONLY
via SECURITY DEFINER qb_sync_question_legacy (atomic)
```

Writes:

- `options` JSON array by `sort_order`
- `correct_index` **0-based** index of first correct option (SINGLE_CHOICE phase)
- `explanation` from solutions
- `lesson_id` / `subject_id` / derived `unit` text cache from primary target

No client dual-write. Legacy attempts remain `pin_mode=LEGACY` and are not re-graded.

---

## 14. Legacy attempts strategy

| Mode | Behavior |
|---|---|
| `LEGACY` | Existing rows: `question_id + selected_index`; scores immutable; no guessed backfill of revisions |
| `REVISION_PINNED` | New attempts after cutover |

Marker column on session/answer (design): `attempt_schema_version` or `pin_mode`.

---

## 15. RLS / GRANT principles (matrix summary)

| Entity | Student | Content editor | Reviewer* | Publisher* | Grader* | Admin |
|---|---|---|---|---|---|---|
| questions (logical meta) | limited RPC | RW draft meta | R | R | R | ALL |
| question_revisions | published text via RPC only | RW DRAFT/REJECTED own flow | R + review fields | publish action | R published+needed | ALL |
| question_options | body via RPC **without** `is_correct` | RW on draft rev | R | R | R | ALL |
| accepted_answers | **deny** until reveal policy | RW draft | R | R | R when grading | ALL |
| solutions | **deny** until reveal | RW draft | R | R | R when grading | ALL |
| media metadata | entitled read via signed URL RPC | RW draft | R | R | R | ALL |
| targets | R via content RPC | RW | R | R | — | ALL |
| session snapshots | own session R | — | — | — | R for grade | ALL |
| responses | own insert/update pre-submit rules | — | — | — | R + grade RPC | ALL |
| response_reviews | deny | — | — | — | insert via RPC | ALL |

\*P0: reviewer/publisher/grader capabilities map to `is_content_staff` helpers; still **no** broad `GRANT` to `authenticated` on sensitive columns.
`REVOKE … FROM PUBLIC`; SECURITY DEFINER + `SET search_path TO 'public'`; deny-by-default RLS.

---

## 16. Remaining implementation risks (non-blocking for this freeze doc; blocking for apply)

1. Exact cutover flag for when REVISION_PINNED becomes mandatory for exams.
2. Whether backfill revision 1 starts PUBLISHED vs DRAFT (ops choice with report).
3. Targets versioning if curriculum retarget mid-life (P1).
4. Unified vs per-surface response tables (exam vs lesson vs unit).
5. Thumbnail pipeline implementation details.

None of these reopen 0-based/1-based, revision-scoped children, or attempt pin SoT.

---

## 17. Conditions before creating **executable** migration (later package)

1. This freeze PASS (or PASS_WITH_NOTES) + independent review PASS.
2. VERSIONING_DECISION no longer HOLD — **closed by this freeze** for design; apply still requires migration PR review.
3. SQL draft remains commented until a dedicated QB-01 migration authoring package.
4. No student-facing new interaction types enabled until QB-06 safe reads.
5. Capability helpers implemented as deny-by-default.
6. Sync RPC proves 0-based cache in tests (source tests, not prod writes).

**QB-01 apply remains forbidden in this package.**

---

## Cross-links

- `docs/QUESTION-BANK-OFFICIAL-DESIGN-01.md`
- `docs/QUESTION-BANK-IMPLEMENTATION-PLAN-01.md`
- `docs/QUESTION-BANK-TEMPLATE-COMPATIBILITY-MATRIX-01.md`
- `docs/QUESTION-BANK-CURRENT-ARCHITECTURE-AUDIT-01.md`
- `docs/migration-drafts/QUESTION-BANK-SCHEMA-FOUNDATION-01.NOT_APPLIED.sql`
