# QUESTION-BANK-IMPLEMENTATION-PLAN-01

خطة تنفيذ متوافقة مع أدلة Excel الثلاثة + التصميم الرسمي.

| حقل | قيمة |
|---|---|
| القرار | NORMALIZED_WITH_COMPATIBILITY_LAYER |
| Runtime baseline | `9d6eb603fead085f8fa86f29647a8c5e51cab2af` |
| Excel schemas | teacher_flat_ar_v0 · official_flat_v0 · legacy_flat_15col |
| official_normalized_v1 | TARGET ONLY |
| Migration في هذه المهمة | **NO** |

---

## شرط HOLD قبل QB-01 التنفيذي

```text
لا يبدأ QB-01 التنفيذي (تطبيق Migration) قبل حسم استراتيجية نسخ الأسئلة المنشورة
ومطابقتها مع exam attempts / exam_session_answers الحالية.
updated_at وحده ليس versioning.
```

إن تعذّر الدمج الآمن → HOLD موثّق؛ لا إخفاء.

---

## الترتيب الرسمي

```text
QB-01 → QB-02 → QB-07 → QB-03 → QB-04 → QB-05 → QB-06 → QB-08 → QB-09
```

---

## QB-01 — Schema Foundation (NOT APPLIED هنا)

| عنصر | مطلوب |
|---|---|
| questions hub + legacy cache | نعم |
| question_targets | نعم |
| question_options مطبّعة | نعم |
| question_accepted_answers | نعم (SHORT_TEXT P0) |
| question_solutions + hints | نعم |
| stimulus_text أدنى / per-question | نعم |
| question_media metadata | نعم |
| manual grading metadata | نعم |
| version/revision foundation **أو** HOLD موثّق | نعم — حاجز قبل apply |
| interaction_type مرن (مرجع أو TEXT + validation) — لا CHECK مغلق بـ26 | نعم |
| grading_mode | نعم |
| created_by / updated_at | نعم |
| RLS + GRANT كاملة deny-by-default | نعم |
| reviewer/grader capability mapped to current roles | نعم — لا اختراع enum `reviewer` أعمى |
| Indexes / FKs / triggers New→Legacy | نعم |

**PASS:** تصميم كامل + مراجعة أمنية + قرار versioning مكتوب.
**HOLD:** تعارض versioning مع attempts؛ أو GRANT واسع؛ أو RLS ناقصة.

مسودة: `docs/migration-drafts/QUESTION-BANK-SCHEMA-FOUNDATION-01.NOT_APPLIED.sql`

---

## QB-02 — Backfill Legacy → New

- صف واحد لكل سؤال legacy → options/targets/solutions حسب النوع.
- لا حذف legacy.
- تقرير gaps (بلا lesson، بلا صحيح، JSON تالف، unit نصي فقط).

**HOLD:** فقدان بيانات بلا تقرير؛ مسح legacy.

---

## QB-07 — Compatibility Sync Layer (قبل الاستيراد)

- `qb_sync_question_legacy` ذري.
- مصدر الحقيقة = New.
- اتجاه واحد New → Legacy.
- `questions.unit` نصي = مشتق مؤقت Read-only بعد التفعيل — **ليس SoT**.
- لا Dual Write من العميل.

**HOLD:** كتابة من العميل لكلا الطبقتين؛ تعارض بعد sync.

---

## QB-03 — Import Validation & Dry Run

قبل PASS يجب:

1. تعريف adapters الثلاثة (+ مسار official_normalized_v1 لاحقاً).
2. تثبيت اتفاقية correct_index لكل adapter (legacy/operational = 1-based مثبت).
3. كشف الصف المزاح ورفضه.
4. تطبيع `فارغ` / `-` → NULL في adapters فقط.
5. رفض `Published`؛ قبول DRAFT / READY_FOR_REVIEW فقط.
6. Resolve codes (unit/lesson) حسب التصميم.
7. التحقق من الوسائط (`requires_media`, alt, path).
8. التحقق من interaction_type + grading_mode.
9. أخطاء/تحذيرات مرتبطة بـ row/column/sheet.
10. عدم إنشاء جداول فعلية في هذه الحزمة التوثيقية.

**HOLD:** 0↔1 صامت؛ قبول نشر من Excel؛ resolve غامض بلا رفض.

---

## QB-04 — Atomic Apply

حتى اكتمال QB-05:

```text
Atomic Apply may create/update DRAFT only.
It must not publish content.
```

- Upsert بـ `question_code`.
- استدعاء sync داخل نفس المعاملة عند الحاجة.
- لا نشر؛ لا حذف legacy.

**HOLD:** نشر من Apply؛ نجاح جزئي بلا rollback.

---

## QB-05 — Review / Approve / Publish + Versioning

- Content review + approve/reject.
- Reviewer/grader capability (مطابقة الأدوار).
- نشر تنقيح؛ منع تعديل النسخة المنشورة المستخدمة.
- إنشاء revision جديدة عند التعديل بعد النشر/الاستخدام.
- كشف حلول حسب السياسة.

**HOLD:** نشر بلا مراجعة؛ تعديل صامت لنسخة مستخدمة في attempt.

---

## QB-06 — Runtime APIs

- Safe student reads (بلا is_correct / solutions مبكرة).
- Safe answer reveal.
- Submission APIs للنص القصير/المقالي.
- Manual grading APIs + audit trail.
- Offline-aware reads.

**HOLD:** تسريب حلول؛ grading بلا audit.

---

## QB-08 — UI

- إدخال/مراجعة محتوى.
- واجهة طالب.
- واجهة تصحيح يدوي.
- عرض وسائط + weak internet.
- استكمال بعد انقطاع.

**HOLD:** اعتماد على إخفاء UI للأمن؛ نشر من شاشة الاستيراد.

---

## QB-09 — Deprecate Legacy Fields

- بعد إثبات عدم اعتماد القراءة المباشرة على cache.
- إيقاف ثم حذف لاحق لـ options/correct_index/explanation/unit النصي عند الجاهزية.
- لا DROP مبكّر.

---

## مصفوفة سيناريوهات التوثيق (PASS / HOLD)

| # | سيناريو | Package | Expected | PASS | HOLD |
|---|---|---|---|---|---|
| 1 | مقالي + model answer | QB-01/05/06 | LONG_TEXT + MANUAL + solution | model مخزّن؛ طالب لا يراه مبكراً | تسريب |
| 2 | نص قصير + accepted | QB-01/03/06 | SHORT_TEXT + AUTO_TEXT | تطابق قواعد صريحة | auto بلا قواعد |
| 3 | درجات جزئية | QB-05/06 | allow_partial + MANUAL | درجة جزئية + audit | بلا سجل |
| 4 | يعتمد على صورة | QB-03/04/08 | requires_media | رفض نشر بلا ملف+alt | نشر بلا وسائط |
| 5 | stimulus نصي | QB-01/08 | stimulus_text | يظهر للطالب | فقدان السياق |
| 6 | بلا question_code | QB-03 | رفض رسمي | error على الصف | قبول صامت |
| 7 | status=Published في Excel | QB-03/04 | رفض | لا apply | نشر من Excel |
| 8 | صف مزاح | QB-03 | رفض | error | تفسير خاطئ |
| 9 | قيمة `فارغ` | QB-03 | NULL في adapter | تطبيع موثّق | تخزين نص فارغ |
| 10 | correct_index 1-based | QB-03/07 | تحويل معلن | خيار صحيح عبر option_code | قلب صامت |
| 11 | correct_index غامض | QB-03 | رفض | error | تخمين |
| 12 | وحدة برقم فقط | QB-03 | رفض | error | ربط خاطئ |
| 13 | درس عربي مكرر | QB-03 | رفض ambiguous | error | أول تطابق |
| 14 | تعديل منشور مستخدم | QB-05 | revision جديدة | attempt يثبت القديم | طمس |
| 15 | إعادة استيراد revision | QB-04/05 | تنقيح جديد بـ question_code | لا كسر محاولات | overwrite أعمى |
| 16 | مراجع يقرأ الحل ولا يعدّل | QB-05/06 | grader read | SELECT حلول؛ لا UPDATE بنك | كتابة زائدة |
| 17 | طالب يقرأ الحل مبكراً | QB-06 | منع | RLS/RPC | تسريب |
| 18 | مصحح يغيّر الدرجة + Audit | QB-06 | سجل كامل | audit row | تغيير صامت |
| 19 | فشل ملف وسائط | QB-03/04 | رفض/تحذير حسب requires_media | لا نشر معطوب | تجاهل |
| 20 | استكمال بعد انقطاع | QB-06/08 | resume آمن | لا فقدان إجابة | إعادة إرسال مزدوج بلا حماية |

---

## ما هو خارج النطاق الآن

- لا Migration تحت `supabase/migrations`
- لا إنشاء جداول فعلية
- لا افتراض 26 نوعاً كلها للإطلاق
- لا دمج PR / Deploy من هذه الخطة وحدها
