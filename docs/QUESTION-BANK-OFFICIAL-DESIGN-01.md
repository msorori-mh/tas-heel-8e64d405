# QUESTION-BANK-OFFICIAL-DESIGN-01

التصميم الرسمي — متوافق مع Design Freeze بعد **HOLD-CORRECTION-11**.

| حقل | قيمة |
|---|---|
| القرار | NORMALIZED_WITH_COMPATIBILITY_LAYER |
| Design freeze | `docs/QB-01-DESIGN-FREEZE-DECISION-07.md` |
| RESPONSE_STORAGE_MODEL | **HYBRID** |
| Migration apply | **NO** |
| Rereview HOLD closed | `HOLD_QB_01_DESIGN_FREEZE_INDEPENDENT_REREVIEW_10` → CORRECTION-11 |

---

## 1. المعمارية

Revision SoT → Legacy cache فقط عبر `qb_sync_question_legacy`.
`correct_index` cache = **0-based**.
Excel 1-based → `option_code` → `is_correct` → sync 0-based.
لا Dual Write.

---

## 2. الهوية والنسخ

`questions` منطقي + `question_revisions` محتوى.

```text
PUBLISHED_POINTER_DECISION: PASS
Enforcement: composite FK + publish_question_revision RPC + defensive trigger
```

- `UNIQUE(question_id, id)` + Composite FK DEFERRABLE INITIALLY DEFERRED.
- Partial unique: نسخة `PUBLISHED` واحدة لكل سؤال.
- الـ FK يثبت انتماء نفس السؤال فقط؛ `status = PUBLISHED` يُفرض عبر RPC النشر + Trigger دفاعي.
- النشر عبر `publish_question_revision` داخل Transaction واحدة مع `FOR UPDATE` وidempotency ورفض عند تغيّر المؤشر عن المتوقع.

Children على `question_revision_id`. Targets على `question_id` + RPC `retarget_question` مع تحقق هرمي حتمي وAudit كامل.

---

## 3. أنواع وgrading

P0: SINGLE_CHOICE / SHORT_TEXT / LONG_TEXT. P1: TRUE_FALSE.
`grading_mode`: AUTO_SINGLE | AUTO_TEXT | MANUAL.
CASEFOLD_AR وغيره من طيّ العربية → MANUAL حتى P1 (**NOT ALLOWED IN QB-01**).

---

## 4. RESPONSE_STORAGE_MODEL = HYBRID

| سطح | التخزين |
|---|---|
| Exams | `exam_sessions` + `exam_session_questions` + **امتداد** `exam_session_answers` |
| Lesson/Unit | `practice_attempts` + `practice_attempt_questions` + `practice_attempt_responses` |
| تقارير | `v_question_responses_unified` قراءة فقط — ليست SoT |

`practice_attempt_questions.logical_question_id` مطلوب مع `question_revision_id`.
MCQ الجديد: `selected_option_code` داخل `rendered_options`. النص: `response_text`. `selected_index` = Legacy فقط.
`rendered_options` بلا `is_correct`. Snapshot غير قابل للتعديل بعد أول Response.

---

## 5. Cutover

```text
CUTOVER_CONFIG_DECISION: PASS
```

`question_bank_runtime_config.attempt_pin_mode` = `LEGACY` | `REVISION_PINNED` (**NOT NULL**).
`exam_sessions.attempt_pin_mode` و`practice_attempts.attempt_pin_mode` **NOT NULL**.
افتراضي بعد QB-01: **LEGACY**.
إنشاء الجلسة فقط عبر:
`create_exam_session_with_snapshot` / `create_practice_attempt_with_snapshot`
مع `FOR SHARE` على Config ونسخ الوضع ذرّياً؛ فشل Snapshot = Rollback كامل؛ لا fallback إلى LEGACY.

---

## 6. Backfill R1 (حتمي)

```text
BACKFILL_DECISION: PASS
Priority: INVALID > HISTORICAL_OR_ACTIVE_USAGE > UNUSED_VALID
```

| نتيجة | شرط |
|---|---|
| `HOLD_ROW` | INVALID (حتى لو مستخدم تاريخياً) — لا R1 فاسدة PUBLISHED |
| R1 `PUBLISHED` | VALID + دليل استخدام SQL محدد |
| R1 `DRAFT` | VALID + لا استخدام + كل مصادر الاستخدام متحققة |
| `HOLD_REVIEW` | VALID + `UNVERIFIABLE_USAGE` |

أدلة الاستخدام: `assessment_questions` | `exam_template_questions` | `exam_session_answers` | روابط quiz/assessment للدرس | أي علاقة محاولة/إجابة محفوظة.
Idempotency: `UNIQUE(question_id, revision_number=1)` + hashes؛ اختلاف hash → `HOLD_RECONCILIATION`.

---

## 7. Accepted answers

سياسات P0 فقط: **EXACT | TRIM | TRIM_COLLAPSE**.
`CASEFOLD_AR`: **DEFERRED_TO_P1 / NOT ALLOWED IN QB-01**.

---

## 8. Capabilities

```text
AUTHORIZATION_DECISION: PASS
Capability grant administration = Admin only (P0)
```

`question_bank_capability_grants` + partial unique لـGrant فعالة (`revoked_at IS NULL`).
RPCs: `grant_question_bank_capability` / `revoke_question_bank_capability` (Admin فقط).
لا Self-grant لغير Admin. Revoke ناعم. Helpers تتجاهل الملغى.

---

## 9. Manual grading

```text
MANUAL_GRADING_DECISION: PASS
```

حالات الاستجابة: كما في Freeze.
حالات الجلسة: `IN_PROGRESS` | `SUBMITTED_PENDING_GRADING` | `PARTIALLY_GRADED` | `COMPLETED`.
لا `COMPLETED` مع يدوي غير `FINALIZED`.
`final_score <= max_score`؛ الدرجات ≥ 0؛ حساب النهائي عبر RPC مركزية.
مراجعات Append-only؛ مرجع Polymorphic عبر `exam_answer_id` / `practice_response_id` مع Check حصري.

---

## 10. Payload hash

```text
PAYLOAD_HASH_DECISION: PASS
```

`canonical_payload_v1` + JCS/RFC 8785 + UTF-8 + LF + SHA-256 hex.
كل مفاتيح Schema حاضرة؛ missing → `null`؛ empty string ≠ null؛ empty array ≠ null.
ترتيب Arrays بمفاتيح فريدة (option_code / sort_order+normalized_answer+policy / …).
Golden vectors: `docs/QUESTION-BANK-PAYLOAD-HASH-GOLDEN-VECTORS-01.md`.

---

## 11. Media

`question_media` على revision؛ bucket تصميمي `question-media` غير مُنشأ هنا.

---

## 12. Target consistency

```text
TARGET_SCOPE_DECISION: PASS_WITH_NOTES
```

`retarget_question` يرفض Cross-subject/grade الصامت؛ يؤثر على الاختيار المستقبلي فقط؛ Audit old/new كامل. Versioned targets = P1.

---

## 13. أمن

طالب بلا `is_correct` / accepted / solutions قبل السياسة؛ `rendered_options` بلا مفتاح إجابة؛ REVOKE PUBLIC؛ SECURITY DEFINER + search_path؛ deny-by-default.
