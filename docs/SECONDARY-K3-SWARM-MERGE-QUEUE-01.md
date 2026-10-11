# SECONDARY-K3-SWARM-MERGE-QUEUE-01

> لا يوجد أي دمج مفوَّض أو منفَّذ من دورة K3 Swarm Cycle-01. كل بند أدناه يتطلب تفويضاً مستقلاً من المالك. شرط البوابة المسبق لأي دمج: `PASS_SECURITY_GATE_READY` (تحقق Lovable read-only + Smoke أمني ناجح).

## طابور الدمج المقترح (بالترتيب)

| الترتيب | العنصر | الحالة | شرط البوابة | قرار Cycle-01 |
|---|---|---|---|---|
| 0 | migration PR #20 على DB | LIKELY_APPLIED — ينتظر تأكيد read-only | أمر المالك رقم 1 (ثم رقم 2 مشروطاً) | جاهز للتحقق |
| 1 | **PR #17** — تجربة الطالب والهاتف | OPEN، clean، head `781525e6` | PASS_SECURITY_GATE_READY | `PASS_PR17_READY_FOR_OWNER_MERGE` |
| 2 | تحديث main + rebuild + smoke مختصر | — | بعد دمج #17 | موثق في WAVE-3 |
| 3 | **PR #18** — الاختبارات والتدريب | OPEN، clean، head `eb3d15e3` | بعد استقرار خطوة 2 | `PASS_PR18_READY_FOR_OWNER_MERGE` |
| 4 | تحديث main + rebuild + smoke اختبارات | — | بعد دمج #18 | موثق في WAVE-3 |
| 5 | **PR #21** (Draft) — تقارير Cycle-02 | OPEN Draft | قرار المالك: تحديث/دمج كتوثيق | من خارج نطاق المراجعة الوظيفية |
| 6 | **PR تقارير Cycle-01** (هذه الدورة) | Draft جديد | مراجعة المالك | توثيق فقط |
| — | PR #16 | OPEN — متجاوَز بدمج #20 | NEEDS_OWNER_DECISION: إغلاق دون دمج | غير مدرج في الطابور |
| — | PR #19 | OPEN Draft | NEEDS_OWNER_DECISION: تحديث أم استبدال | غير مدرج في الطابور |

## ما بعد الطابور (لا يبدأ قبل إغلاقه)

1. PWA بأربع PRs مرتبة (icons/install → SW update UX → offline/cache hardening → safe-area polish) حسب `docs/PWA-FOUNDATION-IMPLEMENTATION-PLAN-01.md`.
2. تقارير/إشعارات (WAVE-5) كـ PRs صغيرة منفصلة.
3. `CHORE-LINT-LINE-ENDINGS-NORMALIZATION-01` معزول، ثم PRs منفصلة لإصلاحات lint غير التنسيقية (67 مخالفة).

## قواعد إلزامية عند كل دمج

- تفويض مستقل من المالك لكل PR.
- إعادة build/typecheck/tests على main بعد كل دمج وقبل التالي.
- عتبة المراجعة: CRITICAL=0 / HIGH=0 / MEDIUM=0.
- أي فشل Smoke أمني (S3/S4/S5) = إيقاف فوري لكل الدمج.
- لا Deploy ولا Publish ولا SQL production في أي خطوة.
