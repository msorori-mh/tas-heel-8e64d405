# CURSOR-INDEPENDENT-PRE-IMPORT-REVIEW-01

- **الدور:** مراجع مستقل (ليس منفّذ الميزة)
- **المستودع:** `msorori-mh/tas-heel-8e64d405`
- **قاعدة المراجعة:** `origin/main` @ `0338e7fb4e5c4a52dc4a03845b96cb721591265c`
- **الفرع التوثيقي:** `docs/cursor-independent-pre-import-review-01`
- **التاريخ:** 2026-07-31
- **نطاق العمل:** مراجعة فقط — بلا merge / deploy / migration apply / SQL production / data writes / import

---

## 1. النتيجة

**PASS_CURSOR_INDEPENDENT_PRE_IMPORT_REVIEW**

لا يوجد خطأ حرج يوجب HOLD. PR #34 سليم من وجهة نظر مستقلة وجاهز للتوصية بالدمج (بدون تطبيق migration تلقائياً).

---

## 2. PR #34 — Stabilize pre-import access and align import templates

| البند | الحالة |
|---|---|
| الرابط | https://github.com/msorori-mh/tas-heel-8e64d405/pull/34 |
| state / draft | OPEN / not draft |
| mergeable | MERGEABLE |
| Web CI | **pass** — `Typecheck, tests, and build` (run 30601492742) |
| المؤلف / الفرع | `tarasana-mufadhala` / `security/pre-import-units-rls-and-templates-alignment-01` |
| الحجم | 9 ملفات، +390 / −5 |

### الملفات

1. `supabase/migrations/20260731180000_restrict_units_select_to_authenticated.sql`
2. `tests/security/units-select-authenticated-only.static.test.mjs`
3. `src/lib/content-import/content-import-validators.ts`
4. `src/lib/content-import-subject-names.test.ts`
5. `scripts/generate-content-templates.mjs`
6. `docs/content-templates/01_subjects_template.xlsx`
7. `public/content-import-templates/01_subjects_template.xlsx`
8. `docs/content-templates/README.md`
9. `docs/PRE-IMPORT-STABILITY-AND-IMPORT-TEMPLATES-ALIGNMENT-01-REPORT.md`

### تقييم migration

| سؤال التحقق | الجواب |
|---|---|
| 1. هل تقيّد قراءة units عن anon؟ | **نعم** — `DROP POLICY "Units viewable by everyone"` ثم بديل `TO authenticated` فقط |
| 2. هل السياسة الجديدة `TO authenticated` وليست PUBLIC؟ | **نعم** — `FOR SELECT TO authenticated USING (public.can_access_subject(subject_id))` |
| 3. هل `can_access_subject` مناسب ولا يكسر الطالب المصادق؟ | **نعم** — الدالة الحالية (migration hardening) تسمح للطالب بمواد صفه/مساره، و`admin` يتجاوز. نفس بوابة المحتوى المعتمدة |
| 4. هل admin/content_manager لا يتأثران؟ | **نعم** — admin عبر `can_access_subject`؛ الطاقم عبر سياسة `"Content staff manage units" FOR ALL TO authenticated` غير الممسوسة |
| 5. هل لا يوجد DML؟ | **نعم** |
| 6. هل لا يوجد DROP/DELETE/UPDATE/INSERT على بيانات؟ | **نعم** — فقط `DROP POLICY` + `CREATE POLICY` (لا جداول/صفوف) |
| 7. هل لم تُمس questions/correct_index/explanation؟ | **نعم** |
| 8. هل لا يوجد Auth/Storage/Payment؟ | **نعم** |

**ملاحظة تشغيلية:** الملف source-only؛ التطبيق على Supabase يبقى خطوة يدوية للمالك بعد الدمج (Lovable apply).

### تقييم tests

- 6 اختبارات ثابتة جديدة في `units-select-authenticated-only.static.test.mjs`:
  - إسقاط السياسة العامة
  - البديل authenticated + `can_access_subject`
  - حارس ضد إعادة فتح PUBLIC في migrations لاحقة
  - حفظ إدارة الطاقم
  - خلو من DML/تدمير/مالية/auth/storage
  - عدم مساس questions/lessons/exams و`correct_index`/`explanation`
- 6 اختبارات dry-run لتسمية المواد في `content-import-subject-names.test.ts`
- كافية لمنع ارتداد PUBLIC access على مستوى المصدر (static). التحقق الحي بعد apply يبقى على المالك.

### تقييم قوالب الاستيراد

| سؤال | الجواب |
|---|---|
| 9. دعم subject grouping؟ | **نعم** — مثال مجمّع + تعليمات في generator/README؛ الأعمدة (`sort_order`/`color`/`icon`/…) موجودة أصلاً |
| 10. warnings غير مانعة؟ | **نعم** — `NONSTANDARD_SEPARATOR` / `NONSTANDARD_PARENT_SPELLING` / `PARENT_SPELLING_MISMATCH` عبر `pushWarning`؛ `report.ok` يبقى true |

### هل تنصح بالدمج؟

**نعم — ادمج PR #34.**  
شرط ما بعد الدمج (ليس جزءاً من الـ PR): تطبيق migration بموافقة المالك، ثم تنظيف وحدات QA بموافقة منفصلة.

---

## 3. PR #33 — docs: content data readiness audit

| البند | الحالة |
|---|---|
| الرابط | https://github.com/msorori-mh/tas-heel-8e64d405/pull/33 |
| النوع | توثيقي فقط (`docs/CONTENT-DATA-READINESS-AUDIT-01-REPORT.md`) |
| state | OPEN / MERGEABLE / Web CI pass |

### التوصية

| سؤال | التوصية |
|---|---|
| هل تنصح بدمجه؟ | **اختياري — نعم كأرشيف جرد** (ما زال مفيداً: وحدات QA، HOLD المحتوى، استعلامات المالك) |
| هل تنصح بإغلاقه؟ | **بديل مقبول:** إغلاقه كـ superseded بعد دمج #34 إذا رغبت بتقليل ضوضاء الطابور |
| السبب | #34 ينفّذ فجوة units التي وثّقها #33؛ محتوى #33 لا يتعارض ويبقى مرجعاً للتنظيف والـ CONTENT_DATA_INPUT_REQUIRED. **ليس مانعاً قبل #34** |

لم يُعدَّل PR #33 في هذه المراجعة.

---

## 4. PRs المفتوحة الأخرى

| PR | العنوان | الحالة | ضمن الخطة؟ |
|---|---|---|---|
| **#34** | Stabilize pre-import access and align import templates | OPEN, CI pass, MERGEABLE | **نعم — الأولوية الحالية** |
| **#33** | docs: content data readiness audit | OPEN, CI pass, MERGEABLE | توثيقي؛ اختياري بعد/مع #34 |
| **#30** | docs: K3 Swarm release-readiness cycle-01 reports | OPEN, CI pass | توثيقي دورة سابقة؛ مفيد كأرشيف، ليس مانعاً لـ pre-import |
| **#26** | Add admin reporting and notifications foundation | DRAFT | خارج نطاق pre-import؛ لا تدمجه الآن |
| **#22** | docs: K3 Swarm Cycle-01 reports… | DRAFT | توثيقي قديم؛ خارج النطاق |
| **#21** | Document Cycle-02 agent factory outcomes | DRAFT | توثيقي قديم؛ خارج النطاق |

**لا توجد PRs تنفيذ جديدة من Kimi بعد #34** في وقت هذه المراجعة. #33 و#34 و#30 من نفس المؤلف (`tarasana-mufadhala`). لا تعارض ظاهر بين #33 و#34.

---

## 5. مخاطر قبل النوم / قبل الدمج

| المخاطرة | التقييم |
|---|---|
| Conflict على #34 | **لا** — MERGEABLE مقابل main الحالي |
| Migration تحتاج Lovable apply | **نعم** — `20260731180000_restrict_units_select_to_authenticated.sql` لن تُغلق فجوة anon حياً حتى التطبيق |
| Data cleanup يحتاج موافقة | **نعم** — وحدتا QA المتروكة (موثّقتان في #33 وتقرير #34) |
| كسر طالب مصادق بعد apply | **منخفض** — نفس بوابة `can_access_subject`؛ يلزم smoke بعد التطبيق |
| Auth / Storage / Payment / import في #34 | **لا تغيير** |

---

## 6. الخطوات المتبقية حسب الخطة

1. **دمج PR #34** (موصى به)
2. **Lovable apply** للـ migration: `20260731180000_restrict_units_select_to_authenticated.sql`
3. **تنظيف وحدات QA** بموافقة المالك الصريحة (كتابة/حذف بيانات — خارج هذه المراجعة)
4. مراجعة/دمج PRs التوثيقية المناسبة (#33 اختياري، #30 اختياري)
5. تشغيل **dry-run** على ملفات المحتوى (تحذيرات التسمية غير مانعة)
6. **import فعلي** بتفويض صريح فقط
7. **smoke test طالب كامل** بعد apply + استيراد

---

## 7. ممنوعات تم احترامها

- لا Deploy
- لا Publish
- لا SQL production
- لا migration apply
- لا data writes / حذف بيانات QA
- لا import فعلي
- لا تعديل Auth / Storage / دفع / محفظة
- لا force push
- لا merge
- لا تعديل PR #34 أو فروع Kimi
- لا checkout بغرض commit على فروع التنفيذ
- لا تغييرات كود إنتاجي في هذه المراجعة (تقرير docs فقط)

---

## 8. الفحوص المحلية المستقلة (على origin/main)

| الفحص | النتيجة |
|---|---|
| `npm ci` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test` | **19/19** PASS |
| `node tests/pwa/service-worker-policy.static.test.mjs` | **7/7** PASS |
| `npm run build` | PASS |
| security على main: `free-access-content-gates-hardening` | **8/8** PASS |
| security على main: `exam-answers-postgrest-leak-hardening` | **10/10** PASS |
| اختبارات PR #34 غير الموجودة على main | رُاجعت عبر `gh pr diff` فقط — بلا merge/checkout تعديل |

---

## 9. قرار المالك (ملخص تنفيذي)

| القرار | التوصية |
|---|---|
| PR #34 | **ادمج** |
| PR #33 | ادمج كأرشيف **أو** أغلق كـ superseded بعد #34 |
| الخطوة التالية فوراً | دمج #34 → Lovable apply للـ migration → موافقة تنظيف QA |
| هذه المراجعة | توثيق فقط — **لا تُدمج كبديل لـ #34** |
