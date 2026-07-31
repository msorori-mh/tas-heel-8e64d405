# CONTENT-DATA-READINESS-AUDIT-01 — تقرير جرد جاهزية المحتوى

- **آخر main SHA:** `0338e7fb4e5c4a52dc4a03845b96cb721591265c`
- **الفرع:** `docs/content-data-readiness-audit-01`
- **التاريخ:** 2026-07-31
- **المنهج:** جرد read-only فقط — استعلامات PostgREST بمفتاح anon (نفس اعتماد المتصفح العام) + تحليل ثابت للكود والـ migrations وقوالب الاستيراد. لا كتابة، لا import، لا SQL.

## القرار النهائي

**HOLD_CONTENT_DATA_NOT_READY**

ليس حكماً بأن المحتوى ناقص، بل لأن **القياس الكامل غير ممكن بالأدوات المتاحة**: RLS يحجب جداول المحتوى عن anon (وهذا صحيح أمنياً)، ولا تتوفر حسابات اختبار. ما أمكن قياسه يكشف علامتين تستوجبان التوقف: وحدات QA متروكة في البيانات، وعدم إمكانية إثبات اكتمال أي سلسلة «مادة → وحدة → درس → موارد → أسئلة → نموذج اختبار».

## ما قيس فعلياً (anon، قراءة فقط — مؤكد على القاعدة الحية)

| الجدول | النتيجة لـ anon | المقروء فعلياً |
|---|---|---|
| `grades` | 200 — **3 صفوف** | الصف الأول الثانوي (grade-10)، الثاني (grade-11)، الثالث (grade-12) |
| `units` | 200 — **6 صفوف** | الأعداد الحقيقية، الميكانيكا، الجهاز العصبي، الحفظ والتفسير + **وحدتا QA** (انظر أدناه) |
| `subjects` | 200 — **فارغ** | RLS يحجب (مطلوب authenticated) |
| `curriculum_tracks` | 200 — فارغ | محجوب |
| `governorates` | 200 — فارغ | محجوب |
| `lessons` | **401/42501** | مرفوع امتيازياً |
| `questions` | **401/42501** | مرفوع امتيازياً (+ الأعمدة الحساسة محمية عمودياً منذ PR #31) |
| `lesson_resources`, `exam_templates`, `exam_template_questions`, `lesson_book_contents`, `lesson_summaries`, `lesson_simulations` | 200 — فارغ | RLS يحجب الصفوف عن anon |
| `unit_practice_attempts`, `exam_sessions`, `subscription_plans`, `payment_methods` | 200 — فارغ | RLS يحجب |

### ملاحظة أمنية/جودة جانبية (خارج نطاق الإصلاح — NEEDS_OWNER_APPROVAL لأي SQL)

سياسة `"Units viewable by everyone" ON public.units FOR SELECT USING (true)` (migration `20260606004917`) بلا `TO authenticated` — أي تشمل anon. لذلك عناوين الوحدات مقروءة لأي زائر بينما `subjects` محجوبة — عدم اتساق. الانكشاف منخفض الخطورة (عناوين فقط)، لكن يُنصح بتقييدها `TO authenticated` في migration مستقبلية بموافقة المالك.

## بنية المحتوى (تحليل ثابت من الكود)

- **النموذج:** grades → subjects (`grade_id`, `curriculum_track_id`, `semester`, `color`, `icon`, `sort_order`) → units (`subject_id`, `semester`) → lessons (`unit_id`, `subject_id`, `semester`) → موارد الدرس (فيديو/mindmap/تجربة/PDF/روابط + PhET) → questions (درس أو مادة) → exam_templates + exam_template_questions.
- **قوالب الاستيراد:** 9 قوالب xlsx جاهزة في `public/content-import-templates/` و`docs/content-templates/` (مواد، وحدات، دروس، محتوى الكتاب، الشروحات، الموارد، التقييمات، أسئلة التقييمات، الأسئلة).
- **dry-run:** موجود (`content-import-dry-run.server.ts`) — يسمح بفحص ملفات الاستيراد قبل أي كتابة. **لم يُشغَّل** (لا تفويض ولا ملفات بيانات).
- **عرض الطالب:** يفلتر المواد بالصف + المنهج + الفصل (`app.tsx`)، والتجميع الجديد (PR #32) يعتمد على صيغة «المادة الكبرى - القسم» من `docs/SUBJECT-GROUPING-GRADE-10-YEMEN-CONTENT-GUIDE.md`.

## تحقق تقسيم المواد

- الصيغة المعتمدة والقيم الثماني موثقة في دليل المحتوى (الإسلامية ×3، العربية ×3، الاجتماعيات ×2، sort_order 1–8).
- **لا يمكن التحقق من التزام البيانات الفعلية** — `subjects` محجوبة عن anon. الوحدات المرئية تشير إلى مواد موجودة (رياضيات/فيزياء/أحياء/إسلامية على الأرجح) لكن أسماء المواد نفسها غير قابلة للقراءة.
- وحدتا `QA_C01_C02_*` تشيران إلى subject QA (`b40d2dd5…`) — محتوى اختبار آلي متبقٍ.

## مشاكل البيانات المرصودة

| # | المشكلة | الشدة | الإجراء |
|---|---|---|---|
| 1 | وحدتا QA في الإنتاج: «QA_C01_C02_FREE_UNIT — اختبار QA لا تستخدم» و«QA_C01_C02_PAID_UNIT — اختبار QA لا تستخدم» (+ مادتهما وما يتبعها على الأرجح) | **عالية للإطلاق** — ستظهر للطلاب إن كانت مادتها ضمن صف/منهج حقيقي | تنظيف بيانات = كتابة ⇒ **NEEDS_OWNER_APPROVAL** (حذف/تعطيل عبر المالك) |
| 2 | سياسة units مفتوحة لـ anon | منخفضة | migration مستقبلية بموافقة المالك |
| 3 | اكتمال السلاسل غير قابل للإثبات (مواد بلا وحدات؟ وحدات بلا دروس؟ دروس بلا موارد؟ أسئلة غير مربوطة؟ نموذج اختبار نشط؟) | مانعة للقرار | جرد authenticated (انظر أدناه) |

## CONTENT_DATA_INPUT_REQUIRED

لإكمال الجرد، واحد من اثنين:

1. **حساب اختبار موجود مسبقاً** بدور `admin` أو `content_manager` (لا ننشئ حسابات) — يتيح تنفيذ العدّ والتحقق read-only كاملاً؛ أو
2. **تشغيل المالك** للاستعلامات التالية (read-only) وتسليم النتائج:

```sql
-- عدّ رئيسي
SELECT (SELECT count(*) FROM grades) grades,
       (SELECT count(*) FROM curriculum_tracks) tracks,
       (SELECT count(*) FROM subjects) subjects,
       (SELECT count(*) FROM units) units,
       (SELECT count(*) FROM lessons) lessons,
       (SELECT count(*) FROM questions) questions,
       (SELECT count(*) FROM exam_templates) templates_all,
       (SELECT count(*) FROM exam_templates WHERE is_active) templates_active;

-- سلاسل ناقصة
SELECT s.id, s.name FROM subjects s WHERE NOT EXISTS (SELECT 1 FROM units u WHERE u.subject_id = s.id);            -- مواد بلا وحدات
SELECT u.id, u.title FROM units u WHERE NOT EXISTS (SELECT 1 FROM lessons l WHERE l.unit_id = u.id);               -- وحدات بلا دروس
SELECT l.id, l.title FROM lessons l WHERE NOT EXISTS (SELECT 1 FROM lesson_resources r WHERE r.lesson_id = l.id);  -- دروس بلا موارد
SELECT q.id FROM questions q WHERE q.lesson_id IS NULL AND q.subject_id IS NULL;                                    -- أسئلة غير مربوطة
SELECT t.id, t.title FROM exam_templates t WHERE NOT EXISTS (SELECT 1 FROM exam_template_questions etq WHERE etq.template_id = t.id); -- نماذج بلا أسئلة

-- التزام تقسيم المواد (الصف الأول)
SELECT name, sort_order, color, icon FROM subjects WHERE grade_id = '<grade-10-id>' ORDER BY sort_order;

-- بقايا QA
SELECT 'subject' kind, id::text, name label FROM subjects WHERE name ILIKE '%QA_%'
UNION ALL SELECT 'unit', id::text, title FROM units WHERE title ILIKE '%QA_%'
UNION ALL SELECT 'lesson', id::text, title FROM lessons WHERE title ILIKE '%QA_%';
```

## أقل بيانات مطلوبة للإطلاق المحدود

- صف واحد مستهدف (grade-10) بمنهج واحد.
- التزام أسماء المواد الثماني بصيغة التقسيم (أو اكتمال مادة واحدة على الأقل).
- مادة واحدة مكتملة السلسلة: وحدات ← دروس ← موارد/روابط ← أسئلة تدريب.
- نموذج اختبار تدريبي واحد + نموذج صارم واحد، نشطان ومربوطان بأسئلة صحيحة.
- صفر محتوى QA ظاهر للطلاب.

## الفحوصات (baseline على main @ 0338e7f)

| الفحص | النتيجة |
|---|---|
| `npm ci` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test` | 19/19 PASS |
| `node tests/pwa/service-worker-policy.static.test.mjs` | 7/7 PASS |
| `npm run build` | PASS |

## التوصية

1. المالك ينظف محتوى QA (NEEDS_OWNER_APPROVAL — كتابة بيانات).
2. المالك يشغّل استعلامات الجرد أعلاه أو يوفّر حساب `content_manager`/`admin` تجريبياً موجوداً.
3. بعد الجرد: إن اكتملت سلسلة مادة واحدة على الأقل ونموذجا اختبار ⇒ إعادة التقييم إلى PASS_CONTENT_READY_LIMITED_RELEASE؛ وإلا تعبئة عبر قوالب الاستيراد (dry-run أولاً).
4. مرشّح لاحق: تقييد سياسة units على authenticated (migration بموافقة المالك).
