# دليل قوالب تجهيز المحتوى — للمهندس يوسف

> **الغرض:** تجهيز محتويات الدروس (مواد، وحدات، دروس، نصوص، موارد، أسئلة) **قبل** أي استيراد فعلي إلى النظام.  
> **المسار:** `docs/content-templates/`  
> **إعادة التوليد:** `node scripts/generate-content-templates.mjs`

---

## 1. معنى كل قالب

| الملف | الغرض |
|-------|--------|
| `01_subjects_template.xlsx` | تعريف المواد الدراسية (كود، صف، منهج، أيقونة، لون) |
| `02_units_template.xlsx` | وحدات كل مادة (مجاني/مدفوع، ترتيب) |
| `03_lessons_template.xlsx` | قائمة الدروس لكل وحدة — **`lesson_code` يُستخدم في كل النماذج التالية** |
| `04_lesson_book_contents_template.xlsx` | نص الدرس الرئيسي (Markdown) + رابط PDF اختياري |
| `05_lesson_explanations_template.xlsx` | شروحات إضافية متعددة لكل درس |
| `06_lesson_resources_template.xlsx` | **الموارد التعليمية:** فيديو، خريطة ذهنية، تجربة، PDF، رابط |
| `07_lesson_assessments_template.xlsx` | اختبارات/تقييمات قصيرة مرتبطة بدرس |
| `08_assessment_questions_template.xlsx` | ربط أسئلة (من 09) باختبار (من 07) |
| `09_questions_template.xlsx` | بنك أسئلة MCQ — أعمدة الإجابة للمحررين فقط |

---

## 2. ترتيب التعبئة (إلزامي)

```
01 subjects
  → 02 units
    → 03 lessons
      → 04 book contents
      → 05 explanations
      → 06 resources
      → 07 assessments
        → 09 questions (أولاً)
        → 08 assessment_questions (ربط)
```

**لا تبدأ موارد أو أسئلة قبل تعريف `lesson_code` في نموذج 03.**

---

## 3. `resource_type` — القيم المسموحة (نموذج 06)

| القيمة | الاستخدام |
|--------|-----------|
| `video` | رابط YouTube/Vimeo — **لا رفع فيديو داخل التطبيق** |
| `mindmap` | خريطة ذهنية HTML محلية (self-contained) |
| `experiment` | تجربة/محاكاة HTML — PhET embed أو wrapper آمن |
| `pdf` | ملف PDF محلي — المسار في `local_asset_path` |
| `link` | رابط خارجي عام (مرجع، موقع رسمي) |

---

## 4. طريقة إضافة خريطة ذهنية (`mindmap`)

1. أنشئ ملف HTML **self-contained** (بدون مكتبات خارجية ثقيلة إن أمكن).
2. يجب أن يدعم **RTL** والجوال.
3. ضع الملف في مجلد assets (مثال: `assets/phys-g10-u1-l1-mindmap.html`).
4. في Excel:

| العمود | القيمة |
|--------|--------|
| `resource_type` | `mindmap` |
| `resource_format` | `html` |
| `local_asset_path` | `assets/phys-g10-u1-l1-mindmap.html` |
| `resource_url` | اتركه فارغاً إن كان الملف محلياً |
| `is_interactive` | `نعم` |
| `attribution` | المصدر (مثال: Gemini / فريق التصميم) |
| `license_note` | CC BY-SA أو ما ينطبق |

**لا تضع كود HTML كاملاً داخل Excel** — فقط اسم/مسار الملف.

---

## 5. طريقة إضافة تجربة/محاكاة HTML (`experiment`)

1. **PhET (مفضل):** استخدم الرابط الرسمي فقط — لا تنسخ المحاكاة.
   - مثال: `https://phet.colorado.edu/sims/html/density/latest/density_all.html`
2. أنشئ **wrapper HTML** محلياً ي embed الرابط الرسمي في iframe آمن.
3. في Excel:

| العمود | القيمة |
|--------|--------|
| `resource_type` | `experiment` |
| `resource_format` | `html` |
| `resource_url` | رابط PhET الرسمي أو embed |
| `local_asset_path` | `assets/phys-g10-u1-l1-density.html` |
| `is_interactive` | `نعم` |
| `attribution` | `PhET Interactive Simulations` |
| `license_note` | `PhET CC BY` |

---

## 6. طريقة كتابة `local_asset_path`

- مسار **نسبي** من جذر حزمة المحتوى (بدون `\` — استخدم `/`).
- أمثلة:
  - `assets/phys-g10-u1-l1-mindmap.html`
  - `assets/phys-g10-u1-l1-summary.pdf`
  - `assets/phys-g10-u1-l1-density.html`
- **بدون مسافات** في اسم الملف.
- للفيديو والروابط الخارجية: اترك `local_asset_path` فارغاً واستخدم `resource_url`.

---

## 7. أمثلة صفوف جاهزة (نموذج 06)

كل ملف `06_lesson_resources_template.xlsx` يحتوي **5 صفوف مثال**:

| # | النوع | ملخص |
|---|-------|------|
| 1 | `video` | YouTube — `resource_url` + `resource_format=url` |
| 2 | `mindmap` | HTML محلي — `local_asset_path` + `resource_format=html` |
| 3 | `experiment` | PhET + wrapper — `resource_url` + `local_asset_path` |
| 4 | `pdf` | PDF محلي — `local_asset_path` + `resource_format=pdf` |
| 5 | `link` | رابط مرجع — `resource_url` + attribution |

---

## 8. تنبيهات الترخيص والنسب (attribution)

> **⚠️ أي مورد خارجي (فيديو، PhET، PDF من طرف ثالث، رابط حكومي):**
>
> - تحقق من **حقوق النشر والترخيص** قبل الاعتماد.
> - **لا تحذف `attribution`** إلا إذا كان الترخيص يسمح صراحة بذلك.
> - PhET: [https://phet.colorado.edu/](https://phet.colorado.edu/) — CC BY، embed الرسمي فقط.
> - YouTube: تحقق من سياسة القناة — لا تنسب محتوى مقيداً.

---

## 9. أعمدة أسئلة المحررين فقط (09 و 08)

في `09_questions_template.xlsx`:

- `correct_index` — رقم الخيار الصحيح (1–6)
- `explanation` — شرح الإجابة

**هذه الأعمدة للمحررين فقط — لا تظهر للطلاب مباشرة.**

---

## 10. إعادة توليد القوالب

```bash
node scripts/generate-content-templates.mjs
```

قوالب الاستيراد الرسمية للنظام (منفصلة) في `public/import-templates/`:

```bash
npm run generate:import-templates
```

---

## 11. ما لا تفعله

- ❌ لا تستورد Excel إلى النظام من هذا الدليل مباشرة (ما لم يُفعَّل Import رسمياً).
- ❌ لا تضع UUID — استخدم أكواد نصية ثابتة.
- ❌ لا تضع API keys أو signed URLs.
- ❌ لا ترفع فيديو داخل التطبيق — روابط خارجية فقط.

---

**جهة التسليم:** فريق التحرير → مراجعة → استيراد لاحق عبر لوحة الإدارة.
