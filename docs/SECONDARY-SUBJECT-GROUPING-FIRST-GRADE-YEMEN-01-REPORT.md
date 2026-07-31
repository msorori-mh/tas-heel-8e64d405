# SECONDARY-SUBJECT-GROUPING-FIRST-GRADE-YEMEN-01 — التقرير

- **الفرع:** `feature/subject-grouping-first-grade-yemen-01`
- **آخر main SHA عند البدء:** `a284fd7fcc3702fe63bafda58b283b89b89c408f`
- **التاريخ:** 2026-07-31

## القرار النهائي

**PASS_SUBJECT_GROUPING_PR_READY**

## حالة PRs قبل البدء

| PR | الحالة |
|---|---|
| #27 (أعمدة نتيجة التدريب/السجل) | **MERGED** 2026-07-31 |
| #28 (strict expired auto-submit) | **MERGED** 2026-07-31 |
| #29 (PWA /exams denylist) | **MERGED** 2026-07-31 |
| #31 (حماية إجابات الاختبارات) | **MERGED** + migration مطبقة (PASS) |

لم يلزم تعديل أيٍّ منها (لا تعارض — التغيير في `app.tsx` ومكونات/مكتبات جديدة).

## أين كانت صفحة عرض المواد؟

لوحة الطالب `src/routes/_authenticated/app.tsx` — قسم «مواد الفصل» (grid بطاقات). مسارا `/grades` و`/grades/$gradeId/subjects` يتمان وخارج نطاق الطالب الفعلي (لم يتغيرا).

## الملفات

| الملف | التغيير |
|---|---|
| `src/lib/subjects/subject-grouping.ts` | **جديد** — دوال `normalizeSubjectNameSeparators` / `getSubjectMainCategory` / `getSubjectSubCategory` / `groupSubjectsByMainCategory` |
| `src/lib/subject-grouping.test.ts` | **جديد** — 11 اختباراً (يُلتقط تلقائياً بـ `npm test`) |
| `src/components/home/SubjectGroupsGrid.tsx` | **جديد** — بطاقات المواد الكبرى + شاشة الأقسام الفرعية (drill-down داخل الصفحة، بلا route جديد) |
| `src/routes/_authenticated/app.tsx` | استبدال grid المواد القديم بالمكوّن الجديد (إزالة استيرادات لم تعد مستخدمة) |
| `docs/SUBJECT-GROUPING-GRADE-10-YEMEN-CONTENT-GUIDE.md` | **جديد** — دليل قيم الإدخال المعتمدة + تحذير الهجاء |
| `src/routeTree.gen.ts` | لم يتغير (مستعاد من origin/main — لا route جديد) |

## إجابات أسئلة المرحلة

- **هل أُنشئت subject grouping utility؟** نعم — `src/lib/subjects/subject-grouping.ts` بالدوال الأربع المطلوبة، تعالج المسافات الزائدة والشرطات غير الموحدة (- – — − ‐ ―)، ولا تكسر المواد العادية.
- **هل المواد الكبرى تظهر بدون تكرار؟** نعم — بطاقة واحدة لكل main category (اختبار: «Arabic subjects group by main category without duplicates»).
- **هل الأقسام الفرعية تظهر مرتبة؟** نعم — حسب `sort_order`، والمجموعات بأقل `sort_order` داخلها، واللون/الأيقونة من صاحب أقل ترتيب.
- **هل الانتقال يستخدم subject.id الأصلي؟** نعم — كل قسم يربط إلى `/subjects/$subjectId` بمعرّفه الخاص (اختبار مخصص).
- **هل وُثّقت قيم إدخال المحتوى؟** نعم — الدليل يتضمن المواد الثماني المعتمدة بقيم sort_order/color/icon + التحذير الإلزامي «المعتمد دائماً: التربية الإسلامية - اسم القسم».
- **هل احتجت migration؟** **لا.** التجميع عرضي بالكامل من اسم المادة.
- **SQL/Deploy/Auth/Storage؟** لا شيء منها.
- **تعديل دفع/محفظة/اشتراكات؟** لا. ولا تظهر أي عناصر دفع في الواجهة المعدلة.
- **service_role/supabaseAdmin في client؟** لا.

## نتائج الفحوصات

| الفحص | GATE-0 (قبل التعديل) | نهائي (بعد التعديل) |
|---|---|---|
| `npm ci` | PASS | PASS |
| `npx tsc --noEmit` | PASS | PASS |
| `npm test` | 8/8 PASS | 19/19 PASS (8 قديمة + 11 جديدة) |
| `node tests/pwa/service-worker-policy.static.test.mjs` | 7/7 PASS | 7/7 PASS |
| `npm run build` | PASS | PASS |
| Web CI | — | **pass** (run 30599601529) |

## رابط PR

https://github.com/msorori-mh/tas-heel-8e64d405/pull/32 — **مفتوح، غير مُدمج.**
