# QUESTION_IMPORT_QB_BINDING_08 — تقرير الإغلاق

**النتيجة: PASS** — القالب 09 (الأسئلة) صار قابلاً للاستيراد عبر مسار بنك الأسئلة المعتمد فقط.

## المسار المعتمد

```text
ملف 09  →  فحص (validate)  →  تجهيز (staging rows + row_hash)
        →  import_execute_template (يوجّه القالب 09 تلقائياً)
        →  import_execute_questions_template
        →  qb_import_ingest_revision  (داخلي، service_role فقط)
        →  DRAFT revision في بنك الأسئلة
```

## الضمانات المثبتة

| الضمان | كيف تحقق |
| --- | --- |
| لا نشر تلقائي | كل استيراد ينتج `DRAFT` فقط؛ `current_published_revision_id` يبقى فارغاً |
| لا تسريب إجابات | جذر السؤال في `questions` يبقى `correct_index = -1` و `options = []`؛ الخيارات والإجابات في جداول النسخ المحمية بـ RLS |
| Idempotency | إعادة نفس الملف = تخطٍّ كامل بلا نسخة جديدة (بصمة محتوى مستقلة عن الوجهات) |
| الوجهات مستقلة | نفس المحتوى بوجهة جديدة = `TARGET_ADDED` بلا نسخة جديدة |
| حماية المنشور | النسخة المنشورة لا تُمس؛ التعديل يهبط كـ `PUBLISHED_PRESERVED_NEW_REVISION` |
| ذرّية | فشل أي صف = تراجع كامل للقالب بلا كتابة جزئية |
| مقاومة العبث | تعديل صف مُجهَّز بعد التجهيز يُرفض بـ `HASH_MISMATCH` |
| التزامن | قفل استشاري على `question_code` — تنفيذان متوازيان = جذر واحد ونسخة واحدة |
| الصلاحيات | `qb_import_ingest_revision` غير قابلة للاستدعاء من العميل (permission denied) |

## الاختبارات

| الحزمة | النتيجة |
| --- | --- |
| `tests/e2e/content-import/run-question-import-e2e-08.ts` | 18/18 PASS |
| `tests/e2e/content-import/run-content-import-e2e-07.ts` (القوالب 01–08 + 09) | 32/32 PASS |
| `npm run test:import-contract` | 60/60 PASS |

طريقة التشغيل:

```bash
RUN_CONTENT_IMPORT_E2E=1 E2E_STAFF_USER_ID=<staff-uuid> \
  node --import tsx tests/e2e/content-import/run-question-import-e2e-08.ts
```

## ملاحظات تشغيلية

- الأسئلة المستوردة تصل كمسودات وتحتاج مراجعة ثم نشراً يدوياً عبر `publish_question_revision`.
- `qb_e2e_purge_questions('e2e-')` أداة تنظيف اختبارية مقيّدة بـ `service_role` وببادئة `e2e-` فقط.
