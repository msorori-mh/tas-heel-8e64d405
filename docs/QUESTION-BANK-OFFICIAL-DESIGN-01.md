# QUESTION-BANK-OFFICIAL-DESIGN-01

التصميم الرسمي — متوافق مع Design Freeze بعد **HOLD-CORRECTION-09**.

| حقل | قيمة |
|---|---|
| القرار | NORMALIZED_WITH_COMPATIBILITY_LAYER |
| Design freeze | `docs/QB-01-DESIGN-FREEZE-DECISION-07.md` |
| RESPONSE_STORAGE_MODEL | **HYBRID** |
| Migration apply | **NO** |

---

## 1. المعمارية

Revision SoT → Legacy cache فقط عبر `qb_sync_question_legacy`.
`correct_index` cache = **0-based**.
Excel 1-based → `option_code` → `is_correct` → sync 0-based.
لا Dual Write.

---

## 2. الهوية والنسخ

`questions` منطقي + `question_revisions` محتوى.
مؤشر منشور: Composite FK `(questions.id, current_published_revision_id) → (question_revisions.question_id, id)` DEFERRABLE؛ NULL مسموح؛ partial unique لنسخة PUBLISHED واحدة.

Children على `question_revision_id`. Targets على `question_id` + RPC `retarget_question` مع Audit.

---

## 3. أنواع وgrading

P0: SINGLE_CHOICE / SHORT_TEXT / LONG_TEXT. P1: TRUE_FALSE.
`grading_mode`: AUTO_SINGLE | AUTO_TEXT | MANUAL.
CASEFOLD_AR وغيره من طيّ العربية → MANUAL حتى P1.

---

## 4. RESPONSE_STORAGE_MODEL = HYBRID

| سطح | التخزين |
|---|---|
| Exams | `exam_sessions` + `exam_session_questions` + **امتداد** `exam_session_answers` |
| Lesson/Unit | `practice_attempts` + `practice_attempt_questions` + `practice_attempt_responses` |
| تقارير | `v_question_responses_unified` قراءة فقط — ليست SoT |

MCQ الجديد: `selected_option_code`. النص: `response_text`. `selected_index` = Legacy فقط.

---

## 5. Cutover

`question_bank_runtime_config.attempt_pin_mode` = `LEGACY` | `REVISION_PINNED`.
افتراضي بعد QB-01: **LEGACY**. لا يقلب Apply إلى REVISION_PINNED.
الجلسة تنسخ الوضع عند الإنشاء؛ الجلسات المفتوحة لا تتأثر.

---

## 6. Backfill R1 (حتمي)

PUBLISHED إن مستخدم/مربوط بمسار طلابي أو محاولات.
DRAFT إن قابل للتحويل وغير مستخدم.
HOLD ROW إن بيانات غير صالحة.
Idempotency: `question_id+revision_number=1` + hashes؛ اختلاف hash → HOLD_RECONCILIATION.

---

## 7. Accepted answers

سياسات P0 فقط: **EXACT | TRIM | TRIM_COLLAPSE** (تعريفات في Freeze).
`CASEFOLD_AR`: **DEFERRED_TO_P1 / NOT ALLOWED IN QB-01**.

---

## 8. Capabilities

`question_bank_capability_grants` + helpers منفصلة.
Admin: الكل. Content manager: EDIT+REVIEW+READ_HIDDEN (بدون GRADE/PUBLISH تلقائياً).
Grader: GRADE+READ_HIDDEN فقط — **لا EDIT**. Moderator/User: لا شيء.

---

## 9. Manual grading

مصفوفة انتقالات Freeze؛ Claim ذري؛ idempotency_key؛ final عبر RPC؛ الجلسة completed بعد FINALIZED لكل يدوي مطلوب.

---

## 10. Payload hash

`canonical_payload_v1` + JCS/RFC 8785 + SHA-256 hex.
`payload_hash_version` مخزّن؛ لا إعادة تفسير hashes قديمة.

---

## 11. Media

`question_media` على revision؛ bucket تصميمي `question-media` غير مُنشأ هنا.

---

## 12. أمن

طالب بلا `is_correct` / accepted / solutions قبل السياسة؛ `rendered_options` بلا مفتاح إجابة؛ REVOKE PUBLIC؛ SECURITY DEFINER + search_path؛ deny-by-default.
