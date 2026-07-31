# QUESTION-BANK-IMPLEMENTATION-PLAN-01

خطة تنفيذ بعد **QB-01 Design Freeze** — انظر `docs/QB-01-DESIGN-FREEZE-DECISION-07.md`.

| حقل | قيمة |
|---|---|
| القرار | NORMALIZED_WITH_COMPATIBILITY_LAYER |
| Design freeze | CLOSED (source) |
| VERSIONING_DECISION (design) | **CLOSED** — Model A + revision-scoped children |
| Apply QB-01 migration | **ما زال ممنوعاً** حتى حزمة executable + مراجعة مستقلة |
| Docs base | `6e35245ed73eb4c3c8ea76a2c010d8e4d7b0348c` |

---

## بوابات قبل إنشاء/تطبيق Migration التنفيذية

1. Legacy `correct_index` = **0-based** (مثبت Runtime) — **مغلق**.
2. Excel 1-based → `option_code` → cache 0-based — **مغلق تصميماً**.
3. Children على `question_revision_id` — **مغلق**.
4. Attempt pinning Model A + option-order snapshot — **مغلق**.
5. تخزين نصي مستقل + lifecycle يدوي + audit — **مغلق تصميماً**.
6. Capabilities على الأدوار الحالية — **مغلق P0**.
7. Bucket `question-media` تصميمي — **مغلق**؛ الإنشاء لاحقاً.
8. لا تفعيل أنواع جديدة للطلاب قبل QB-06 safe reads.

---

## الترتيب الرسمي

```text
QB-01 → QB-02 → QB-07 → QB-03 → QB-04 → QB-05 → QB-06 → QB-08 → QB-09
```

### QB-01 — Schema Foundation (executable لاحقاً)

يشمل: logical hub additives؛ `question_revisions`؛ revision-scoped options/accepted/solutions/media؛ targets؛ `exam_session_questions`؛ response/grading columns؛ capability helpers؛ RLS/GRANT deny-by-default؛ sync stub 0-based.

**PASS apply:** مراجعة مستقلة للـ migration + اختبارات مصدرية.
**HOLD apply:** أي انحراف عن freeze (children على question_id، أو بقاء selected_index كـ SoT).

مسودة: `docs/migration-drafts/QUESTION-BANK-SCHEMA-FOUNDATION-01.NOT_APPLIED.sql`

### QB-02 — Backfill

Revision #1 لكل legacy row؛ options من JSON؛ `correct_index` 0-based → `is_correct`؛ solutions؛ targets؛ hashes؛ dry-run؛ لا تخمين لمحاولات قديمة.

### QB-07 — Compatibility Sync

New→Legacy فقط؛ `correct_index` cache 0-based؛ لا Dual Write.

### QB-03 — Import Validation & Dry Run

Adapters الثلاثة + normalized path؛ 1-based معلن؛ رفض Published؛ resolve codes؛ media؛ صف مزاح؛ أخطاء row/column/sheet.

### QB-04 — Atomic Apply

DRAFT only حتى QB-05؛ لا نشر.

### QB-05 — Review / Publish / Versioning ops

Approve/reject؛ publish revision؛ منع تعديل used/published؛ capabilities.

### QB-06 — Runtime APIs (تقسيم داخلي مصدر)

1) Safe student reads
2) Text submit + pin
3) Manual grading + audit
لا تفعيل SHORT/LONG للطلاب قبل (1).

### QB-08 — UI

محتوى / طالب / مصحح / وسائط / ضعف اتصال.

### QB-09 — Deprecate legacy cache fields

بعد إثبات عدم اعتماد القراءة المباشرة.

---

## سيناريوهات (مختصر — التفاصيل في الحزم)

مقالي+model؛ SHORT+accepted؛ جزئي+audit؛ صورة+requires_media؛ stimulus؛ بلا code؛ Published في Excel؛ صف مزاح؛ فارغ؛ correct_index 1-based؛ غامض؛ وحدة برقم؛ درس مكرر؛ تعديل منشور مستخدم؛ إعادة استيراد revision؛ grader يقرأ بلا كتابة بنك؛ طالب يقرأ حلاً مبكراً؛ تغيير درجة+audit؛ فشل وسائط؛ resume بعد انقطاع؛ محاولة LEGACY لا تُعاد تفسيرها؛ shuffle لاحق يجمّد mapping.

---

## خارج النطاق الآن

لا ملف تحت `supabase/migrations` · لا SQL منفَّذ · لا Runtime · لا تفعيل طلاب · لا إنشاء bucket فعلي
