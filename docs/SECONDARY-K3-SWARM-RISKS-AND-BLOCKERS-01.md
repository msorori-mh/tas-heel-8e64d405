# SECONDARY-K3-SWARM-RISKS-AND-BLOCKERS-01

## المخاطر المفتوحة

| # | الخطر | الخطورة | الضبط الحالي / الإجراء التالي |
|---|---|---|---|
| R1 | تطبيق migration الأمن (PR #20) على DB غير مؤكد بنسبة 100% — الدليل قوي (ملف Lovable مطابق + commit «Applied free access hardening») لكنه استدلال لا تحقق DB | HIGH تشغيلي | أمر Lovable read-only جاهز للمالك؛ لا استدلال من Git وحده |
| R2 | لا CI منشور على المستودع (0 check runs) — كل الفحوص موثقة محلياً فقط | HIGH إجرائي | إضافة GitHub Actions قبل روتينية الدمج؛ NEEDS_OWNER_DECISION |
| R3 | Smoke أمني ما بعد التطبيق لم يُنفَّذ بعد | HIGH تشغيلي | مصفوفة S1–S8 جاهزة؛ تشغل بعد APPLIED_VERIFIED |
| R4 | أثر حذف بلوك `declare module '@tanstack/react-start'` من `routeTree.gen.ts` على typecheck غير معاد التحقق على main الحالي | MEDIUM | إعادة build/typecheck على main عند أول جلسة عمل قادرة على الكتابة المحلية |
| R5 | idempotency الخادم لـ `submit_unit_practice_attempt` غير مؤكدة من مصدر migrations | LOW | الحارس العميلي يغطي التكرار؛ تحقق runtime لاحقاً |
| R6 | package-lock out of sync في بيئات العمل المشتركة | LOW baseline | موثق؛ لا يخلط مع PRs وظيفية |
| R7 | 32,013 مخالفة CRLF تحجب رؤية lint + 67 مخالفة غير تنسيقية | MEDIUM | PR عزل CRLF ثم PRs إصلاح منفصلة (خطة Cycle-02) |
| R8 | PR #16 مفتوح ومتجاوَز بدمج #20؛ PR #19 Draft معلق | LOW إجرائي | قرار المالك: إغلاق/تحديث |
| R9 | PWA cache policy غير محصنة بعد | HIGH قبل إصدار PWA | خطة الأربع PRs؛ لا cache للمسارات الحساسة ولا امتحانات offline |

## المخاطر المغلقة في هذه الدورة

| الخطر | كيف أُغلق |
|---|---|
| هل migration PR #20 المدموجة تحمل ثغرات في المصدر؟ | مراجعة Cycle-02 Agent A + تحقق مطابقة Cycle-01: DDL سليم (auth مطلوب، admin bypass، grade/track، revoke anon/PUBLIC، grant authenticated، لا اشتراك) |
| هل PR #17 يعيد روابط دفع/اشتراك أو يكسر التنقل؟ | مراجعة الوكيل A: PASS — CRITICAL/HIGH/MEDIUM = 0 |
| هل PR #18 يسرّب إجابات أو يحتسب مزدوجاً أو يعتمد اشتراكاً؟ | مراجعة الوكيل B: PASS — fail-closed + تحصين خادمي مؤكد من المصدر |

## Blockers الحالية (بانتظار المالك)

1. تشغيل أمر Lovable read-only وإعادة نتيجته — يحجب تحويل بوابة الأمان إلى PASS.
2. تفويض دمج #17 ثم #18 — يحجب WAVE-3 وما بعدها.
3. قرار CI — يحجب تحويل الدمج إلى روتين آمن.

لا Deploy ولا SQL production ولا تعديل بيانات ولا merge حدث في هذه الدورة.
