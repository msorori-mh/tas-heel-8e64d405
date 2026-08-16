# TAMKEEN_OFFICIAL_TEXTBOOK_STRUCTURED_CONTENT_STANDARD_20A

**الحالة:** المعيار + المحرك + العرض منفَّذة داخل المستودع. النشر الفعلي للمحتوى الرسمي = `SOURCE_REQUIRED`.

---

## 1. المبدأ الحاكم

الكتاب الوزاري الرسمي هو **المحتوى الأساسي** داخل تمكين، بالنص الكامل والترتيب والمعنى نفسه.
الـ PDF يتحول من "المحتوى" إلى "نسخة مرجعية".

**قاعدة لا تُخترق:** الطبقة الرسمية (A) لا تُختصر، لا تُعاد صياغتها، ولا تُولَّد بالذكاء الاصطناعي.
أي إضافة من تمكين تعيش في طبقة أخرى بعلامة بصرية مختلفة.

## 2. طبقات المحتوى

| الطبقة | المصدر | العلامة في الواجهة |
|---|---|---|
| A — محتوى الكتاب | الكتاب الوزاري حرفياً | شارة "محتوى الكتاب" + المصدر والصفحات |
| B — شرح تمكين | فريق تمكين | قسم "الشرح" منفصل |
| C — إثراء | تمكين | قسم منفصل |
| D — تفاعلي (خرائط/تجارب) | حزم HTML معتمدة | مشغّل معزول |
| E — تقويم | بنك الأسئلة | قسم التمارين |
| F — مراجعة سريعة | تمكين | المراجعة |
| G — نسخة الكتاب الأصلية | PDF | مرجع للتحقق |

## 3. حالات الانتقال (دور الـ PDF)

`PDF_ONLY_TEMPORARY` → `STRUCTURED_PRIMARY_WITH_PDF_REFERENCE` → `STRUCTURED_PRIMARY_NO_PDF`، و`MISSING_PRIMARY_CONTENT` عند غياب الاثنين.
الـ PDF يبقى أساسياً حتى **اعتماد** المحتوى المنظم — لا يوجد تحويل تلقائي.

## 4. أنواع الكتل المعيارية

HEADING, SUBHEADING, PARAGRAPH, QURAN_VERSE, HADITH, DEFINITION, RULE, LIST, TABLE, IMAGE,
DIAGRAM, FORMULA, EXAMPLE, NOTE, WARNING, EXERCISE, FIGURE_CAPTION, SOURCE_PAGE_MARKER.

كل كتلة تُخزَّن بعنصر HTML دلالي مع `data-block-type` و`data-block-id` و`data-source-page`.

## 5. عقد التخزين (بدون تغيير Schema)

يُخزَّن المحتوى الرسمي في العمود القائم `lesson_book_contents.content` كعنصر جذر واحد:

```html
<section data-layer="A_OFFICIAL_TEXTBOOK" data-official-standard="20A"
         data-source-book="..." data-source-edition="..."
         data-source-page-from="7" data-source-page-to="9"
         data-source-file-hash="..." data-official-content-hash="..."
         data-extracted-at="..." data-reviewed-by="..." data-reviewed-at="..." dir="rtl">
```

الأصل (Provenance) محمول داخل الجذر، فلا حاجة لجدول جديد لتشغيل المعيار.
مقترح تعزيز اختياري (غير مطبَّق) في `supabase/migrations-pending/20260821010000_official_textbook_content_20a_proposal.sql`.

## 6. الأمان (Fail-closed)

- قائمة عناصر مسموحة مغلقة؛ مرفوض نهائياً: `script, style, iframe, object, embed, form, a, svg, video, audio, link, meta, base`.
- معالجات `on*` مرفوضة (خطأ)، و`style` المضمّن يُحذف (تحذير).
- الصور: `data:` وروابط خارجية مرفوضة — فقط التخزين المُدار (`supabase-storage://`).
- العرض عبر إعادة بناء شجرة React، **بدون `dangerouslySetInnerHTML` إطلاقاً**.
- أي فشل تحقق ⇒ لا يُعرض المحتوى للطالب، وتظهر رسالة واضحة.

## 7. محرك المطابقة (Fidelity)

`evaluateOfficialFidelity(sourceText, structuredHtml)` يُرجع `PASS | REVIEW_REQUIRED | FAIL` مع:
تغطية الرموز (افتراضي ≥ 0.98)، نسبة الإضافات (≤ 0.02)، الكلمات الناقصة/المضافة.
التطبيع عربي-الوعي (تشكيل/همزات/تطويل) **للمقارنة فقط** — النص المخزّن يحتفظ بالتشكيل الأصلي (حرج للقرآن والحديث).
`computeOfficialContentHash` يعطي بصمة ثابتة للنص القرائي مستقلة عن المسافات والتنسيق.

## 8. الملفات المنفَّذة

- `src/lib/content/official-textbook/standard.ts` — الطبقات، الكتل، القوائم البيضاء، حالات الانتقال.
- `src/lib/content/official-textbook/parser.ts` — محلل/مدقق بنيوي (htmlparser2) ينتج شجرة آمنة + Provenance.
- `src/lib/content/official-textbook/fidelity.ts` — التطبيع العربي، البصمة القانونية، تقرير المطابقة.
- `src/components/lessons/OfficialTextbookContent.tsx` — عارض الطبقة A (RTL، Mobile-first، متوافق مع القديم).
- `src/routes/_authenticated/lessons.$lessonId.tsx` — ربط `PRIMARY_CONTENT` بالعارض الجديد.
- `tests/content/official-textbook-standard-20a.test.mjs` — 13 اختباراً (أمان + انتقال + مطابقة) ✅.

## 9. التوافق مع المحتوى القديم

النصوص المخزَّنة كنص عادي تُعرض كما كانت تماماً (`whitespace-pre-wrap`). لا هجرة إجبارية ولا كسر لأي درس قائم.

## 10. ما يمنع النشر الآن — SOURCE_REQUIRED

لا يوجد داخل المستودع نص الكتاب الوزاري الرسمي قابلاً للاستخراج (المصدر الحالي ملفات PDF مصوّرة في التخزين).
لا يجوز توليد النص الرسمي أو تقريبه. الخطوة التالية تتطلب أحد الآتي لكل درس تجريبي:

1. نص الكتاب مستخرَجاً ومدقَّقاً بشرياً (مصدر + رقم الصفحة)، أو
2. إذن صريح بتشغيل استخراج OCR على PDF الكتاب مع مراجعة بشرية إلزامية قبل الاعتماد.

عند توفر المصدر: تشغيل المحرك → `PASS` → اعتماد → تتحول الحالة تلقائياً إلى `STRUCTURED_PRIMARY_WITH_PDF_REFERENCE`.

**الحكم:** `PASS_READY_FOR_PILOT — SOURCE_REQUIRED`.
