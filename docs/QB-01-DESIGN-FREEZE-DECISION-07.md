# QB-01-DESIGN-FREEZE-DECISION-07

Source-only design freeze for Question Bank QB-01. No migration apply. No runtime change.

| Field | Value |
|---|---|
| Repository | `msorori-mh/tas-heel-8e64d405` |
| Base HEAD | `6e35245ed73eb4c3c8ea76a2c010d8e4d7b0348c` |
| Branch | `docs/qb-01-design-freeze-source-only-07` |
| Independent review HOLD closed by | **HOLD-CORRECTION-11** (closes `HOLD_QB_01_DESIGN_FREEZE_INDEPENDENT_REREVIEW_10`) |
| Prior correction | HOLD-CORRECTION-09 |
| Migration under `supabase/migrations` | **NO** |
| SQL executed | **NO** |

---

## Independent Rereview HOLD Closure (CORRECTION-11)

Source: `HOLD_QB_01_DESIGN_FREEZE_INDEPENDENT_REREVIEW_10`

| # | Blocker | Decision | Status |
|---|---|---|---|
| 1 | Published pointer status invariant | Composite FK + `publish_question_revision` RPC + defensive trigger | **CLOSED** |
| 2 | Canonical payload hash ties / null / missing | Deterministic `canonical_payload_v1` + JCS + unique sort keys + golden vectors | **CLOSED** |
| 3 | Backfill priority / usage evidence | `INVALID > USAGE > UNUSED_VALID`; SQL evidence sets; `HOLD_ROW` / `HOLD_REVIEW` | **CLOSED** |
| 4 | Cutover atomicity | `attempt_pin_mode NOT NULL`; single create-RPC + `FOR SHARE` config lock; no partial session | **CLOSED** |
| 5 | Capability grant administration | Partial unique active grant; Admin-only grant RPCs in P0 | **CLOSED** |
| 6 | Manual grading session statuses + score constraints | Session statuses + dual nullable FKs + final_score RPC | **CLOSED** |
| 7 | Attempt snapshot notes | `logical_question_id` on practice pins; immutability after first response | **CLOSED** |
| 8 | Target consistency | Deterministic hierarchy checks in `retarget_question` | **CLOSED (PASS_WITH_NOTES)** |

Prior HOLD-CORRECTION-09 closures (HYBRID responses, CASEFOLD_AR deferred, grader≠editor, cutover named LEGACY) remain in force.

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
PUBLISHED_POINTER_DECISION: PASS
Enforcement: composite FK + publish RPC + defensive trigger
```

Kept:

```text
UNIQUE(question_id, id) on question_revisions
Composite FK DEFERRABLE INITIALLY DEFERRED:
  questions (id, current_published_revision_id)
  → question_revisions (question_id, id)
Partial unique: one active PUBLISHED per question_id
current_published_revision_id nullable when no published revision
```

Composite FK proves same-question membership only. It does **not** alone prove `status = PUBLISHED`.

#### Publish RPC (future, single transaction)

```text
publish_question_revision(
  p_question_id uuid,
  p_revision_id uuid,
  p_expected_current_revision_id uuid,
  p_idempotency_key text
)
```

Atomic order inside one transaction:

1. Authorize via `can_publish_question_revision`.
2. `SELECT … FROM questions WHERE id = p_question_id FOR UPDATE`.
3. Lock target revision; assert same `question_id`, `status = APPROVED`, not published for another question.
4. Prior published revision → `SUPERSEDED` when present.
5. Target revision → `PUBLISHED`.
6. Set `questions.current_published_revision_id = p_revision_id`.
7. Write audit (actor, before/after pointer, revision ids, key).
8. All-or-nothing rollback on any failure.
9. Idempotency: same key + same outcome → NOOP success; conflicting replay → reject.
10. Optimistic concurrency: if current pointer ≠ `p_expected_current_revision_id` → reject (no silent publish).

No application/UI path may write the pointer or flip publish status.

#### Defensive trigger (deferred enforcement, future migration)

Trigger(s) must reject:

- `questions.current_published_revision_id` pointing to a revision where `question_id ≠ questions.id` OR `status ≠ PUBLISHED`.
- Changing status of a currently-pointed revision away from `PUBLISHED` outside the authorized publish/supersede RPC path.

Do not rely on client or admin UI for this invariant.

---

## 2. Revision-scoped children

Attach to **`question_revision_id`**: options, accepted_answers, solutions (+ steps), media, rubrics.
`question_targets` → logical **`question_id`** (P0) with audited retarget.

SoT correctness: `option_code` + `is_correct` on revision.

Unique constraints that prevent hash ties:

| Child | Unique / sort stability |
|---|---|
| options | `UNIQUE(question_revision_id, option_code)` |
| accepted_answers | `UNIQUE(question_revision_id, sort_order, normalized_answer, normalization_policy)` |
| solutions | `UNIQUE(question_revision_id, solution_code)` (stable code required) |
| solution_steps | `UNIQUE(solution_id, sort_order)` + `id` tie-break |
| media | `UNIQUE(question_revision_id, media_code)` |
| targets | primary uniqueness + `(target_type, target_id)` per question |

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

Also: user_id, started_at, submitted_at, grading_status / session status, total/max score, **`attempt_pin_mode NOT NULL`**.

`practice_attempt_questions` includes **`logical_question_id`** + `question_revision_id` (parity with exam pins).

### Unified analytics (read-only)

```text
v_question_responses_unified
```

UNION of exam + practice responses for reporting only. **No writes**. **Not** SoT.

```text
RESPONSE_STORAGE_DECISION: PASS
Chosen model: HYBRID
```

---

## 4. Attempt pinning + cutover — PASS

Model A snapshots for REVISION_PINNED sessions. Grade by `option_code`. Shuffle only at snapshot creation. `rendered_options` must **omit** `is_correct`. Correct answer mapping is server-only (not in student-readable snapshot JSON).

### `question_bank_runtime_config` (singleton id=1)

- `attempt_pin_mode`: `LEGACY` | `REVISION_PINNED` (**NOT NULL**)
- Default after QB-01 apply: **`LEGACY`**
- Change only via audited admin RPC that locks the config row; affects **new** transactions only
- Session/attempt columns: `exam_sessions.attempt_pin_mode` and `practice_attempts.attempt_pin_mode` are **`NOT NULL`** with CHECK `IN ('LEGACY','REVISION_PINNED')` — unknown/null forbidden
- No silent fallback from REVISION_PINNED → LEGACY

### Create RPCs (single writer each)

```text
create_exam_session_with_snapshot(...)
create_practice_attempt_with_snapshot(...)
```

Each runs in **one transaction**:

1. `SELECT attempt_pin_mode FROM question_bank_runtime_config WHERE id = 1 FOR SHARE`.
2. Insert session/attempt with that mode copied (`NOT NULL`).
3. If `LEGACY`: legacy path only (no revision snapshot rows required).
4. If `REVISION_PINNED`: create all pin rows, freeze revisions, freeze option order, write hashes.
5. Any snapshot failure → full rollback; **no partial session**.
6. Never re-read config mid-session for grading path.
7. Unknown mode → reject.

Snapshot immutability: after the first response exists for a pin row, UPDATE/DELETE of that pin/snapshot is forbidden (RLS + RPC). `selected_option_code` must exist inside `rendered_options`. Snapshots readable only by attempt owner or authorized staff.

```text
CUTOVER_CONFIG_DECISION: PASS
```

Legacy attempts: `pin_mode=LEGACY`; scores immutable; no guessed revision backfill.

---

## 5. Backfill Revision #1 — PASS (deterministic)

### Priority (non-ambiguous)

```text
INVALID > HISTORICAL_OR_ACTIVE_USAGE > UNUSED_VALID
```

### Step 1 — Validation (`INVALID` → `HOLD_ROW`)

Classify `INVALID` first if any of:

- empty `question_text`
- invalid options JSON
- `correct_index` out of bounds
- SINGLE_CHOICE without exactly one correct answer
- duplicate/conflicting `code`
- unresolved subject/lesson relation
- data that would change the correct answer
- required FK unresolvable

Result: **`HOLD_ROW`** even if historically used. **Never** create a corrupt Revision #1 as `PUBLISHED`.

### Step 2 — Usage evidence (only after VALID)

A question is used if **any** of these SQL evidence sets match:

```text
EXISTS assessment_questions WHERE question_id = q.id
OR EXISTS exam_template_questions WHERE question_id = q.id
OR EXISTS exam_session_answers WHERE question_id = q.id
OR EXISTS lesson quiz/assessment junction currently serving q.id
OR EXISTS any persisted student attempt/answer relation referencing q.id
```

Do **not** use prose such as “appears in student UI” unless mapped to a concrete relation/query.

If a runtime path has no stable table: mark `UNVERIFIABLE_USAGE` → **`HOLD_REVIEW`** (never auto-`DRAFT`).

### Outcomes

| Classification | Result |
|---|---|
| INVALID | `HOLD_ROW` |
| VALID + usage evidence | Revision #1 `PUBLISHED` |
| VALID + no usage + all usage sources verified | Revision #1 `DRAFT` |
| VALID + usage unverifiable | `HOLD_REVIEW` |

Historically used but not currently shown: R1 = **PUBLISHED**, later **SUPERSEDED** when a newer revision is published. Never reinterpret old attempts.

### Idempotency

```text
UNIQUE(question_id, revision_number)
revision_number = 1
source_payload_hash
backfill_version
```

- Same hash → NOOP
- Different hash → `HOLD_RECONCILIATION`
- No automatic mutation of Revision #1
- No legacy mutation before full batch success

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

**Partial unique active grant:**

```text
UNIQUE (user_id, capability, scope_type, scope_id) WHERE revoked_at IS NULL
```

Scope CHECK: when `scope_type = 'GLOBAL'` then `scope_id IS NULL`; otherwise `scope_id IS NOT NULL`. Nullable scope means GLOBAL **only** for `scope_type = GLOBAL`.

Capabilities: `EDIT_QUESTION_BANK` | `REVIEW_QUESTION_CONTENT` | `PUBLISH_QUESTION_REVISION` | `GRADE_MANUAL_RESPONSE` | `READ_HIDDEN_SOLUTIONS`

| Principal | Default |
|---|---|
| Admin | all via explicit admin helper bypass |
| Content manager | EDIT + REVIEW + READ_HIDDEN only; **not** GRADE or PUBLISH unless explicit grant |
| Moderator | none |
| User | none |
| Grader (grant) | GRADE + READ_HIDDEN only; **never** EDIT or PUBLISH |

### Grant administration (P0)

```text
Capability grant administration = Admin only
```

RPCs:

```text
grant_question_bank_capability(...)
revoke_question_bank_capability(...)
```

Rules:

1. Admin may grant/revoke all capabilities.
2. Non-admin cannot grant a capability higher than their own (P0: non-admin cannot grant at all).
3. No self-grant except Admin.
4. Grader cannot grant capabilities.
5. Content manager cannot grant `PUBLISH` or `GRADE` in P0 (Admin-only grants).
6. Every grant/revoke records actor, reason, timestamp.
7. Revoke is soft (`revoked_at` / `revoked_by`); row retained.
8. Helpers ignore revoked grants.
9–10. Scope CHECK prevents contradictory NULL/non-NULL scope pairs.

Helpers (separate, SECURITY DEFINER, `search_path`, REVOKE PUBLIC, fail-closed):
`can_edit_question_bank` / `can_review_question_content` / `can_publish_question_revision` / `can_grade_manual_response` / `can_read_hidden_solutions`.

**Not** all mapped to `is_content_staff`.

```text
AUTHORIZATION_DECISION: PASS
```

---

## 8. Manual grading — PASS

### Response-level statuses

`NOT_REQUIRED | PENDING_MANUAL_REVIEW | IN_REVIEW | GRADED | RETURNED_FOR_SECOND_REVIEW | FINALIZED`

| From | To | Who | Conditions |
|---|---|---|---|
| PENDING_MANUAL_REVIEW | IN_REVIEW | Authorized grader | Atomic claim/assign |
| IN_REVIEW | GRADED | Assigned grader | Score in 0..max_score |
| GRADED | RETURNED_FOR_SECOND_REVIEW | Authorized reviewer | Reason required |
| GRADED | FINALIZED | Authorized finalizer | All session manual items ready |
| RETURNED_FOR_SECOND_REVIEW | IN_REVIEW | Second/authorized grader | Separation when required |
| FINALIZED | IN_REVIEW | Admin/authorized correction | Reason + corrective audit (append-only reviews) |
| else | else | — | Reject |

### Session grading statuses

```text
IN_PROGRESS
SUBMITTED_PENDING_GRADING
PARTIALLY_GRADED
COMPLETED
```

Rules:

- No `COMPLETED` while any required manual response is not `FINALIZED`.
- `final_score <= max_score`.
- `auto_score`, `manual_score`, `final_score` ≥ 0.
- `grading_mode=MANUAL` → do not credit `auto_score`.
- `grading_mode=AUTO_*` → no `manual_score` except documented correction workflow.
- Final score computed only by a central RPC (prevents double counting).
- `question_response_reviews` is **append-only**; reopening FINALIZED does not mutate prior review rows.

### Review polymorphic reference (schema draft)

Prefer dual nullable FKs with exclusivity CHECK — **not** unprotected `surface_type + response_id`:

```text
exam_answer_id uuid NULL REFERENCES exam_session_answers(id)
practice_response_id uuid NULL REFERENCES practice_attempt_responses(id)
CHECK (
  (exam_answer_id IS NOT NULL AND practice_response_id IS NULL)
  OR (exam_answer_id IS NULL AND practice_response_id IS NOT NULL)
)
```

```text
MANUAL_GRADING_DECISION: PASS
```

---

## 9. Canonical payload hash — PASS

```text
PAYLOAD_HASH_DECISION: PASS
payload_hash_version = canonical_payload_v1
serialization = JCS RFC 8785
encoding = UTF-8
BOM = none
line endings = LF
digest = SHA-256 lowercase hex
```

### Null / missing (no ties)

In `canonical_payload_v1`:

- Every schema-defined field **always** appears in the JSON object.
- Source-missing fields are written as JSON `null`.
- Missing keys are **forbidden**.
- Empty string ≠ `null`.
- Empty array ≠ `null`.
- Text preserved as entered except line endings normalized to LF before hash.
- No Unicode normalization for general text before hash, unless a field contract explicitly requires it (e.g. TRIM_COLLAPSE policy applies only to accepted-answer normalized forms, not to raw `question_text`).

### Array sort keys (deterministic, unique)

| Array | Order |
|---|---|
| options | `option_code ASC` |
| accepted_answers | `sort_order ASC`, `normalized_answer ASC`, `normalization_policy ASC` |
| solutions | `solution_type ASC`, `sort_order ASC`, `solution_code ASC` |
| solution_steps | `sort_order ASC`, then stable step code/`id` |
| media | `sort_order ASC`, `media_code ASC` |
| targets | `is_primary DESC`, `target_type ASC`, `target_id ASC` |

Do **not** use environment-random UUIDs as sole hash order keys for import-derived rows. Prefer content/`code` keys; DB `UNIQUE` constraints must eliminate unresolvable ties.

Exclude from hash: created/updated/by, signed/temp URLs, session data. Recipe change → new `payload_hash_version`; never reinterpret old hashes.

Golden vectors (documentation): `docs/QUESTION-BANK-PAYLOAD-HASH-GOLDEN-VECTORS-01.md`.

---

## 10. Target retarget — PASS_WITH_NOTES

Targets remain on logical `question_id` for P0. Mutations only via `retarget_question` RPC (`can_edit_question_bank`).

Deterministic hierarchy checks (reject on conflict — no silent cross-scope retarget):

- LESSON target must belong to the expected unit, subject, grade, and semester.
- UNIT target must belong to the correct subject.
- SUBJECT target must match grade / curriculum track.
- No silent cross-subject or cross-grade retarget.
- Affects future selection only (never mutates historical snapshots/attempts).
- Audit stores full old and new target sets, actor, time, reason.
- Cannot remove last primary target from a published question without a valid replacement.

Versioned targets remain **P1**. No P0 security/history gap for logical targets with these checks.

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
| 1 | Legacy session open when pin enabled | Stays LEGACY | session.attempt_pin_mode copy NOT NULL | Completes on legacy path | Mode flipped mid-flight |
| 2 | New REVISION_PINNED snapshot fails | Session start aborts | create_*_with_snapshot txn | No partial session | Silent LEGACY fallback |
| 3 | MCQ shuffled | Mapping frozen; grade by option_code | snapshot | Stable answer | Live sort_order grade |
| 4 | Resume app | Same snapshot/mapping | pin row immutable | Same selection meaning | Regen shuffle |
| 5 | Legacy Q in template | R1 PUBLISHED | backfill usage evidence | Linked + published | Draft while used |
| 6 | Unused convertible Q | R1 DRAFT | unused + verified sources | Not delivery-linked | Auto-publish |
| 7 | Invalid legacy Q | HOLD_ROW | validation first | No R1 | Published invalid |
| 8 | Backfill same hash | NOOP | idempotency | No second R1 | Duplicate rev |
| 9 | Backfill different hash | HOLD_RECONCILIATION | hash compare | No auto-mutate | Silent overwrite |
| 10 | Unverifiable usage path | HOLD_REVIEW | evidence sets | No auto-DRAFT | Prose-only usage |
| 11 | Grader without edit | Can grade; cannot edit bank | capability grants | Edit denied | is_content_staff implies edit |
| 12 | Non-admin grant attempt | Rejected | Admin-only grant RPC | No self-grant | Soft privilege |
| 13 | Duplicate active grant | Rejected | partial unique | One active | Two actives |
| 14 | Pointer to DRAFT/APPROVED rev | Rejected | publish RPC + trigger | status=PUBLISHED only | FK-only hope |
| 15 | Null vs "" in payload | Different hashes | canonical_payload_v1 | Distinct digests | Collapsed missing |
| 16 | Needs diacritic fold | MANUAL | policy | Not AUTO_TEXT | CASEFOLD_AR used |
| 17 | Retarget cross-grade | Rejected | retarget_question checks | Audit only on success | Silent retarget |
| 18 | COMPLETED with open manual | Rejected | session status rules | Stay PARTIALLY_GRADED | Premature COMPLETED |
| 19 | Config change mid-open | Open sessions unchanged | session copy + FOR SHARE on create | Stable mode | Retroactive flip |
| 20 | Practice final_score | Central RPC only | score constraints | final ≤ max | Client write |

---

## 14. Conditions before executable migration

1. Independent **final rereview** PASS on this corrected freeze.
2. SQL draft still commented / not under `supabase/migrations`.
3. QB-01 apply leaves `attempt_pin_mode=LEGACY`.
4. No student-facing new types until QB-06A+.
5. Bucket/storage not created in docs package.

**Executable migration source authorized only after rereview — not by this correction alone.**

```text
Recommended next action:
QB-01-DESIGN-FREEZE-FINAL-INDEPENDENT-REREVIEW-12
```
