# SHARED_CURRICULUM_SUBJECT_MAPPING_13C — تقرير الإغلاق

الحالة: **PASS** — المخطط الرسمي الحالي `TCS-2`.

## المشكلة

في `TCS-1` كان المسار (`sanaa` / `aden`) جزءاً من الكود نفسه، فالمادة المشتركة
(الفيزياء مثلاً) كانت تُدخل مرتين بكودين مختلفين، ويتضاعف معها كل ما تحتها من
وحدات ودروس وأسئلة — آلاف السجلات المكررة وصيانة مزدوجة.

## القرار

فصل **الهوية** عن **التوفّر**:

- الهوية = `subject_code` مستقل عن المسار (`sub-g12-001`).
- التوفّر = ارتباطات في `public.subject_curriculum_tracks` تُغذّى من عمود
  `track_codes` في قالب المواد (`sanaa|aden`).
- الوحدات والدروس والأسئلة ترث التوفّر من المادة ولا تحمل عمود مسار.

## ما تم تنفيذه

### قاعدة البيانات

- جدول `subject_curriculum_tracks` (مادة ↔ مسار) مع RLS و GRANTs.
- `can_access_subject` وسياسة قراءة المواد تعتمد الارتباطات الجديدة.
- منع نشر مادة بلا أي ارتباط مسار، وتشديد حماية الحذف.
- `import_execute_template` يدعم مزامنة إضافية (Additive) لمسارات المادة.

التحقق بعد التطبيق على القاعدة المشتركة: الجدول موجود، 3 سياسات RLS،
`import_execute_template` و `can_access_subject` يشيران للجدول الجديد.

### الكود

- `src/lib/content-codes/tcs2.ts`: الصيغ والتحقق والتخصيص، ورفض أكواد TCS-1
  بالخطأ `LEGACY_CODE_SCHEME_NOT_ALLOWED`.
- سجل الأكواد ومولد القالب السياقي وواجهة المشغّل: اختيار متعدد للمسارات.
- عقد الاستيراد والمدقق: `track_codes` بدل `track_code` مع تحقق
  `TRACK_CODES_REQUIRED` / `UNKNOWN_TRACK_CODE` / `DUPLICATE_TRACK_CODE`.
- `scripts/generate-content-templates.mjs`: كل الأمثلة في القوالب التسعة
  أصبحت بصيغة TCS-2 (بدون مقطع المسار)، وأُعيد توليد ملفات xlsx.

### الوثائق

- `OFFICIAL-CONTENT-CODE-REGISTRY.md` أُعيدت كتابته على TCS-2.
- `NAMING-CONVENTION.md` و `DATA-DICTIONARY-AR.md` محدّثان (`track_codes`).

## الاختبارات

| المجموعة | النتيجة |
|---|---|
| `tests/import/shared-curriculum-subject-mapping-13c.test.ts` | 13/13 PASS |
| `tests/import/template-contract-sync-12a.test.ts` | 23/23 PASS |

## قواعد للمشغّل

1. أدخل المادة المشتركة **مرة واحدة** واكتب `sanaa|aden` في `track_codes`.
2. لا تنسخ مادة لإضافة مسار — أعد رفع نفس الكود مع المسار الإضافي.
3. `track_codes` فارغ = المادة غير مرئية لأي طالب.
4. أي كود قديم يحتوي `-aden-` أو `-sanaa-` سيُرفض عند الفحص.
