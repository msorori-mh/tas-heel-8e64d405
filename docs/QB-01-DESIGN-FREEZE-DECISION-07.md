# QB-01-DESIGN-FREEZE-DECISION-07

Source-only design freeze for Question Bank QB-01. No migration apply. No runtime change.

| Field | Value |
|---|---|
| Repository | `msorori-mh/tas-heel-8e64d405` |
| Base HEAD | `6e35245ed73eb4c3c8ea76a2c010d8e4d7b0348c` |
| Branch | `docs/qb-01-design-freeze-source-only-07` |
| Independent review HOLD closed by | **HOLD-CORRECTION-09** |
| Migration under `supabase/migrations` | **NO** |
| SQL executed | **NO** |

---

## Independent Review HOLD Closure

Source: `HOLD_QB_01_DESIGN_FREEZE_INDEPENDENT_REVIEW_08`

| # | Blocker | Decision | Status |
|---|---|---|---|
| 1 | Response topology | **HYBRID** | CLOSED |
| 2 | Backfill R1 status | Deterministic PUBLISHED / DRAFT / HOLD ROW | CLOSED |
| 3 | Accepted-answer normalization | EXACT / TRIM / TRIM_COLLAPSE only; **CASEFOLD_AR = DEFERRED_TO_P1 / NOT ALLOWED IN QB-01** | CLOSED |
| 4 | Grader/editor separation | `question_bank_capability_grants` + separate helpers | CLOSED |
| 5 | Named cutover | `question_bank_runtime_config.attempt_pin_mode` default **LEGACY** | CLOSED |
| 6 | Published pointer | Composite FK `(id, current_published_revision_id) → (question_id, id)` DEFERRABLE | CLOSED |
| 7 | Payload hash | SHA-256 over `canonical_payload_v1` (JCS / RFC 8785) | CLOSED |
| 8 | Manual grading transitions | Formal matrix + claim/idempotency | CLOSED |
| 9 | Target retarget | Audited `retarget_question` RPC; targets stay logical P0 | CLOSED (PASS_WITH_NOTES for P1 versioned targets) |

---

## Runtime evidence (pre-freeze)

| Surface | Convention | Evidence |
|---|---|---|
| Exam / lesson / unit UI | **0-based** `i` | routes compare `correct_index === i` |
| RPCs | `selected_index = correct_index` | check/grade/submit/unit |
| Import validators | **1-based 1–6** | `content-import-validators.ts` |
| Attempt storage today | `question_id + selected_index` only | no revision/snapshot |
| Apply writer 1→0 | **absent** | dry-run only |
| Roles | `admin\|moderator\|user\|content_manager` | `is_content_staff` = admin\|content_manager |

```text
Runtime DB / legacy cache: questions.correct_index = 0-based
Legacy Excel / dry-run: 1-based
Official import: option_code only
Excel 1-based → option_code → is_correct → sync writes 0-based cache
```

---

## 1. Logical + revision identity

- Logical: `public.questions` (`id`, `code`, `current_published_revision_id`, created_*, legacy cache cols).
- Revision: `question_revisions` with content, grading_mode, stimulus, scores, status, review/publish metadata, `payload_hash`, `payload_hash_version`, `source_payload_hash`, `backfill_version`.

Statuses: `DRAFT | READY_FOR_REVIEW | APPROVED | PUBLISHED | SUPERSEDED | REJECTED`.

Rules: published/used immutable; edit → new revision; re-import → new DRAFT; `updated_at` ≠ versioning; no hard-delete of used revisions.

### Published pointer — PASS

```text
question_revisions: UNIQUE (question_id, id)
questions (id, current_published_revision_id)
  REFERENCES question_revisions (question_id, id)
  DEFERRABLE INITIALLY DEFERRED
current_published_revision_id nullable
Partial unique: one PUBLISHED per question_id
```

Future migration order: create revisions → unique(question_id,id) → add pointer column → composite FK → later backfill pointer in separate txn.

---

## 2. Revision-scoped children

Attach to **`question_revision_id`**: options, accepted_answers, solutions, media, rubrics.
`question_targets` → logical **`question_id`** (P0) with audited retarget.

SoT correctness: `option_code` + `is_correct` on revision.

---

## 3. RESPONSE_STORAGE_MODEL = HYBRID — PASS

### Exam surface

Keep `exam_sessions` + add `exam_session_questions` + **extend** `exam_session_answers` (no parallel exam response table).

`exam_session_questions`: session_id, question_revision_id, logical_question_id, question_order, rendered_question_text, rendered_stimulus_text, rendered_options, option_order_mapping, max_score, payload_hash, pin_mode, created_at.

`exam_session_answers` extensions: exam_session_question_id, question_revision_id, selected_option_code, response_text, response_payload, requires_manual_review, grading_status, auto/manual/final_score, max_score, submitted_at, graded_at, finalized_at; keep `question_id` + nullable `selected_index` for LEGACY.

Rules: new answers require `exam_session_question_id`; revision_id must match pin; `selected_option_code` is MCQ SoT; `selected_index` legacy-only; text never in selected_index; no reinterpret of legacy rows.

### Lesson / unit practice surface

```text
practice_attempts
practice_attempt_questions
practice_attempt_responses
```

`practice_attempts.attempt_type`: `LESSON | UNIT` with CHECK:

- LESSON → `lesson_assessment_id NOT NULL AND unit_id IS NULL`
- UNIT → `unit_id NOT NULL AND lesson_assessment_id IS NULL`

Also: user_id, started_at, submitted_at, grading_status, total/max score, `attempt_pin_mode`.

Pin/snapshot columns mirror exam session questions. Responses mirror exam answer new fields (no selected_index as SoT).

### Unified analytics (read-only)

```text
v_question_responses_unified
```

UNION of exam + practice responses for reporting only. **No writes** through the view. **Not** a source of truth.

```text
RESPONSE_STORAGE_DECISION: PASS
Chosen model: HYBRID
```

---

## 4. Attempt pinning + cutover — PASS

Model A snapshots for REVISION_PINNED sessions. Grade by `option_code`. Shuffle only at snapshot creation. `rendered_options` must **omit** `is_correct`.

### `question_bank_runtime_config` (singleton id=1)

- `attempt_pin_mode`: `LEGACY` | `REVISION_PINNED`
- Default after QB-01 apply: **`LEGACY`** (apply must not flip to REVISION_PINNED)
- Change only via audited admin RPC
- Session copies mode at create into `exam_sessions.attempt_pin_mode` / `practice_attempts.attempt_pin_mode`
- In-flight sessions keep their mode; no silent fallback; snapshot failure aborts new REVISION_PINNED session start

```text
CUTOVER_CONFIG_DECISION: PASS
```

Legacy attempts: `pin_mode=LEGACY`; scores immutable; no guessed revision backfill.

---

## 5. Backfill Revision #1 — PASS (deterministic)

### PUBLISHED if any of

1. In `assessment_questions`
2. In `exam_template_questions`
3. Linked to a lesson reachable in current student UI
4. Used by unit/subject practice RPC/query paths
5. Any student answer/attempt references the question
6. On a published/available content path per current runtime

### DRAFT if

Convertible; not on any student delivery path; no historical attempt/answer; no evidence published/used.

### HOLD ROW (no backfill) if

Invalid options JSON; correct_index OOB; SINGLE_CHOICE not exactly one correct; empty question_text; unresolved lesson/subject; code conflict; data that would change a correct answer. Dry-run reports; batch apply blocked until critical rows cleared.

### Historically used, not currently shown

R1 = **PUBLISHED**, later **SUPERSEDED** when newer revision published. Never reinterpret old attempts.

### Idempotency

Key: `question_id + revision_number=1` + `source_payload_hash` + `backfill_version`.
Rerun: same hash → NOOP; different → `HOLD_RECONCILIATION`; never auto-mutate R1.

```text
BACKFILL_DECISION: PASS
```

---

## 6. Accepted answers — PASS

Revision-scoped. P0 policies only:

| Policy | Definition |
|---|---|
| EXACT | UTF-8 equality as stored; no trim/fold |
| TRIM | Strip leading/trailing Unicode whitespace only |
| TRIM_COLLAPSE | NFKC → trim ends → collapse internal whitespace runs to one ASCII space; **keep** diacritics/hamza/alef/ya/ta-marbuta/punctuation; exact compare |

```text
CASEFOLD_AR: DEFERRED_TO_P1 / NOT ALLOWED IN QB-01
```

Need diacritic/hamza/ya/ta-marbuta folding or semantic match → `grading_mode = MANUAL` until a tested Arabic algorithm exists. No AI grading in QB-01.

```text
ACCEPTED_ANSWER_NORMALIZATION_DECISION: PASS
```

---

## 7. Authorization — PASS

Table: `question_bank_capability_grants`
(`user_id`, `capability`, `scope_type`, `scope_id`, grant/revoke audit, `reason`)

Capabilities: `EDIT_QUESTION_BANK` | `REVIEW_QUESTION_CONTENT` | `PUBLISH_QUESTION_REVISION` | `GRADE_MANUAL_RESPONSE` | `READ_HIDDEN_SOLUTIONS`

| Principal | Default |
|---|---|
| Admin | all via explicit admin helper bypass |
| Content manager | EDIT + REVIEW + READ_HIDDEN only; **not** GRADE or PUBLISH unless explicit grant |
| Moderator | none |
| User | none |
| Grader (grant) | GRADE + READ_HIDDEN only; **never** EDIT or PUBLISH |

Helpers (separate, SECURITY DEFINER, `search_path`, REVOKE PUBLIC, fail-closed):
`can_edit_question_bank` / `can_review_question_content` / `can_publish_question_revision` / `can_grade_manual_response` / `can_read_hidden_solutions`.

**Not** all mapped to `is_content_staff`.

```text
AUTHORIZATION_DECISION: PASS
```

---

## 8. Manual grading — PASS

Statuses: `NOT_REQUIRED | PENDING_MANUAL_REVIEW | IN_REVIEW | GRADED | RETURNED_FOR_SECOND_REVIEW | FINALIZED`

| From | To | Who | Conditions |
|---|---|---|---|
| PENDING_MANUAL_REVIEW | IN_REVIEW | Authorized grader | Atomic claim/assign |
| IN_REVIEW | GRADED | Assigned grader | Score in 0..max_score |
| GRADED | RETURNED_FOR_SECOND_REVIEW | Authorized reviewer | Reason required |
| GRADED | FINALIZED | Authorized finalizer | All session manual items ready |
| RETURNED_FOR_SECOND_REVIEW | IN_REVIEW | Second/authorized grader | Separation when required |
| FINALIZED | IN_REVIEW | Admin/authorized correction | Reason + corrective audit |
| else | else | — | Reject |

Assignment: optional `assigned_grader_id`; atomic claim; no dual claim; no self-grade if dual student/staff; scope enforced; `action_id`/idempotency_key; scores ≥0 and final ≤ max; client cannot write final_score; session `completed` only when autos done and manuals FINALIZED.

```text
MANUAL_GRADING_DECISION: PASS
```

---

## 9. Canonical payload hash — PASS

```text
payload_hash_algorithm: SHA-256 over canonical_payload_v1
payload_hash_version: 'canonical_payload_v1'
payload_hash: lowercase hex SHA-256
```

Canonical fields (semantic order): schema_version, question_code, revision_number, interaction_type, grading_mode, question_text, stimulus_text, max_score, allow_partial, options by option_code, accepted_answers by sort_order then normalized_answer, solution fields, media by sort_order then media_code.

Serialization: **JCS / RFC 8785**, UTF-8, no BOM, LF inside text, arrays keep listed semantic order. Exclude created/updated/by, signed/temp URLs, session data. Recipe change → new version; never reinterpret old hashes.

```text
PAYLOAD_HASH_DECISION: PASS
```

---

## 10. Target retarget — PASS_WITH_NOTES

Targets remain on logical `question_id` for P0. Mutations only via `retarget_question` RPC (`can_edit_question_bank`); published questions require reason; audit old/new/actor/time/reason; no mutation of historical snapshots/attempts; affects future selection only; cannot remove last primary target from published question without valid replacement. Versioned targets = P1.

```text
TARGET_SCOPE_DECISION: PASS_WITH_NOTES
```

---

## 11. Media (unchanged P0 design)

`question_media` on revision; designed bucket `question-media` (**not created here**); path `qb/{question_code}/{revision_id}/{media_code}.{ext}`; MIME allowlist; sizes; sha256; alt_text_ar; no replace/delete if referenced by published/used revision; signed URLs; not public by default.

---

## 12. Compatibility

```text
Normalized revision SoT → Legacy cache ONLY via qb_sync_question_legacy
correct_index cache = 0-based
```

No client dual-write.

---

## 13. Static consistency scenarios (HOLD closure)

| # | Scenario | Expected | Enforcement | PASS | HOLD if |
|---|---|---|---|---|---|
| 1 | Legacy session open when pin enabled | Stays LEGACY | session.attempt_pin_mode copy | Completes on legacy path | Mode flipped mid-flight |
| 2 | New REVISION_PINNED snapshot fails | Session start aborts | start RPC | No partial session | Silent LEGACY fallback |
| 3 | MCQ shuffled | Mapping frozen; grade by option_code | snapshot | Stable answer | Live sort_order grade |
| 4 | Resume app | Same snapshot/mapping | pin row | Same selection meaning | Regen shuffle |
| 5 | Legacy Q in template | R1 PUBLISHED | backfill rules | Linked + published | Draft while live |
| 6 | Unused convertible Q | R1 DRAFT | backfill rules | Not student-visible | Auto-publish |
| 7 | Invalid legacy Q | HOLD ROW | dry-run | No R1 | Published invalid |
| 8 | Backfill same hash | NOOP | idempotency | No second R1 | Duplicate rev |
| 9 | Backfill different hash | HOLD_RECONCILIATION | hash compare | No auto-mutate | Silent overwrite |
| 10 | Grader without edit | Can grade; cannot edit bank | capability grants | Edit denied | is_content_staff implies edit |
| 11 | CM without grade grant | Cannot grade | grants | Grade denied | Auto GRADE |
| 12 | Admin emergency grade | Allowed + audit | admin helper | Audited | Unguarded |
| 13 | Duplicate grade submit | Reject/idempotent | action_id | One effect | Double score |
| 14 | Change FINALIZED score | Correction path only | matrix | Reason+audit | Silent update |
| 15 | Needs diacritic fold | MANUAL | policy | Not AUTO_TEXT | CASEFOLD_AR used |
| 16 | Retarget published | Audited RPC | retarget_question | Reason logged | Direct table write |
| 17 | Old attempt no revision | LEGACY read | pin_mode | Score unchanged | Forced backfill |
| 18 | Unified report | Read-only view | v_question_responses_unified | No writes | View as SoT |
| 19 | Config change mid-open | Open sessions unchanged | session copy | Stable mode | Retroactive flip |
| 20 | Pointer to other question’s rev | Rejected | composite FK | Insert/update fails | Trigger-only hope |

---

## 14. Conditions before executable migration

1. Independent **rereview** PASS on this corrected freeze.
2. SQL draft still commented / not under `supabase/migrations`.
3. QB-01 apply leaves `attempt_pin_mode=LEGACY`.
4. No student-facing new types until QB-06A+.
5. Bucket/storage not created in docs package.

**Executable migration source authorized only after rereview — not by this correction alone.**
