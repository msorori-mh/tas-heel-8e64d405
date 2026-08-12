# IMPORT_MIGRATION_BLOCKER_CORRECTION_04A — إغلاق H-1 وH-2

الحالة: **لم يُطبَّق أي Migration على قاعدة البيانات المُدارة. لا Execute. لا Publish.**
النطاق: إغلاق المانعين المُعلنين في المراجعة 04 فقط، بلا أي توسعة.

## 1. H-1 — هوية المورد

**الحقيقة المُتحقَّق منها في قاعدة البيانات المُدارة:** جدول `lesson_resources` لا يحتوي `resource_code` ولا `code`. أي أن ترحيلَي `content_html`
(`20260808060000`, `20260809010000`) غير مطبَّقين.

**القرار المُثبَّت:** الهوية الفيزيائية الوحيدة للمورد هي `lesson_resources.resource_code`. عمود `code` على هذا الجدول ممنوع نهائياً.

المعالجة:

1. **العقد** (`src/lib/import/import-contract.ts`): صُحِّحت الوجهة الفيزيائية من `code` إلى العمود الحقيقي لكل كيان طفل:
   - `resources` → `lesson_resources.resource_code` + `idx_lesson_resources_code_per_lesson`
   - `explanations` → `lesson_explanations.explanation_code` + `lesson_explanations_code_lesson_uniq`
   - `assessments` → `lesson_assessments.assessment_code` + `lesson_assessments_code_uniq`
   نصوص GAP-01 وGAP-02 حُدِّثت لتطابق الأعمدة الحقيقية، ولم يعد أي نص يذكر عمود `code`.
2. **الترحيل مكتفٍ ذاتياً** (`supabase/migrations-pending/20260813010000_...sql`): أُضيف تمهيد Idempotent يُعلن
   `resource_code`، المطبِّع `normalize_resource_code`، الـ trigger، والفهرس الفريد الجزئي — بنفس دلالات ترحيل
   `20260809010000` حرفياً. لذلك يتقارب الطرفان أياً كان ترتيب التطبيق، ولا يبقى ترتيب إلزامي بين المرحلة 03 وسلسلة `content_html`.
3. **بوّابة fail-closed**: إن وُجد `lesson_resources.code` يتوقف الترحيل بخطأ `SCHEMA_DRIFT` قبل إنشاء أي كائن. لا إعادة تسمية
   تلقائية ولا دمج صامت ولا اختيار ضمني لهوية.
4. `normalize_resource_code` مُقيَّدة الصلاحيات: `REVOKE` من `PUBLIC`/`anon`، و`GRANT EXECUTE` لـ `authenticated`/`service_role` فقط.

## 2. H-2 — انسحاب المانع (NOT_A_DEFECT)

القيد `lessons_subject_id_slug_key UNIQUE (subject_id, slug)` **موجود فعلاً** في قاعدة البيانات المُدارة. المانع في المراجعة 04
كان ناتجاً عن انحراف في fixture البروفة، لا عن نقص في المخطط. صُحِّح `tests/import/fixtures/pg17-baseline-schema.sql`
ليطابق الواقع، وأُضيف فحص A6 يمنع تكرار الانحراف.

## 3. نتيجة البروفة (Postgres 17 معزول، بلا أي اتصال بعيد)

`tests/import/run-pg17-import-staging-03-apply-rehearsal.mjs` — **32/32 PASS**

| المجموعة | المضمون | النتيجة |
|---|---|---|
| A1–A6 | التطبيق على الشكل الحالي وحده، تنفيذ فعلي لمسار الموارد، هوية أحادية العمود، قيد الدرس | PASS |
| B1–B6 | السلسلة الكاملة، إعادة التطبيق، RLS/GRANT/search_path، 12 فحص سلوك تشغيلي | PASS |
| C1–C7 | إعادة بناء كاملة بعد هدم المخطط | PASS |
| D1–D9 | استقلال الترتيب: 03 ← content_html و content_html ← 03، مع تطابق تعريف المطبِّع | PASS |
| E1–E4 | رفض الترحيل عند وجود `code` دخيل، وبلا كائنات جزئية | PASS |

اختبارات العقد: `bun run test:import-contract` — **60/60 PASS**.

## 4. الحكم

```
H-1 (resource identity)   CLOSED — resource_code هو الهوية، الترحيل مكتفٍ ذاتياً، و`code` مرفوض fail-closed
H-2 (lessons uniqueness)  WITHDRAWN — NOT_A_DEFECT، القيد موجود؛ الخلل كان في fixture البروفة
order dependency          NONE — تحقق ثنائي الاتجاه
applied to managed DB     NO
execute / publish         NOT PERFORMED
= 04A_PASS
```
