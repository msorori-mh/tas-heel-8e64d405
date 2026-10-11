# SECONDARY-OPERATIONAL-RELEASE-FIX-QUEUE-01 — طابور الإصلاحات

المرجع: main @ `10cb220`. التاريخ: 2026-07-31.
القاعدة: كل إصلاح في PR مستقل. أي migration/SQL = NEEDS_OWNER_APPROVAL ولا تُنفَّذ.

## مفتوح الآن (بانتظار مراجعة/دمج المالك)

| الترتيب | PR | الوصف | النوع | الفحوصات |
|---|---|---|---|---|
| 1 | #27 `fix/student-core-release-smoke-01` | تصحيح أعمدة نتيجة التدريب والسجل (نسبة من score/total_points + أسماء الأعمدة الحقيقية) | UI bug | tsc PASS، tests 8/8، CI pass |
| 2 | #28 `fix/strict-exam-expired-autosubmit-01` | تسليم تلقائي لجلسة الاختبار الصارم المنتهية server-side | UI bug | tsc PASS، tests 8/8، CI pass |
| 3 | #29 `fix/pwa-exams-denylist-01` | إضافة `/exams` لـ SENSITIVE_DENYLIST في SW + اختبار ثابت | PWA | PWA tests 7/7، CI pass/pending |
| 4 | docs `k3-swarm/secondary-release-readiness-cycle-01-reports` | تقارير هذه المرحلة الأربعة | docs | — |

## ينتظر قرار المالك — NEEDS_OWNER_APPROVAL (لا تُنفَّذ)

| الترتيب | المعرف | الوصف | الاتجاه المقترح |
|---|---|---|---|
| 5 | P0-1 | سياسات `questions`/`exam_template_questions` تسرّب `correct_index`/`explanation` | migration: فصل أعمدة الإجابة لجدول مستقل، أو عرض security barrier للطلاب، أو حصر القراءة عبر RPCs مجرّدة — مع تحديث العميل إن تغير مسار القراءة |
| 6 | P1-1 | `exam_templates` + `start_exam_session` بلا تحقق صف/منهج | migration: إضافة grade/track scoping للسياسة والـ RPC |

## مقترح لاحق (PRs صغيرة مستقلة — لا تبدأ قبل إغلاق P0)

| الترتيب | المعرف | الوصف | النوع |
|---|---|---|---|
| 7 | P1-2a | تصحيح تسمية «التقدم في الدرس» (تقيس توفر المحتوى لا تقدم الطالب) | نصوص/UI |
| 8 | P1-2b | كتابة `user_progress` من إكمال الدرس/الاختبار (قد يلامس RPC — يُقيَّم عند التنفيذ) | UI + ربما DB |
| 9 | P2-2 | حذف/تكييف `StudentProfileCard` الميت وCTAs الاشتراك | تنظيف UI |
| 10 | P2-1 | ربط مساري `/grades` من التنقل أو حذفهما | UI |
| 11 | P2-3 | نقل حماية admin إلى layout `beforeLoad` | UI hardening |
| 12 | P2-5 | مراجعة سياسة قراءة `units` لـ anon | يحتاج SQL ⇒ NEEDS_OWNER_APPROVAL عند التنفيذ |
| 13 | P2-6 | فحص جهازين فعليين بعد أول Preview (Android Chrome / iOS Safari) | QA يدوي |

## محظور في كل الطابور

migrations بلا موافقة، SQL production، تعديل Auth/Storage/RLS/الأدوار، Deploy/Publish، حذف بيانات، حذف البنية المالية، merge تلقائي، force push.
