# QB03-RUNTIME-CUTOVER-STATE-MACHINE-01

Operational cutover state machine for Question Bank reads/writes after legacy backfill.

| Field | Value |
|---|---|
| Package | `QB03-LEGACY-BACKFILL-AND-RUNTIME-CUTOVER-DESIGN-01` |
| Kind | Design only |
| QB-01 pin modes (session) | `LEGACY` \| `REVISION_PINNED` |
| Default after QB-01 | **LEGACY** |
| This package activates runtime? | **NO** |

```text
LEGACY
  → DUAL_READ
  → SHADOW_COMPARE
  → QB_PRIMARY
  → LEGACY_READ_ONLY
  → LEGACY_RETIRED
```

Forward-only under owner approval. Any stage may **rollback** to a prior allowed stage per rollback plan (no history delete).

---

## 0. Mapping to QB-01 session pin

| Cutover mode | New exam/practice `attempt_pin_mode` | Notes |
|---|---|---|
| LEGACY | `LEGACY` | Current production intent |
| DUAL_READ | `LEGACY` | QB revision read for staff/compare only |
| SHADOW_COMPARE | `LEGACY` (student path) | Shadow QB grade computed server-side; not authoritative |
| QB_PRIMARY | `REVISION_PINNED` | New sessions pin revisions |
| LEGACY_READ_ONLY | `REVISION_PINNED` | Legacy cache read-only; no legacy writers |
| LEGACY_RETIRED | `REVISION_PINNED` | Legacy delivery paths retired |

Open sessions always keep their copied `attempt_pin_mode` (QB-01: NOT NULL; no mid-flight flip).

---

## 1. Mode: LEGACY

| Dimension | Rule |
|---|---|
| Reads | Exam/practice/lesson UI + RPCs read legacy `questions` (+ options JSON, 0-based `correct_index`) |
| Writes | Legacy writers only; QB revision writers off for student delivery |
| Comparison | Off |
| Metrics | Baseline error rates, exam start/submit success, practice grade success |
| Rollback | N/A (baseline) |
| Exit criteria | QB-01 applied; backfill sample reconciled; dry-run import foundation available; runtime still LEGACY |
| Owner approval | Required to leave LEGACY |

---

## 2. Mode: DUAL_READ

| Dimension | Rule |
|---|---|
| Reads | **Authoritative student reads remain legacy**. Staff/admin may read QB revisions for the same logical `question_id` |
| Writes | Legacy writers remain SoT for delivery; QB content edits allowed only as new revisions (not student-visible until later modes) |
| Comparison | Optional offline reconciliation reports (not inline student path) |
| Metrics | Coverage: % questions with R1; HOLD_* counts; target coverage |
| Rollback | Revert cutover mode → LEGACY; stop dual-read tooling |
| Exit criteria | ≥ owner-approved coverage of VALID rows backfilled; HOLD queues triage plan exists |
| Owner approval | Required |

---

## 3. Mode: SHADOW_COMPARE

| Dimension | Rule |
|---|---|
| Reads | Student-facing still legacy |
| Writes | Student answers still legacy; shadow path computes QB grade/explanation **without** persisting as SoT score |
| Comparison | See §7 Shadow comparison |
| Metrics | Mismatch counters by field; zero-tolerance breach alerts; per-surface (exam/practice) rates |
| Rollback | Disable shadow job/RPC; mode → DUAL_READ or LEGACY |
| Exit criteria | Zero mismatches on correct-answer & score for sampled + full agreed set; owner sign-off |
| Owner approval | Required to enter and to exit toward QB_PRIMARY |

---

## 4. Mode: QB_PRIMARY

| Dimension | Rule |
|---|---|
| Reads | New sessions use `REVISION_PINNED` snapshots (`create_*_with_snapshot`) |
| Writes | Answers on pin rows; `selected_option_code` SoT for MCQ; legacy `selected_index` not used for new sessions |
| Comparison | Shadow may continue as canary against legacy cache via `qb_sync_question_legacy` (future) |
| Metrics | Snapshot create success; pin immutability violations (must be 0); grade parity canary |
| Rollback | Set cutover mode back to SHADOW_COMPARE or DUAL_READ; **new** sessions LEGACY; existing REVISION_PINNED sessions complete on pin path |
| Exit criteria | Stable metrics window (duration = `NEEDS_OWNER_DECISION`); rollback drill passed |
| Owner approval | Required |

---

## 5. Mode: LEGACY_READ_ONLY

| Dimension | Rule |
|---|---|
| Reads | Legacy cache may still be read for old LEGACY sessions and emergency compare |
| Writes | **Stop legacy content writers** for questions delivery; QB revisions are SoT |
| Comparison | Periodic integrity check legacy cache vs published revision (sync direction QB→legacy only) |
| Metrics | Legacy write attempts (must be 0); sync drift |
| Rollback | Re-enable legacy writers only with owner approval; mode → QB_PRIMARY |
| Exit criteria | No remaining required legacy writers; old sessions drained or explicitly allowed |
| Owner approval | Required |

---

## 6. Mode: LEGACY_RETIRED

| Dimension | Rule |
|---|---|
| Reads | Student delivery QB-only; legacy columns not used for new work |
| Writes | Legacy delivery writers removed/disabled |
| Comparison | Off (historical audits retained) |
| Metrics | Attempts to hit retired paths (must be 0) |
| Rollback | Not a delete: can reopen LEGACY_READ_ONLY for emergency reads; data retained |
| Exit criteria | Owner accepts retirement; retention/cleanup still `NEEDS_OWNER_DECISION` |
| Owner approval | Required |

---

## 7. Shadow comparison contract

Compare legacy delivery vs QB revision for the same logical question:

| Field | Tolerance |
|---|---|
| question text | Normalized LF; semantic equality after agreed whitespace policy |
| options | Same count, same order, same body text (LF-normalized) |
| correct answer | **Tolerance = 0** (option identity / 0-based index / option_code mapping) |
| score | **Tolerance = 0** for auto-gradable items |
| explanation | LF-normalized text equality (or both null) |
| lesson/unit linkage | Primary target must match resolvable legacy lesson/unit/subject |
| exam behavior | Same correctness boolean for identical `selected_index` ↔ mapped `option_code` |
| practice behavior | Same as exam for lesson/unit grade RPCs |

```text
SHADOW_TOLERANCE_CORRECT_ANSWER = 0
SHADOW_TOLERANCE_SCORE = 0
```

Any correct-answer or score mismatch → `SHADOW_MISMATCH` → block exit from SHADOW_COMPARE.

---

## 8. Mixed-session rules

- Sessions created under LEGACY stay LEGACY until completion.
- Sessions created under REVISION_PINNED stay pinned; never silently fall back.
- Mode changes affect **new** create-RPC transactions only (`FOR SHARE` config read).
- Prevent mixed-session corruption: one session one pin mode; no re-snapshot; no re-shuffle.

---

## 9. Owner approvals matrix

| Transition | Approver |
|---|---|
| LEGACY → DUAL_READ | Owner |
| DUAL_READ → SHADOW_COMPARE | Owner |
| SHADOW_COMPARE → QB_PRIMARY | Owner |
| QB_PRIMARY → LEGACY_READ_ONLY | Owner |
| LEGACY_READ_ONLY → LEGACY_RETIRED | Owner |
| Any rollback transition | Owner |

Schedule / exact clock time / batch size for mode flips: `NEEDS_OWNER_DECISION`.

---

## 10. Package constraints

This document does **not** implement mode storage, RPCs, or UI. QB-01 today exposes `attempt_pin_mode` only. Extending runtime config with an explicit `cutover_mode` column is a **future migration** outside this design package.
