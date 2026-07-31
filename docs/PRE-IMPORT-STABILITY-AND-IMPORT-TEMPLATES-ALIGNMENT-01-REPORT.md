# PRE-IMPORT-STABILITY-AND-IMPORT-TEMPLATES-ALIGNMENT-01 — التقرير

- **آخر main SHA:** `0338e7fb4e5c4a52dc4a03845b96cb721591265c`
- **الفرع:** `security/pre-import-units-rls-and-templates-alignment-01`
- **حالة PR #33 (توثيقي):** OPEN — لم يُدمج ولم يُعدَّل.
- **التاريخ:** 2026-07-31

## القرار النهائي

**PASS_PRE_IMPORT_STABILITY_AND_TEMPLATES_PR_READY**

## GATE-0 (قبل أي تعديل)

npm ci PASS • tsc PASS • npm test 19/19 • PWA 7/7 • build PASS.

## الجزء الأول — RLS لجدول units

### هل كانت units مكشوفة لـ anon؟

**نعم — مؤكد حياً.** السياسة `"Units viewable by everyone" ON public.units FOR SELECT USING (true)` (migration `20260606004917`) بلا `TO` ⇒ تنطبق على PUBLIC بما فيه anon، وقد قرأ anon فعلياً 6 وحدات من القاعدة الحية أثناء جرد CONTENT-DATA-READINESS-AUDIT-01. الطالب المصادق يقرأ الوحدات عبر `app.tsx` وصفحة المادة، والطاقم يديرها عبر `"Content staff manage units" FOR ALL TO authenticated` — كلاهما لا يحتاج سياسة PUBLIC.

### migration المقترحة

`supabase/migrations/20260731180000_restrict_units_select_to_authenticated.sql`:

1. `DROP POLICY IF EXISTS "Units viewable by everyone"` — إغلاق القراءة العامة.
2. `CREATE POLICY "Units viewable per subject access" FOR SELECT TO authenticated USING (can_access_subject(subject_id))` — نفس نمط بوابات المحتوى المعتمد: الطالب يرى وحدات مواده (صفه/منهجه)، admin يتجاوز، والطاقم محفوظ بسياسة الإدارة FOR ALL غير الممسوسة.

**source-only فقط — لم تُطبَّق على Supabase.** لا DML، لا حذف بيانات، لا تغيير schema، لا مساس بـ questions/lessons/exams/مالية/storage/auth.

### اختبارات الأمن الجديدة (6)

`tests/security/units-select-authenticated-only.static.test.mjs`: حذف السياسة العامة، البديل authenticated-only ومقيد بالوصول، حارس ضد إعادة فتح PUBLIC لاحقاً، حفظ إدارة الطاقم، خلو من DML/تدمير/مالية، وعدم مساس الأسئلة أو أعمدة الإجابات.

## الجزء الثاني — قوالب الاستيراد وتقسيم المواد

### Audit

- قالب subjects (`01_subjects_template.xlsx` + `DRY_RUN_CONFIG.subjects`) يدعم أصلاً: `subject_code, name, grade_slug, track_code, semester, icon, color, sort_order, editor_notes, review_status` — **لا نقص schema**، لم يلزم أي migration للقوالب.
- dry-run (`validateContentImportSheet`) كان بلا أي فحص لتسمية المواد المقسّمة.

### ما عُدّل

| الملف | التغيير |
|---|---|
| `src/lib/content-import/content-import-validators.ts` | تحذيرات تسمية المواد (warnings غير مانعة): `NONSTANDARD_SEPARATOR` (شرطات – — − ‐ ― مع اقتراح " - ")، `NONSTANDARD_PARENT_SPELLING` («الإسلامية - ...» ⇒ المعتمد «التربية الإسلامية - ...»)، `PARENT_SPELLING_MISMATCH` (هجاءان لنفس العائلة). تستخدم دوال `subject-grouping` نفسها — مصدر حقيقة واحد |
| `src/lib/content-import-subject-names.test.ts` | 6 اختبارات dry-run (انظر أدناه) |
| `scripts/generate-content-templates.mjs` | قالب 01: مثال مجمّع «التربية الإسلامية - السيرة النبوية» + تعليمات التقسيم في ورقة التعليمات |
| `docs/content-templates/01_subjects_template.xlsx` + `public/content-import-templates/01_subjects_template.xlsx` | أعيد توليدهما من الـ generator (بقية القوالب 02–09 استُعيدت دون تغيير — اختلافها كان طوابع زمنية فقط) |
| `docs/content-templates/README.md` | قسم «2أ. تسمية المواد المقسّمة» بالقواعد والتحذيرات |

### اختبارات dry-run الجديدة (6)

يقبل «التربية الإسلامية - السيرة النبوية» (pass بلا تحذيرات) • يحذّر من «الإسلامية - السيرة النبوية» (warn لا يمنع) • يحذّر من الشرطات الخمس غير الموحدة • يحذّر من هجاءين لنفس العائلة • لا يكسر مادة عادية بلا فاصل • قالب subjects يقبل sort_order/color/icon.

### تعليمات ليوسف عند التعبئة

1. اسم المادة المقسّمة: `اسم المادة الكبرى - اسم القسم الفرعي` والفاصل مسافة+شرطة+مسافة حرفياً.
2. المعتمد دائماً «التربية الإسلامية - ...» وليس «الإسلامية - ...».
3. وحّد هجاء المادة الكبرى عبر أقسامها — الاختلاف = مواد منفصلة للطالب.
4. القيم الثماني المعتمدة (sort_order 1–8، الألوان، BookOpen) في `docs/SUBJECT-GROUPING-GRADE-10-YEMEN-CONTENT-GUIDE.md`.
5. شغّل dry-run أولاً — تحذيرات التسمية تظهر كـ warnings وتُصحَّح قبل أي استيراد فعلي.

## هل يمكن البدء بإدخال المحتوى بعد تطبيق migration ودمج PR؟

**نعم** — بعد: (1) دمج هذا الـ PR، (2) تطبيق migration وحدات بموافقة المالك، (3) تنظيف وحدات QA، (4) dry-run ناجح لملفات يوسف. لا مانع تقني آخر في نطاق هذه المرحلة.

## يحتاج موافقة المالك لاحقاً

1. تطبيق `20260731180000_restrict_units_select_to_authenticated.sql` على Supabase.
2. تنظيف وحدات QA المتروكة (كتابة/حذف بيانات).
3. بدء dry-run/import الفعلي للمحتوى.

## الفحوصات النهائية

| الفحص | النتيجة |
|---|---|
| `npm ci` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test` | 25/25 PASS (19 + 6 جديدة) |
| `node tests/pwa/service-worker-policy.static.test.mjs` | 7/7 PASS |
| security static (شاملة الجديدة) | 24/24 PASS |
| `npm run build` | PASS |
| Web CI | **pass** (run 30601386482 — PR #34) |

## الامتثال

لا Deploy • لا Publish • لا تطبيق migration • لا SQL production • لا تعديل/حذف بيانات (وحدات QA لم تُمس) • لا import فعلي • لا Auth/Storage/دفع • لا service_role في client • لا schema change (الـ migration policies فقط ومصدرية) • لا merge.
