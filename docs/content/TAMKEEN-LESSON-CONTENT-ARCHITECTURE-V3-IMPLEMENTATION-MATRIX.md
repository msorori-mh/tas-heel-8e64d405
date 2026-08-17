# V3 — مصفوفة التنفيذ بالدفعات (21B فما بعد)

مرجع العقد: `TAMKEEN-LESSON-CONTENT-ARCHITECTURE-V3-21A-REPORT.md`
كل دفعة مستقلة، قابلة للتحقق وحدها، ولا تكسر ما قبلها.

---

## الدفعة 21B — كتب المنهج على مستوى المادة
**الهدف:** إخراج PDF الكتاب من رحلة الدرس.

| العنصر | التفصيل |
|---|---|
| Migration | `CREATE TABLE public.subject_textbooks (id, subject_id FK, grade_id FK, semester int, title, storage_path, file_version int, page_count int, lifecycle_status text default 'draft', created_at, updated_at)` + `GRANT SELECT TO authenticated` + `GRANT ALL TO service_role` + RLS (قراءة للمشتركين عبر `can_access_subject`، كتابة للطاقم عبر `has_role`) + trigger `updated_at` |
| أعمدة اختيارية | `lessons.textbook_page_from`, `lessons.textbook_page_to` |
| API | مسار جديد `src/routes/api/subject-textbook.$textbookId.ts` بنسخ منطق `lesson-file.$resourceId.ts` (Signed path + `x-file-version`) |
| Frontend | زر «كتاب المادة» في صفحة المادة؛ حذف بطاقة «نسخة الكتاب الأصلية (PDF)» من رحلة الدرس |
| العقد | إزالة `originalBookPdf` من `STUDENT_CAPABILITY_ORDER` وتحويلها إلى قدرة على مستوى المادة |
| أوفلاين | إعادة استخدام `pdf-cache.ts` بمفتاح `subject-textbook:{id}:{version}` |
| معيار القبول | الدرس بلا PDF، والمادة تعرض كتاباً واحداً لكل فصل، والأوفلاين يعمل، ولا تكرار تخزين |

---

## الدفعة 21C — توحيد الشروحات والملخصات على HTML
**الهدف:** محتوى تعليمي غني دون مسار جديد.

| العنصر | التفصيل |
|---|---|
| Migration | لا شيء (توسيع قيم نصية فقط) |
| الأنواع | إضافة `explanation_html`, `quick_review_html` إلى قائمة `html_resource_type` المسموحة في `db-adapter.ts` وواجهة الرفع |
| العقد | في `lesson-content-contract.ts`: `tamkeenExplanation` و`quickReview` تفضّل نسخة HTML منشورة، وإلا تسقط للنص |
| Frontend | إعادة استخدام `PublishedHtmlResourceViewer` داخل تبويبي الشرح والمراجعة |
| Lifecycle | تسجيل القدرتين في `lesson_capability_lifecycle` بلا تعديل بنية |
| معيار القبول | درس واحد بشرح HTML وآخر بشرح نصي يعملان معاً؛ لا انكسار RTL ولا تدفق أفقي على الجوال |

---

## الدفعة 21D — التجارب المعملية التفاعلية
| العنصر | التفصيل |
|---|---|
| النوع | `practical_experiment_html` عبر مسار الحزم القائم |
| الأمان | بدون تغيير: CSP hash-based، `sandbox="allow-scripts"` فقط، Bridge مقيّد، منع CDN وشبكة |
| Frontend | تبويب «التجربة العملية» يعرض الحزم المنشورة فقط |
| طيّ القديم | `lesson_simulations` للقراءة فقط + شارة «مورد قديم» في الأدمن |
| معيار القبول | تجربة تفاعلية تعمل داخل الإطار دون أي طلب شبكة خارجي (إثبات عبر Playwright + سجل الشبكة) |

---

## الدفعة 21E — أسئلة الكتاب الرسمية + Safe Reveal
| العنصر | التفصيل |
|---|---|
| Migration | `ALTER TABLE public.question_options ADD COLUMN rationale text NULL;` (لا GRANT جديد) |
| ربط | بلوك `official_textbook_assessment` يحمل `question_code` اختيارياً يربطه بصف في `questions`/`question_revisions` |
| RPC | `get_official_question_solution(p_question_id)` — `SECURITY DEFINER`، تتحقق من `can_access_lesson` + (`AFTER_SUBMIT` مستوفى أو `can_read_hidden_solutions`)، `REVOKE FROM anon/public`, `GRANT EXECUTE TO authenticated` |
| Frontend | زر «الإجابة النموذجية» يظهر بعد التسليم فقط ويجلب المحتوى عند الضغط — لا Prefetch |
| فحص تسريب | اختبار static يثبت أن أي Payload يصل للعميل قبل التسليم لا يحوي `is_correct` / `model_answer` / `rationale` |
| معيار القبول | صفر تسريب في الشبكة قبل التسليم؛ الطاقم فقط يرى الحل مسبقاً |

---

## الدفعة 21F — إغلاق فجوة التتبّع (G5 + G6)
| العنصر | التفصيل |
|---|---|
| اختبار الدرس | توجيه اختبار الدرس إلى `practice_attempts` / `practice_attempt_responses` بدل `user_progress` وحده (مع إبقاء تحديث `user_progress` للتوافق) |
| المقالي | ربط `EssayQuestionCard` بإرسال فعلي يخزَّن كـ `practice_attempt_response` بحالة تصحيح يدوي معلّق |
| التحليلات | ظهور أخطاء اختبار الدرس في «دفتر الأخطاء 15B» و«الأداء الموحد 15C» |
| معيار القبول | خطأ في اختبار درس يظهر خلال ثوانٍ في دفتر الأخطاء؛ إجابة مقالية تصل لقائمة التصحيح اليدوي |

---

## الدفعة 21G — تصحيحات تشغيلية ووثائق
- تصحيح وصف القالب 04 من «Markdown» إلى «HTML وفق معيار 20A».
- تحديث `TAMKEEN-YOUSUF-CONTENT-INTAKE-STANDARD-20E.md`: حزمة الدرس تصبح 8 عناصر (بلا PDF) + عنصر جديد على مستوى المادة.
- تحديث `TAMKEEN-LESSON-CONTENT-CHECKLIST-20E.md` بمصفوفة الجاهزية الجديدة.

---

## ترتيب التنفيذ الملزم
```text
21B (كتب المادة)
  └─ 21C (HTML للشرح والمراجعة)
       └─ 21D (التجارب التفاعلية)
            └─ 21E (Safe Reveal)
                 └─ 21F (التتبّع والتحليلات)
                      └─ 21G (الوثائق)
```

## بوابات الجودة لكل دفعة
1. لا `dangerouslySetInnerHTML` جديد.
2. لا `allow-same-origin`.
3. RLS + GRANT مكتملة لأي جدول جديد.
4. اختبار static أمني لكل مسار يمسّ الإجابات.
5. إثبات Playwright على الجوال (RTL، بلا تدفق أفقي).
6. لا كتابة على قاعدة الإنتاج قبل موافقة صريحة لكل Migration.
