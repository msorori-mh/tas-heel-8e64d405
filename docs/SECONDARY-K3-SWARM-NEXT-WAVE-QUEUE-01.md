# SECONDARY-K3-SWARM-NEXT-WAVE-QUEUE-01

## طابور الموجات القادمة (لا يبدأ أي بند قبل تحقق شرطه)

### WAVE-3 — smoke ما بعد الدمج (شرط: تفويض المالك + PASS_SECURITY_GATE_READY)
1. بعد دمج PR #17: تحديث main → rebuild → smoke مختصر لتجربة الطالب والتنقل على الهاتف.
2. بعد دمج PR #18: تحديث main → rebuild → `npm test` → smoke مختصر للاختبارات/التدريب (بدء مجاني، تسليم مفرد، reveal بعد الانتهاء فقط).

### WAVE-4 — PWA Foundation (شرط: استقرار WAVE-3)
أربع PRs مرتبة حسب `docs/PWA-FOUNDATION-IMPLEMENTATION-PLAN-01.md` (Cycle-02، في PR #21):
1. PR-1: الأيقونات وmanifest وinstall prompt (Android beforeinstallprompt + إرشاد iOS A2HS).
2. PR-2: service-worker update UX (إشعار تحديث؛ لا refresh قسري أثناء `/exams/*` أو `/units/*/practice`).
3. PR-3: offline fallback وتحصين حدود الـ cache (منع cache لـ auth/admin/api/storage والبيانات الديناميكية؛ الامتحانات online فقط).
4. PR-4: standalone وsafe-area polish (viewport-fit=cover، أهداف لمس 44px، RTL/320px).

قواعد: لا Flutter ولا Capacitor الآن؛ PR-2 وPR-3 لا يعملان على `sw.js` بالتوازي؛ كل PR بفحوص كاملة ومراجعة CRITICAL=0/HIGH=0/MEDIUM=0.

### WAVE-5 — التقارير والإشعارات (شرط: اكتمال PWA Foundation)
PRs صغيرة منفصلة:
- تقارير تقدم الطلاب.
- نتائج الاختبارات.
- مؤشرات الاستخدام.
- الإشعارات التعليمية.
- أخطاء التطبيق.

### WAVE-6 — lint/CRLF (آخر بند، معزول تماماً)
1. `CHORE-LINT-LINE-ENDINGS-NORMALIZATION-01`: سياسة LF عبر `.gitattributes` + تطبيع ميكانيكي + إثبات أن كل تغيير line-ending فقط.
2. بعده PRs منفصلة: hooks (`EditProfileDialog`, `exams.history`)، typing (student lesson, admin lesson-detail)، fast-refresh exports، `prefer-const`.

### Flutter / Capacitor
مؤجل إلى ما بعد استقرار PWA واكتمال الاختبارات — خارج أفق الدورات الحالية.

## عناصر NEEDS_OWNER_DECISION المرحّلة

| العنصر | القرار المطلوب |
|---|---|
| CI (GitHub Actions) | اعتماد إضافته قبل روتينية الدمج |
| PR #16 | إغلاق دون دمج (متجاوَز بـ #20)؟ |
| PR #19 | تحديث أم استبدال بتقارير Cycle-01/02؟ |
| PR #21 | دمج كتوثيق Cycle-02 أم تحديث أولاً؟ |
| خطة PWA الرباعية | اعتماد نهائي قبل بدء WAVE-4 |
| خطة lint/CRLF | اعتماد نهائي قبل WAVE-6 |

## آلية الدورة القادمة (Cycle-02 لـ K3 Swarm)

1. GATE-0 جديد: main SHA + نتيجة أمر Lovable read-only + حالة الدمجات.
2. إن PASS_SECURITY_GATE_READY + دمج المالك: تنفيذ WAVE-3 smoke وتوثيقه.
3. بدء WAVE-4 PR-1 فقط بعد استقرار WAVE-3.
4. تحديث ملفات التقارير الأربعة بإصدار Cycle-02.
