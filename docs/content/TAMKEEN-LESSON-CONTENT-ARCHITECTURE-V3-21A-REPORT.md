# TAMKEEN_LESSON_CONTENT_ARCHITECTURE_V3_AUDIT_AND_CONTRACT_21A

**النوع:** AUDIT + FINAL CONTRACT + IMPLEMENTATION PLAN ONLY
**لا تعديل كود إنتاجي، لا Migration، لا كتابة على قاعدة الإنتاج في هذه المرحلة.**
التاريخ: 2026-08-17

---

## 0. الحكم التنفيذي

| البند | النتيجة |
|---|---|
| هل V3 قابلة للتنفيذ فوق البنية الحالية؟ | **نعم** — دون إنشاء نظام محتوى جديد |
| هل تحتاج جداول جديدة؟ | **جدول واحد فقط**: `subject_textbooks` (كتب المنهج على مستوى المادة/الفصل) |
| هل تحتاج أعمدة جديدة؟ | نعم، محدودة: `question_options.rationale`، `question_solutions.reveal_policy` (موجود)، ووسم `content_format` للشروحات/الملخصات |
| أكبر مخاطرة | ازدواج مسار الأسئلة: نظام Legacy (`questions.correct_index`) + نظام QB-01 (`question_revisions`) يعملان بالتوازي |
| الحكم | **PASS_AUDIT — READY_FOR_V3_IMPLEMENTATION_APPROVAL** |

---

## 1. جرد الوضع القائم (AS-IS)

### 1.1 طبقة الكتاب الرسمي (Layer A)
- التخزين: `lesson_book_contents(content, pdf_url)` — لا جدول جديد.
- صيغتان متوازيتان:
  1. **HTML مقيّد بقائمة سماح** — معيار 20A في `src/lib/content/official-textbook/standard.ts`
     (`ALLOWED_TAGS`, `FORBIDDEN_TAGS` تمنع `script/iframe/form/svg/a`، جذر `<section data-layer="A_OFFICIAL_TEXTBOOK" data-official-standard="20A">`).
     العارض: `OfficialTextbookContent.tsx` — إعادة بناء عناصر React عقدة بعقدة، **بدون `dangerouslySetInnerHTML`**.
  2. **JSON بنيوي (Pilot 20A1B)** — `structured-blocks.ts` + `StructuredTextbookReader.tsx`، مرتبط بعلامة `TAMKEEN_STRUCTURED_PILOT:20A1B` داخل `content`.
- أسئلة الكتاب الرسمية موجودة اليوم كبلوك عرض فقط: `official_textbook_assessment` (نص حرفي، بلا إجابات وبلا تصحيح).

### 1.2 الشروحات والملخصات
- `lesson_explanations(content text)` — **نص عادي** يُعرض بـ `whitespace-pre-wrap`. لا Markdown ولا HTML.
- `lesson_summaries(summary, key_points jsonb, study_tip)` — نص + قائمة نقاط.
- كلاهما مربوط بدورة حياة 20C عبر `lesson_capability_lifecycle`.

### 1.3 مسار HTML المعتمد (الأصل الأهم لإعادة الاستخدام)
موجود وجاهز بالكامل في `src/lib/content-import/html-package/*` و`src/lib/server/html-pipeline/*`:
- رفع **حزمة ZIP** (لا HTML خام في عمود).
- فحص أمني على الخادم: `html-security-scanner`, `js-scanner`, `css-scanner`, `mime-validator`,
  `url-normalizer` (منع `javascript:`/`vbscript:`/CDN، سماح `data:image/*` فقط)، `manifest-validator`،
  وفحص تسريب الإجابات وPII في `package-validator.ts` (`LEAKAGE_PATTERNS`, `PII_PATTERNS`)، وسقف 50MB.
- `csp-builder.ts`: CSP بـ `script-src 'self' + sha256 hashes + nonce`، لا CDN.
- التسليم: `PublishedHtmlResourceViewer` → `InteractiveResourceViewer` داخل
  `<iframe sandbox="allow-scripts">` **بدون** `allow-same-origin` / `allow-forms` / `allow-popups` / `allow-top-navigation`،
  مع جسر رسائل مقيّد (`bridge.ts`: تحقق من `event.source`، مفاتيح مسموحة فقط، سقوف أطوال).
- دورة الحياة: `lesson_resources.lifecycle_status='published'` + `published_version_id NOT NULL`.
- الأنواع المستخدمة اليوم في `html_resource_type`: `mind_map_html`, `practical_experiment_html`, `summary_html`.

**النتيجة الحاسمة:** V3 لا تحتاج Sandbox جديداً ولا Sanitizer جديداً — كل ما يلزم هو **توسيع `html_resource_type`** وربط العارض بالقدرات.

### 1.4 PDF الدرس والأوفلاين
- اليوم: `lesson_resources(is_primary=true, resource_type='pdf')` → توصيل عبر `/api/lesson-file/$resourceId` (Proxy آمن) → تخزين IndexedDB/Capacitor (سقف 350MB، إبطال عبر `x-file-version`).
- المشكلة المعمارية: الكتاب المدرسي **ليس ملكية درس**، بل ملكية **مادة + فصل دراسي**؛ تكراره على كل درس يضخّم التخزين ويشوش Journey الدرس.

### 1.5 بنك الأسئلة والأمان
- جيلان متوازيان:
  - **Legacy:** `questions(options jsonb, correct_index, explanation)` → `get_lesson_quiz_questions` (يُسقط `correct_index`/`explanation` من SELECT) و`grade_lesson_quiz` (تصحيح على الخادم، يعيد `is_correct` + `explanation` فقط) → يكتب في `user_progress`.
  - **QB-01:** `question_revisions` + `question_options` + `question_accepted_answers` + `question_solutions` + `question_solution_steps` + `question_targets` → `practice_attempts` / `exam_sessions`.
- `interaction_type` المدعوم فعلياً: `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `SHORT_TEXT`, `LONG_TEXT` (`official-normalized-v1.ts`).
- `question_options` **لا يحتوي عمود تبرير لكل خيار** — تفسير على مستوى السؤال فقط عبر `question_solutions.explanation`.
- `reveal_policy` موجود في `question_solutions` (افتراضي `AFTER_SUBMIT`) وبوابة `can_read_hidden_solutions` قائمة لكنها **غير مستخدمة** في مسار Legacy.
- **فجوة تتبّع:** اختبار الدرس (Legacy) يكتب في `user_progress` فقط ولا يغذّي «دفتر الأخطاء 15B» ولا «الأداء الموحد 15C».
- `EssayQuestionCard` في صفحة الدرس اليوم **واجهة صمّاء** (textarea محلي، بلا إرسال ولا تصحيح) رغم وجود بنية `question_response_reviews` الكاملة على القاعدة.

---

## 2. عقد V3 النهائي (TO-BE)

### 2.1 مبدأ حاكم
> **الكتاب ملكية مادة/فصل. المحتوى التعليمي ملكية درس. الإجابة ملكية الخادم.**

### 2.2 طبقات الدرس في V3 (رحلة الطالب)
| # | القدرة | التخزين | الصيغة |
|---|---|---|---|
| 1 | محتوى الكتاب الرسمي | `lesson_book_contents` | HTML-20A أو JSON بنيوي |
| 2 | شرح تمكين | `lesson_explanations` + (اختياري) `lesson_resources(explanation_html)` | نص أو HTML مُحزّم |
| 3 | الخريطة الذهنية | `lesson_resources(mind_map_html)` | HTML مُحزّم |
| 4 | التجربة/المحاكاة | `lesson_resources(practical_experiment_html)` | HTML تفاعلي مُحزّم |
| 5 | الموارد المساعدة | `lesson_resources(video/link)` | روابط |
| 6 | المراجعة السريعة | `lesson_summaries` + `lesson_resources(summary_html)` | نص أو HTML |
| 7 | اختبر فهمك | `questions` / QB-01 | أسئلة قصيرة |
| 8 | اختبار الدرس | `lesson_assessments` + `exam_templates` | تقييم مُصحَّح |
| 9 | مستواك وأخطاؤك | مشتق (15B/15C) | تحليلات |

**تُحذف من رحلة الدرس:** «نسخة الكتاب الأصلية (PDF)» — تنتقل إلى مستوى المادة.

### 2.3 كتب المنهج على مستوى المادة (التغيير المعماري الوحيد الكبير)
جدول جديد واحد `public.subject_textbooks`:
`id, subject_id, grade_id, semester, title, storage_path, file_version, page_count, lifecycle_status, created_at, updated_at`
- التسليم بإعادة استخدام Proxy الحالي بمسار جديد `/api/subject-textbook/$textbookId` بنفس منطق `x-file-version` والتخزين الأوفلاين.
- نقطة الدخول للطالب: صفحة المادة، لا صفحة الدرس.
- ربط اختياري للقراءة الموجّهة: `lessons.textbook_page_from/to` (عمودان اختياريان) لعرض «صفحات هذا الدرس في الكتاب» دون تخزين PDF لكل درس.

### 2.4 توحيد الشروحات والملخصات على HTML
- توسيع `html_resource_type` بقيمتين: `explanation_html`, `quick_review_html` (`summary_html` تبقى مرادفاً متوافقاً رجعياً).
- إبقاء الأعمدة النصية القائمة كـ **Fallback دائم** — لا حذف ولا ترحيل قسري.
- سياسة العرض: إن وُجدت نسخة HTML منشورة تُعرض؛ وإلا يُعرض النص. القرار في العقد `lesson-content-contract.ts` لا في الواجهة.

### 2.5 التجارب المعملية التفاعلية
- تُنفَّذ حصراً عبر مسار حزم HTML القائم (`practical_experiment_html`) بنفس CSP/Sandbox/Bridge.
- `lesson_simulations` (PhET) تبقى للقراءة فقط وتُطوى تدريجياً كما هو مخطط سابقاً؛ **لا روابط خارجية جديدة**.
- قواعد أمنية إلزامية (كلها مطبّقة أصلاً ويجب عدم إضعافها):
  لا JS خارجي، لا CDN، لا `allow-same-origin`، لا وصول للشبكة من داخل الإطار، لا cookies/تخزين، ولا Bridge خارج المفاتيح المسموحة.

### 2.6 أسئلة الكتاب الرسمية + طبقة الإجابة النموذجية (Safe Reveal)
- أسئلة الكتاب تبقى **نصاً حرفياً** داخل بلوك `official_textbook_assessment` (لا تُحوَّل إلى MCQ ولا تُعدَّل صياغتها).
- تُربط بطبقة إجابة نموذجية منفصلة تُخزَّن في `question_solutions` (`solution_type='MODEL'`, `reveal_policy`).
- **عقد Safe Reveal (إلزامي):**
  1. لا يُرسل نص الإجابة ولا `is_correct` للعميل قبل استيفاء الشرط.
  2. الشرط `AFTER_SUBMIT` يتحقق على الخادم فقط داخل RPC مُصرَّح `SECURITY DEFINER`.
  3. `can_read_hidden_solutions` تُستخدم للطاقم فقط ولا تُمنح لـ `anon`.
  4. لا يُدرج أي مفتاح إجابة داخل حزم HTML — يفرضها `LEAKAGE_PATTERNS` القائم.
- **إضافة مطلوبة:** `question_options.rationale text NULL` لتبرير كل خيار (غير موجود اليوم)، ولا يُكشف إلا بعد التسليم بنفس بوابة Safe Reveal.

### 2.7 دورة الحياة
تبقى 20C كما هي بلا تغيير: `DRAFT → REVIEW → READY` مع `ready_snapshot`، وتُمدّد لتغطي القدرات الجديدة (`explanation_html`, `quick_review_html`, `practical_experiment_html`) عبر نفس الجدول `lesson_capability_lifecycle` دون تعديل بنيته.

---

## 3. الفجوات المرصودة

| # | الفجوة | الأثر | الحل في V3 |
|---|---|---|---|
| G1 | PDF الكتاب مخزَّن ومكرر على مستوى الدرس | تضخم أوفلاين + تشويش الرحلة | `subject_textbooks` |
| G2 | الشروحات/الملخصات نص فقط | لا جداول ولا معادلات ولا تنسيق غني | `explanation_html` / `quick_review_html` |
| G3 | لا تبرير لكل خيار | ضعف القيمة التعليمية بعد التصحيح | `question_options.rationale` |
| G4 | أسئلة الكتاب بلا طبقة إجابة | الطالب يقرأ سؤالاً بلا مرجع | ربط `question_solutions` + Safe Reveal |
| G5 | اختبار الدرس (Legacy) لا يغذّي 15B/15C | فجوة في دفتر الأخطاء والأداء | توحيد اختبار الدرس على `practice_attempts` |
| G6 | `EssayQuestionCard` واجهة صمّاء | إجابة الطالب تضيع | ربطها بـ `question_response_reviews` |
| G7 | قالب 04 يقول Markdown بينما المعيار HTML | لبس تشغيلي ليوسف | تصحيح وصف القالب فقط |
| G8 | `lesson_simulations` بروابط PhET خارجية بلا Sandbox | سطح هجوم متبقٍ | تجميد وطيّ |

---

## 4. ما لا يجوز عمله في V3 (حدود صارمة)

1. لا نظام محتوى جديد، ولا Sanitizer جديد، ولا Sandbox ثانٍ.
2. لا `dangerouslySetInnerHTML` في أي عارض جديد.
3. لا `allow-same-origin` في أي iframe محتوى.
4. لا حذف للأعمدة النصية القائمة ولا ترحيل قسري للمحتوى الحالي.
5. لا تغيير في بنية `lesson_capability_lifecycle` ولا في سياسات RLS المعتمدة في 20C-A1.
6. لا كشف إجابة على العميل — التصحيح والكشف على الخادم دائماً.

---

## 5. الحكم

**TAMKEEN_LESSON_CONTENT_ARCHITECTURE_V3_AUDIT_AND_CONTRACT_21A = PASS_AUDIT_READY_FOR_IMPLEMENTATION_APPROVAL**

خطة التنفيذ التفصيلية بالدفعات: `docs/content/TAMKEEN-LESSON-CONTENT-ARCHITECTURE-V3-IMPLEMENTATION-MATRIX.md`
