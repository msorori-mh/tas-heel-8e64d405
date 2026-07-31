# QUESTION-BANK-IMPLEMENTATION-PLAN-01

بعد HOLD-CORRECTION-09 — انظر `docs/QB-01-DESIGN-FREEZE-DECISION-07.md`.

| حقل | قيمة |
|---|---|
| RESPONSE_STORAGE_MODEL | HYBRID |
| Cutover default after QB-01 apply | **LEGACY** |
| Executable migration authorized | **NO** until independent rereview |

```text
QB-01 → QB-02 → QB-07 → QB-03 → QB-04 → QB-05 → QB-06 → QB-08 → QB-09
```

---

## QB-01 — Schema Foundation (executable لاحقاً)

يشمل:

- `question_revisions` + revision-scoped children
- Composite published pointer FK
- `exam_session_questions` + امتدادات `exam_session_answers`
- `practice_attempts` / `practice_attempt_questions` / `practice_attempt_responses`
- `question_response_reviews` (+ assignment/idempotency fields)
- `question_bank_capability_grants`
- `question_bank_runtime_config` (singleton; **attempt_pin_mode=LEGACY**)
- Hash fields (`payload_hash`, `payload_hash_version`, …)
- Accepted-answer CHECK: EXACT|TRIM|TRIM_COLLAPSE only
- RLS deny-by-default + capability helpers
- Sync stub 0-based

**بعد Apply:** لا تفعيل REVISION_PINNED؛ لا أنواع طلاب جديدة؛ لا bucket فعلي إن لم تُقر حزمة منفصلة.

مسودة: `docs/migration-drafts/QUESTION-BANK-SCHEMA-FOUNDATION-01.NOT_APPLIED.sql`

---

## QB-02 — Backfill

قواعد R1 الحتمية (PUBLISHED / DRAFT / HOLD ROW) + idempotency hashes.
لا تخمين revision للمحاولات القديمة.

---

## QB-07 — Compatibility Sync

New→Legacy فقط؛ `correct_index` = 0-based؛ لا Dual Write.

---

## QB-03 / QB-04

Dry-run adapters (1-based معلن)؛ Apply = DRAFT only حتى QB-05.

---

## QB-05

مراجعة محتوى؛ نشر revision؛ إدارة capability grants؛ `retarget_question`؛ توزيع/إنهاء تصحيح يدوي حسب المسؤوليات.

---

## QB-06 — داخلياً فقط (بدون تغيير أرقام الحزم)

| Sub | Scope |
|---|---|
| QB-06A | Safe Student Read |
| QB-06B | Revision-pinned Submission |
| QB-06C | Manual Grade and Audit APIs |
| QB-06D | Cutover Verification |

لا تفعيل SHORT/LONG للطلاب قبل 06A.

---

## QB-08 / QB-09

UI ثم إيقاف حقول Legacy بعد إثبات عدم الاعتماد.

---

## بوابات

1. Response HYBRID — مغلق
2. Backfill R1 — مغلق
3. Normalization بلا CASEFOLD_AR في P0 — مغلق
4. Capability separation — مغلق
5. Cutover named — مغلق
6. Pointer / hash / grading matrix — مغلقة
7. Rereview مستقل قبل executable migration
