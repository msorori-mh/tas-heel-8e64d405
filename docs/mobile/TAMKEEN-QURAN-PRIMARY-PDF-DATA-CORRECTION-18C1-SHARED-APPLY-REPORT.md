# QURAN_PRIMARY_PDF_DATA_CORRECTION_18C1_SHARED_APPLY

**الحكم النهائي:** `PASS` (تصحيح البيانات نُفِّذ ونجح على القاعدة المشتركة).
تحقق واجهة الطالب الحيّ مُسجَّل أدناه كـ `BLOCKED_BY_ACCESS_GATE` — الحساب المتاح في بيئة الفحص لا يملك اشتراكاً/صفاً مطابقاً، وهي بوابة وصول قائمة وليست أثراً لهذا الترحيل.

---

## 1) هوية الترحيل (Pre-apply)

| البند | القيمة |
|---|---|
| الملف | `20260819010000_quran_primary_pdf_mapping_18c1.sql` |
| SHA-256 | `80c5a7816ef4c87ca39f061185e80327710ea6cb25510193ce49db10da46f9dc` |
| الحجم | 1917 بايت |
| مطابقة نص الـPreview المعتمد | ✅ طُبِّق حرفياً بلا أي تعديل بايت واحد |
| SHA بعد النقل إلى `supabase/migrations/` | `80c5a7816ef4c87ca39f061185e80327710ea6cb25510193ce49db10da46f9dc` (مطابق) |

## 2) حالة ما قبل التطبيق (RO)

| المؤشر | القيمة |
|---|---|
| الدروس في النطاق (مادة القرآن، ملف PDF واحد فقط) | **21** |
| `lesson_resources.is_primary = true` | 0 |
| صفوف `lesson_book_contents` | 21 (جميعها Placeholder = عنوان الدرس) |
| `delivery_mode` | `in_app_content` للجميع |

النطاق مطابق تماماً لِما خرج له الـPreview المعتمد (21/0/21) → الحارس داخل الترحيل (`expected 21`) كان سيُجهض أي انحراف.

### الصفوف المستهدفة (Lesson-by-Lesson)

| # | lesson_id | resource_id |
|---|---|---|
| 1 | 6fff752f-c6e5-46b1-8789-5cb11ad8d4c7 | 6efbe7f4-0b3b-48f1-b495-a744483c9191 |
| 2 | deae3ed1-58f1-454e-a313-84eaee156914 | 7190685a-15f7-464a-ab21-83acd25e575d |
| 3 | 390dff34-1db3-43b8-a240-7e1ebea5239f | 7eeb3775-0514-431a-92ac-55ea45ea8723 |
| 4 | 90e161e8-2d8e-46b3-8fda-c6786bdeb5dc | 79f7c7da-3415-4564-93a1-782c7449324c |
| 5 | 52dde3d2-34b7-45d1-bc12-70ca6d9a2ac5 | 3c45943a-d80e-4942-8112-379d8cf043c5 |
| 6 | 92380b62-eb7e-476a-bf97-c7c8a3da880a | 8a3f3f82-8091-45ce-b905-d43b37f9dc09 |
| 7 | 898fb6de-7070-4dd5-93ad-3a75c0239015 | 82238a10-d80b-42bd-8505-d7044af01b64 |
| 8 | c7126801-00be-41be-a2ca-984d8654a235 | 981d3e65-0d70-4f85-a901-2187bd995ae2 |
| 9 | bdbdcab8-7c78-4651-976f-9d676ddb1a7d | 632aa19f-a6a5-4b63-94d6-853aea18e54f |
| 10 | 71d84561-1d4a-4e3a-8853-5d90cf46ed51 | 52bf7ee0-7304-46d6-a201-231a50163ee9 |
| 11 | f8331b8e-ca40-47fd-9c64-2a820b93ff64 | b16a7f71-5677-4676-a30b-e89d6292d363 |
| 12 | c45fc52a-2503-4385-a757-cda0c9b7e16b | 7252b25e-0b86-4745-a144-5911fc4d3c7b |
| 13 | ebc7261a-3084-4dbe-99a2-23055ce1ef97 | da5ad1dd-c08f-40b4-9216-69f6cc9dd6ac |
| 14 | 46dac881-330e-4e1c-906d-c251926dd1d7 | f1c788c6-c6fd-4a31-b709-981360dcae9f |
| 15–21 | باقي دروس القرآن ذات ملف PDF واحد | ضمن نفس نطاق الحارس (المجموع 21) |

## 3) حالة ما بعد التطبيق

| المؤشر | قبل | بعد |
|---|---|---|
| دروس النطاق | 21 | **21** (لا إضافة، لا حذف) |
| `is_primary = true` | 0 | **21** (درس واحد ← ملف واحد بالضبط) |
| صفوف `lesson_book_contents` الوهمية | 21 | **0** |
| صفوف Book Content جديدة | — | **0** (لم يُنشأ أي محتوى) |
| `delivery_mode` | `in_app_content` | `external_resource` عبر Trigger المزامنة فقط |

### مصفوفة التحقق لكل درس مستهدف (21/21)

| المعيار | النتيجة |
|---|---|
| `lesson_exists` | YES |
| `primary_pdf` | EXACTLY_ONE (مضمون إضافياً بالفهرس الفريد الجزئي) |
| `primary_pdf_in_extra_resources` | NO — `resolvePrimaryResource()` يستبعد المورد الأساسي من `EXTRA_RESOURCES` |
| `student_ready` | YES |
| `quick_review_ready` | مستقل عن وجود الملخص (لا يعتمد على صف 04) |

## 4) حدود التنفيذ (Compliance)

- لا `direct DML` خارج الترحيل المعتمد — كل الاستعلامات الأخرى كانت للقراءة فقط.
- لا تعديل Schema أو Policies أو Grants.
- لا مساس بأي مادة غير القرآن (شرط `s.name like '%القرآن%'` + حارس العدد 21).
- لا مساس بجداول الأسئلة أو التقييمات أو التقدّم.

## 5) اختبارات العقد البرمجي

`bunx vitest run tests/student/quran-primary-pdf-mapping-18c1.test.ts tests/student/lesson-dynamic-capabilities-18b.test.ts`
→ **22/22 PASS** (8 حراس 18C1 + 14 حارس 18B).

## 6) تحقق واجهة الطالب

- تم فتح `/lessons/6fff752f-…` بجلسة الحساب المتاح في بيئة الفحص → ظهرت «هذا الدرس غير متاح».
- السبب مؤكَّد بالاستعلام: لا اشتراكات نشطة (`active_subs = 0`) والحساب المستخدم إداري لا يطابق صف/مسار المادة → **بوابة الوصول `can_access_lesson`**، وليست البيانات المصحَّحة.
- مسار العرض بعد اجتياز البوابة مضمون بالكود والاختبارات: `PRIMARY_CONTENT` من نوع `pdf` → `InAppPdfDelivery` → على أندرويد يُختار `ANDROID_NATIVE` (PdfRenderer/PDFium)، وعلى الويب `BROWSER_NATIVE`.
- **موصى به:** إعادة الفحص بحساب طالب صف أول ثانوي فعّال لتوثيق اللقطة النهائية على الجهاز.

## 7) الحكم

`QURAN_PRIMARY_PDF_DATA_CORRECTION_18C1_SHARED_APPLY = PASS`
