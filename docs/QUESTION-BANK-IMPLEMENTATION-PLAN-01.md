# QUESTION-BANK-IMPLEMENTATION-PLAN-01

بعد HOLD-CORRECTION-11 — انظر `docs/QB-01-DESIGN-FREEZE-DECISION-07.md`.

| حقل | قيمة |
|---|---|
| RESPONSE_STORAGE_MODEL | HYBRID |
| Cutover default after QB-01 apply | **LEGACY** |
| `attempt_pin_mode` | **NOT NULL** on config + sessions + attempts |
| Executable migration authorized | **NO** until final independent rereview |
| Closed rereview HOLD | `HOLD_QB_01_DESIGN_FREEZE_INDEPENDENT_REREVIEW_10` |

```text
QB-01 → QB-02 → QB-07 → QB-03 → QB-04 → QB-05 → QB-06 → QB-08 → QB-09
```

---

## QB-01 — Schema Foundation (executable لاحقاً)

يشمل:

- `question_revisions` + revision-scoped children (+ hash-stable uniques)
- Published pointer: composite FK + **publish_question_revision** + defensive trigger notes
- `exam_session_questions` + امتدادات `exam_session_answers`
- `practice_attempts` / `practice_attempt_questions` (**incl. logical_question_id**) / `practice_attempt_responses`
- `question_response_reviews` (dual nullable FKs + append-only)
- Session grading statuses: IN_PROGRESS / SUBMITTED_PENDING_GRADING / PARTIALLY_GRADED / COMPLETED
- `question_bank_capability_grants` (partial unique active grant; Admin-only grant RPCs in P0)
- `question_bank_runtime_config` (singleton; **attempt_pin_mode=LEGACY NOT NULL**)
- Create RPCs notes: `create_exam_session_with_snapshot` / `create_practice_attempt_with_snapshot` (`FOR SHARE`)
- Hash fields + `canonical_payload_v1` recipe
- Accepted-answer CHECK: EXACT|TRIM|TRIM_COLLAPSE only (**CASEFOLD_AR forbidden in P0**)
- RLS deny-by-default + capability helpers
- Sync stub 0-based

**بعد Apply:** لا تفعيل REVISION_PINNED؛ لا أنواع طلاب جديدة؛ لا bucket فعلي إن لم تُقر حزمة منفصلة.

مسودة: `docs/migration-drafts/QUESTION-BANK-SCHEMA-FOUNDATION-01.NOT_APPLIED.sql`
Golden vectors: `docs/QUESTION-BANK-PAYLOAD-HASH-GOLDEN-VECTORS-01.md`

---

## QB-02 — Backfill

```text
Priority: INVALID > HISTORICAL_OR_ACTIVE_USAGE > UNUSED_VALID
```

- INVALID → `HOLD_ROW` (لا R1 PUBLISHED فاسدة)
- VALID + SQL usage evidence → R1 PUBLISHED
- VALID + verified unused → R1 DRAFT
- VALID + `UNVERIFIABLE_USAGE` → `HOLD_REVIEW`
- Idempotency hashes؛ لا تخمين revision للمحاولات القديمة

---

## QB-07 — Compatibility Sync

New→Legacy فقط؛ `correct_index` = 0-based؛ لا Dual Write.

---

## QB-03 / QB-04

Dry-run adapters (1-based معلن)؛ Apply = DRAFT only حتى QB-05.

---

## QB-05

مراجعة محتوى؛ `publish_question_revision`؛ إدارة capability grants (Admin)؛ `retarget_question` مع فحوصات هرمية؛ توزيع/إنهاء تصحيح يدوي.

---

## QB-06 — داخلياً فقط (بدون تغيير أرقام الحزم)

| Sub | Scope |
|---|---|
| QB-06A | Safe Student Read |
| QB-06B | Revision-pinned Submission (`create_*_with_snapshot`) |
| QB-06C | Manual Grade and Audit APIs |
| QB-06D | Cutover Verification |

لا تفعيل SHORT/LONG للطلاب قبل 06A.

---

## QB-08 / QB-09

UI ثم إيقاف حقول Legacy بعد إثبات عدم الاعتماد.

---

## بوابات Closure (CORRECTION-11)

1. Response HYBRID — مغلق
2. Published pointer (FK + RPC + trigger) — مغلق
3. Payload hash (null/missing/ties/JCS) — مغلق
4. Backfill priority + SQL evidence — مغلق
5. Cutover NOT NULL + transactional snapshot — مغلق
6. Capability Admin-only grants + unique active — مغلق
7. Session grading statuses + final_score ≤ max — مغلق
8. Snapshot immutability + logical_question_id — مغلق
9. Target consistency — PASS_WITH_NOTES
10. CASEFOLD_AR not in P0 — مغلق
11. **Final independent rereview** قبل executable migration

```text
Recommended next action:
QB-01-DESIGN-FREEZE-FINAL-INDEPENDENT-REREVIEW-12
```
