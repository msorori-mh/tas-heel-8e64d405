# IMPORT-SYSTEM-01 — تحليل وتصميم نظام الاستيراد عبر Excel

> **مرحلة تحليل فقط** — لا تعديلات على قاعدة البيانات أو UI تنفيذية.
> الهدف: تحديد الكيانات القابلة للاستيراد، تصميم القوالب، ترتيب الاستيراد، قواعد التحقق، استراتيجية الأمان.

---

## 1) الكيانات القابلة للاستيراد (مأخوذة من الـ schema الفعلي)

| # | الجدول | حقول رئيسية | المرحلة المقترحة |
|---|--------|-------------|-------------------|
| 1 | `curriculum_tracks` | `track_code`, `track_name` | ضروري الآن |
| 2 | `governorates` | `name`, `default_curriculum_track_id` | ضروري الآن |
| 3 | `governorate_curriculum_map` | `governorate_id`, `curriculum_track_id` | ضروري الآن |
| 4 | `grades` | `slug`, `name`, `category`, `curriculum_track_id` | ضروري الآن |
| 5 | `subjects` | `slug`, `name`, `grade_id`, `curriculum_track_id`, `semester` | ضروري الآن |
| 6 | `units` | `subject_id`, `title`, `sort_order`, `is_free` | ضروري الآن |
| 7 | `lessons` | `subject_id`, `unit_id`, `slug`, `title`, `semester`, `is_free` | ضروري الآن |
| 8 | `lesson_book_contents` | `lesson_id`, `content`, `pdf_url` | مهم لاحقاً |
| 9 | `lesson_summaries` | `lesson_id`, `summary`, `key_points`, `study_tip` | مهم لاحقاً |
| 10 | `lesson_explanations` | `lesson_id`, `title`, `content`, `sort_order` | مهم لاحقاً |
| 11 | `lesson_resources` | `lesson_id`, `resource_type`, `title`, `url` | مهم لاحقاً |
| 12 | `questions` | `lesson_id`/`subject_id`, `question_text`, `options[]`, `correct_index`, `explanation`, `year` | **ضروري الآن** (الأهم) |
| 13 | `exam_templates` | `title`, `mode`, `subject_id`, `unit_id`, `lesson_id`, `duration_seconds` | مهم لاحقاً |
| 14 | `exam_template_questions` | `template_id`, `question_id`, `sort_order`, `points` | مهم لاحقاً |
| 15 | `subscription_plans` | `name`, `duration_months`, `price`, `currency` | مهم لاحقاً |
| 16 | `payment_methods` | `type`, `name`, `account_number`, `details` | مهم لاحقاً |

**غير مناسب للاستيراد (تُدار من التطبيق فقط):**
- `profiles`, `user_roles`, `subscriptions`, `payment_requests`, `wallet_*`, `exam_sessions`, `student_points`, `notifications`, `referrals`, `certificates`, `audit_logs`, `email_*`. كلها بيانات مستخدمين/حركات لا تُستورد bulk.

---

## 2) ترتيب الاستيراد (Topological Order)

```
1. curriculum_tracks
2. governorates           (يحتاج track_code للـ default)
3. governorate_curriculum_map  (يحتاج governorate + track)
4. grades                 (يحتاج track_code اختياري)
5. subjects               (يحتاج grade_slug + track_code اختياري)
6. units                  (يحتاج subject_code)
7. lessons                (يحتاج subject_code + unit_code اختياري)
8. lesson_contents (book/summary/explanation/resource)  — يحتاج lesson_code
9. questions              (يحتاج lesson_code أو subject_code)
10. exam_templates        (يحتاج subject/unit/lesson code)
11. exam_template_questions (يحتاج template_code + question_code)
12. subscription_plans
13. payment_methods
```

---

## 3) استراتيجية الربط — أكواد بدلاً من UUIDs

**القاعدة:** لا UUID في Excel. كل سطر يربط بكود نصي مقروء.

| الكيان | عمود المفتاح في القالب | المصدر |
|--------|------------------------|--------|
| Track | `track_code` | `curriculum_tracks.track_code` (موجود) |
| Governorate | `governorate_name` | `governorates.name` (فريد عملياً) |
| Grade | `grade_slug` | `grades.slug` (موجود — `grade-10` ...) |
| Subject | `subject_code` | **جديد**: نضيف عمود `code` في migration لاحقة، أو نستخدم `slug` الحالي |
| Unit | `unit_code` | **جديد**: نضيف `code` في migration لاحقة |
| Lesson | `lesson_slug` | `lessons.slug` (موجود) |
| Question | `question_code` | **جديد**: نضيف `external_code` لاحقاً (اختياري — الأسئلة كثيرة) |
| Exam Template | `template_code` | **جديد**: نضيف `code` لاحقاً |

**ملاحظة هامة:** المخطط الحالي لا يحتوي `code` لـ `subjects/units/exam_templates`. خياران:
- **(أ)** نضيف عمود `code TEXT UNIQUE` لكل من `subjects`, `units`, `exam_templates`, `payment_methods`, `subscription_plans` في IMPORT-SYSTEM-02 (migration واحدة بسيطة).
- **(ب)** نستخدم مفاتيح مركبة (مثلاً `grade_slug + subject_name` للمواد، `subject_code + unit_sort_order` للوحدات). أبسط ولا يحتاج migration، لكنه هشّ عند تغيير الأسماء.

**التوصية:** الخيار (أ) — أنظف وأقل خطأ بشري.

---

## 4) قوالب Excel المقترحة

كل ملف = ورقة واحدة + ورقة `README` (تعليمات + شرح الأعمدة + قائمة الأكواد المرجعية).

### 4.1 `01_curriculum_tracks.xlsx`
| العمود | النوع | إلزامي | مثال | قاعدة |
|--------|------|--------|------|------|
| `track_code` | text | ✅ | `sanaa` | snake_case، فريد |
| `track_name` | text | ✅ | `منهج صنعاء` | |
| `description` | text | ❌ | | |
| `is_active` | bool | ❌ (افتراضي true) | `TRUE` | TRUE/FALSE |

### 4.2 `02_governorates.xlsx`
| العمود | النوع | إلزامي | مثال |
|--------|------|--------|------|
| `name` | text | ✅ | `صنعاء` |
| `default_track_code` | text→FK | ❌ | `sanaa` |
| `sort_order` | int | ❌ | `1` |

### 4.3 `03_governorate_curriculum_map.xlsx`
| `governorate_name` | text→FK | ✅ | `صنعاء` |
| `track_code` | text→FK | ✅ | `sanaa` |

### 4.4 `04_grades.xlsx`
| `slug` | text | ✅ | `grade-10` (kebab) |
| `name` | text | ✅ | `الصف الأول الثانوي` |
| `category` | text | ✅ | `secondary` |
| `track_code` | text→FK | ❌ | `sanaa` |
| `sort_order` | int | ❌ | `1` |

### 4.5 `05_subjects.xlsx`
| `subject_code` | text | ✅ | `math-g10-sanaa` (سيُحفظ في عمود `code` الجديد) |
| `name` | text | ✅ | `الرياضيات` |
| `grade_slug` | text→FK | ✅ | `grade-10` |
| `track_code` | text→FK | ❌ | `sanaa` |
| `semester` | int (1/2) | ❌ | `1` |
| `icon` | text | ❌ | `📐` |
| `color` | text | ❌ | `#2563eb` |
| `sort_order` | int | ❌ | `1` |

### 4.6 `06_units.xlsx`
| `unit_code` | text | ✅ | `math-g10-sanaa-u1` |
| `subject_code` | text→FK | ✅ | `math-g10-sanaa` |
| `title` | text | ✅ | `الوحدة الأولى: الأعداد الحقيقية` |
| `description` | text | ❌ | |
| `sort_order` | int | ❌ | `1` |
| `is_free` | bool | ❌ | `FALSE` |

### 4.7 `07_lessons.xlsx`
| `lesson_slug` | text | ✅ | `math-g10-u1-l1` |
| `subject_code` | text→FK | ✅ | `math-g10-sanaa` |
| `unit_code` | text→FK | ❌ (يجب أن يطابق subject) | `math-g10-sanaa-u1` |
| `title` | text | ✅ | `الدرس الأول: الأعداد النسبية` |
| `duration` | text | ❌ | `25 دقيقة` |
| `video_url` | url | ❌ | |
| `content_pdf_url` | url | ❌ | |
| `semester` | int | ❌ | `1` |
| `is_free` | bool | ❌ | `FALSE` |
| `sort_order` | int | ❌ | `1` |

### 4.8 `08_lesson_contents.xlsx` (4 شيتات)
- **Sheet `book_content`**: `lesson_slug`, `content` (markdown), `pdf_url`
- **Sheet `summary`**: `lesson_slug`, `summary`, `key_points` (نص مفصول بسطر/فاصلة → يُحوّل JSON)، `study_tip`
- **Sheet `explanations`**: `lesson_slug`, `title`, `content`, `sort_order`
- **Sheet `resources`**: `lesson_slug`, `resource_type` (video/pdf/link/image)، `title`, `url`, `description`, `sort_order`

### 4.9 `09_questions.xlsx` (الأهم — صيغة موحدة)
| العمود | النوع | إلزامي | مثال |
|--------|------|--------|------|
| `question_code` | text | ❌ (يُولّد إن لم يوجد) | `Q-MATH-G10-001` |
| `lesson_slug` | text→FK | ⚠️ (إما هذا أو subject_code) | `math-g10-u1-l1` |
| `subject_code` | text→FK | ⚠️ | `math-g10-sanaa` |
| `question_text` | text | ✅ | `كم يساوي 2+2؟` |
| `option_1` ... `option_6` | text | ✅ (الأقل 2) | `3` / `4` / `5` / `6` |
| `correct_index` | int (1-based) | ✅ | `2` (= option_2) |
| `explanation` | text | ❌ | |
| `question_type` | text | ❌ (افتراضي mcq) | `mcq` |
| `year` | int | ❌ | `2023` |
| `semester` | int | ❌ | `1` |
| `sort_order` | int | ❌ | |

**ملاحظة:** نحوّل `option_1..6` إلى JSONB array، و`correct_index` من 1-based إلى 0-based عند الحفظ.

### 4.10 `10_exam_templates.xlsx` (شيتان)
- **Sheet `templates`**: `template_code`, `title`, `description`, `mode` (training/strict/ministry), `subject_code`, `unit_code`, `lesson_slug`, `duration_seconds`, `is_active`
- **Sheet `template_questions`**: `template_code`, `question_code`, `sort_order`, `points`

### 4.11 `11_subscription_plans.xlsx`
| `name`, `duration_type` (monthly/semester/year), `duration_months`, `price`, `currency` (افتراضي YER), `is_active`, `sort_order` |

### 4.12 `12_payment_methods.xlsx`
| `type` (bank/exchange/ewallet/...), `name`, `account_name`, `account_number`, `details`, `logo_url`, `barcode_url`, `is_active`, `sort_order` |

---

## 5) قواعد التحقق (Validation Rules)

### عامة
- ترميز UTF-8، أرقام إنجليزية في الأعمدة الرقمية.
- لا أسطر فارغة بين الصفوف.
- التحقق من الأعمدة الإلزامية وعدم تكرارها.
- التحقق من أن FK codes موجودة فعلاً في DB (أو في الملفات الأسبق في نفس عملية الاستيراد).
- BOOL يقبل: TRUE/FALSE/1/0/نعم/لا.
- URL يجب أن يبدأ بـ `http://` أو `https://`.

### خاصة بالأسئلة
- `correct_index` بين 1 و عدد `option_*` المعبأة.
- عدد الخيارات بين 2 و 6.
- إذا كان `lesson_slug` موجود لا يلزم `subject_code` (نشتقه من الدرس)؛ وإلا يلزم `subject_code`.
- `question_text` ≤ 2000 حرف، `option_*` ≤ 500 حرف.

### خاصة بالدروس
- إذا حُدد `unit_code` يجب أن تكون الوحدة تابعة لنفس `subject_code` (تطبيق trigger `validate_lesson_unit_subject_match` الموجود).

### خاصة بالمواد
- إذا حُدد `track_code` يجب توافقه مع الـ track المسموح للصف.

---

## 6) منع التكرار (Idempotency / Upsert)

كل ملف يستخدم **مفتاحاً طبيعياً** للـ upsert:

| الكيان | مفتاح الـ upsert | السلوك |
|--------|------------------|--------|
| `curriculum_tracks` | `track_code` | upsert |
| `governorates` | `name` | upsert |
| `governorate_curriculum_map` | `(governorate, track)` | INSERT … ON CONFLICT DO NOTHING |
| `grades` | `slug` | upsert |
| `subjects` | `code` (الجديد) أو `slug` | upsert |
| `units` | `code` (الجديد) | upsert |
| `lessons` | `slug` | upsert |
| `lesson_book_contents/summaries` | `lesson_id` (1:1) | upsert |
| `lesson_explanations/resources` | `(lesson_id, sort_order)` أو `(lesson_id, title)` | upsert |
| `questions` | `question_code` إن وُجد، وإلا hash(`lesson_id` + normalized `question_text`) | تجاهل المكرر |
| `exam_templates` | `code` | upsert |
| `exam_template_questions` | `(template_id, question_id)` | DO NOTHING |
| `subscription_plans` | `(name, duration_months)` | upsert |
| `payment_methods` | `(type, name)` | upsert |

المستخدم يختار في الواجهة بين: **Upsert** (تحديث الموجود) أو **Skip duplicates** (تجاهل).

---

## 7) استراتيجية Preview / Dry-Run

تدفق الاستيراد في 4 خطوات داخل لوحة الإدارة:

```
Upload → Parse & Validate (dry-run) → Preview & Confirm → Execute
```

1. **Upload**: رفع ملف `.xlsx` (≤ 5 MB).
2. **Parse**: قراءة الشيتات على السيرفر عبر `createServerFn` (مكتبة `xlsx` أو `exceljs`).
3. **Dry-run validation**: التحقق من كل سطر دون كتابة. النتيجة:
   - عدد الصفوف الإجمالي / الصحيح / الفاشل
   - جدول الأخطاء (الصف + العمود + الرسالة)
   - معاينة أول 20 سطر صالح
   - عدّاد ما سيتم: إضافة / تحديث / تجاهل (مكرر)
4. **Confirm + Execute**: زر "تنفيذ" يبدأ transaction واحد (`BEGIN ... COMMIT`).
   - **All-or-nothing**: إذا فشل أي سطر داخل التنفيذ → rollback كامل (الافتراضي).
   - **Partial mode** (اختياري بـ checkbox): commit الصفوف الناجحة وتقرير بالفاشلة.

---

## 8) قواعد الأمان

| القاعدة | التطبيق |
|---------|---------|
| الطلاب: لا وصول مطلقاً | الراوت تحت `/admin/import/*` + check `has_role('admin')` في الـ server function |
| Admin فقط | كل استدعاء يمر بـ `requireSupabaseAuth` + `has_role(uid, 'admin')` |
| لا UUID خارجية | الـ parser يرفض أي عمود اسمه `id` أو يحتوي UUID مباشر |
| حد حجم الملف | 5 MB، حد أقصى 10,000 سطر/ملف |
| حد المعدل (Rate limit) | عملية استيراد واحدة في الوقت لكل admin (lock بسيط) |
| Audit log | كل تنفيذ ينشئ سجل في `audit_logs` (action=`import.executed`, target_type=table, metadata={rows, errors, file_hash}) |
| Sanitization | trim للنصوص، تطبيع المسافات، رفض scripts/HTML في الحقول النصية الحساسة |
| Preview قبل الكتابة | إلزامي — لا execute بدون dry-run يسبقه (المفتاح: نمرر `validation_token` من المعاينة إلى التنفيذ) |

---

## 9) المخاطر وكيفية التخفيف

| المخاطرة | التخفيف |
|----------|---------|
| اختلال FK (مثلاً lesson يشير لـ subject غير موجود) | dry-run يتحقق من كل FK code أولاً قبل أي insert |
| تكرار صامت يُنشئ ازدواجية | uniqueness constraint + upsert key واضح لكل جدول |
| تنزيل/رفع ملفات كبيرة على شبكة ضعيفة | حد 5 MB، streaming parsing، progress bar |
| ترميز RTL/أرقام عربية | تطبيع الأرقام (٠-٩ → 0-9)، إجبار UTF-8 |
| استيراد جزئي يترك DB في حالة وسيطة | transaction واحد لكل ملف افتراضياً |
| فقد أعمدة `code` الجديدة عند ربط الأسئلة بالاختبارات | IMPORT-SYSTEM-02 يبدأ بـ migration صغير يضيف `code` فقط (دون كسر أي شيء) |
| Excel يحوّل أرقاماً طويلة إلى scientific notation | توثيق في `README` للشيت: اجعل عمود الأرقام الطويلة "Text" |
| Macros / Formulas في الملف المرفوع | الـ parser يقرأ القيم النهائية فقط، يتجاهل الـ formulas |

---

## 10) خطة التنفيذ — الـ Roadmap

| المرحلة | الوصف | المخرجات |
|---------|-------|----------|
| **IMPORT-SYSTEM-01** (هذه) | تحليل وتصميم | هذا التقرير |
| **IMPORT-SYSTEM-02** | إنشاء قوالب Excel جاهزة + migration بسيط يضيف `code` لـ subjects/units/exam_templates/subscription_plans/payment_methods | 12 ملف `.xlsx` تحت `/public/import-templates/` + migration |
| **IMPORT-SYSTEM-03** | واجهة Admin: رفع + معاينة + تقرير أخطاء (UI فقط) تحت `/admin/import` | صفحات React + server functions للـ dry-run |
| **IMPORT-SYSTEM-04** | تنفيذ الاستيراد الفعلي (transactions، upsert، audit) | server functions للـ execute لكل كيان |
| **IMPORT-SYSTEM-05** | تقارير الأخطاء التفصيلية + تنزيل CSV بالأسطر الفاشلة + سجل الاستيرادات السابقة | جدول `import_runs` + UI سجل |

---

## 11) ملاحظات من فلسفة مفاضلة (للمرجع فقط)

- **Validation متعددة الطبقات**: client-side (zod للأعمدة) + server-side (re-validate) + DB constraints + RLS.
- **Bank-of-questions pattern**: الأسئلة كيان مستقل، تُربط بدروس/مواد/اختبارات لاحقاً. هذا متوافق مع schema الحالي (`questions.lesson_id` nullable).
- **Curriculum-region scoping**: كل استيراد للأسئلة يحمل `track_code` ضمناً عبر الـ subject، فلا تسريب بين مناهج المحافظات.
- **Offline-first / weak network**: dry-run/preview يُنجَز كله على السيرفر في طلب واحد، التنفيذ في طلب آخر — يقلّل الفشل المنتصف.

---

## خلاصة قابلة للتنفيذ

- ✅ **12 قالب Excel** مرتبة حسب التبعية.
- ✅ **5 جداول تحتاج عمود `code`** (subjects, units, exam_templates, subscription_plans, payment_methods) — migration واحدة بسيطة في IMPORT-SYSTEM-02.
- ✅ **مفتاح ربط نصي** (`*_code` / `*_slug`) لا UUID في Excel أبداً.
- ✅ **Preview → Confirm → Execute** إلزامي لكل عملية، مع transaction كامل.
- ✅ **Admin فقط** + audit log لكل تنفيذ.
- ✅ **خمس مراحل تنفيذية** (02 → 05) كل واحدة قابلة للتسليم بشكل مستقل.

**الخطوة التالية المقترحة:** الموافقة على هذا التحليل → الانتقال إلى **IMPORT-SYSTEM-02** (إنشاء الـ 12 قالب فعلياً + migration إضافة `code`).
