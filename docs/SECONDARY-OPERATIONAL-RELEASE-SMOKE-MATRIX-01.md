# SECONDARY-OPERATIONAL-RELEASE-SMOKE-MATRIX-01 — مصفوفة الفحص

المرجع: main @ `10cb220`. التاريخ: 2026-07-31.
الوسم: **S** = فحص ثابت/كود (منفذ)، **L** = فحص حي (يتطلب حسابات اختبار — لم ينفذ).

## WAVE-1 — Student Core

| الاختبار | النوع | النتيجة | ملاحظة |
|---|---|---|---|
| تسجيل الدخول | S/L | S: PASS / L: مؤجل | auth.tsx + auth.callback.tsx |
| إكمال الملف الشخصي | S/L | S: PASS / L: مؤجل | يشمل curriculum_track |
| لوحة الطالب تفتح | S/L | S: PASS / L: مؤجل | app.tsx |
| الطالب يرى المواد | S/L | S: PASS / L: مؤجل | بعد اختيار الفصل الدراسي |
| فتح مادة | S/L | S: PASS / L: مؤجل | subjects.$subjectId |
| فتح وحدة | S/L | S: PASS / L: مؤجل | ضمن صفحة المادة |
| فتح درس | S/L | S: PASS / L: مؤجل | lessons.$lessonId |
| فتح موارد الدرس | S/L | S: PASS / L: مؤجل | 5 أنواع + PhET + ملفات موقّعة |
| بدء تدريب | S/L | S: PASS / L: مؤجل | practice + training template |
| بدء اختبار | S/L | S: PASS / L: مؤجل | strict بمؤقت خادم |
| عرض النتيجة | S | **FAIL→مُصلح PR #27** | تدريب/سجل؛ الصارم كان صحيحاً |
| لا subscription_required | S | PASS | STUDENT_FREE_ACCESS يقصّر البوابات |
| لا محفظة/دفع كشرط | S | PASS | صفحات الدفع inert |

## WAVE-2 — Authorization & Privacy

| الاختبار | النوع | النتيجة | ملاحظة |
|---|---|---|---|
| anon لا يصل للمحتوى | S/L | S: PASS / L: مؤجل | بوابة route + REVOKE anon |
| طالب صحيح يصل | S/L | S: PASS / L: مؤجل | can_access_subject |
| طالب صف خاطئ محجوب | S/L | S: PASS / L: مؤجل | grade match في DB |
| طالب منهج خاطئ محجوب | S/L | S: PASS / L: مؤجل | track match في DB |
| content_manager خارج مسارات الطالب | S | PARTIAL (LOW) | حماية بياناتية فقط |
| content_manager خارج الدفع/المحفظة/التقارير | S | PASS | allowlist + RLS + RPC reject |
| admin يدخل لوحة الإدارة | S/L | S: PASS / L: مؤجل | useRequireAdminSection("full") |
| عزل بيانات الطلاب | S/L | S: PASS / L: مؤجل | RLS مالك + RPC يفرض الملكية |
| لا تسريب إجابات | S | **FAIL — HIGH (P0-1)** | questions RLS تعيد correct_index |
| direct URL لا يتجاوز | S | PASS (+LOW) | حماية admin component-level |

## WAVE-3 — Content Data

| السؤال | النتيجة |
|---|---|
| كم مادة/وحدة/درس/سؤال جاهز؟ | غير قابل للقياس بـ anon (RLS يحجب — صحيح) |
| نموذج اختبار واحد على الأقل؟ | غير مؤكد |
| مواد بلا دروس / دروس بلا موارد / أسئلة بلا ربط؟ | غير مؤكد |
| قوالب الاستيراد | موجودة (9 xlsx) — لم يُشغَّل import |
| قرار | **HOLD_CONTENT_DATA_NOT_READY** |

## WAVE-4 — Admin & Reports

| الاختبار | النتيجة |
|---|---|
| الكل | **SKIP_ADMIN_REPORTS_SMOKE_PR26_NOT_MERGED** — PR #26 Draft غير مدموج |

## WAVE-5 — PWA

| الاختبار | النتيجة |
|---|---|
| manifest installable + هوية | PASS |
| maskable icons | PASS (موجودة) |
| SW: لا cross-origin / لا non-GET / لا no-store | PASS |
| لا cache لـ auth/admin/api/storage | PASS |
| الاختبارات ليست offline | **PASS بعد PR #29** (`/exams` denylisted) |
| offline fallback | PASS |
| install prompt / update UX | PASS (تحديث بقرار المستخدم) |
| Preview محلي | غير متاح (wrangler غير مثبت؛ البناء PASS) |
| Android Chrome / iOS Safari | مؤجل — بعد أول Preview، على جهاز فعلي |

## فحوصات Baseline (GATE-0)

| الفحص | النتيجة |
|---|---|
| npm ci | PASS |
| npx tsc --noEmit | PASS |
| npm test (8) | PASS |
| PWA static (7) | PASS |
| security static (8) | PASS |
| npm run build | PASS |

## فحوصات PRs هذه المرحلة

| PR | tsc | tests | Web CI |
|---|---|---|---|
| #27 | PASS | 8/8 | pass |
| #28 | PASS | 8/8 | pass |
| #29 | — (SW/test فقط) | 7/7 PWA | pass/pending |
