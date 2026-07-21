# SECONDARY-PWA-FOUNDATION-01 — تقرير المرحلة

- المشروع: تطبيق طلاب المرحلة الثانوية (`msorori-mh/tas-heel-8e64d405`)
- الفرع: `feature/pwa-foundation-01` (من main `625108d1`)
- التاريخ: 2026-07-21
- القرار: **PASS_PWA_FOUNDATION_PR_READY**

## 1) الملفات المعدلة والجديدة (9 + هذا التقرير)

| الملف | الحالة | التغيير |
|---|---|---|
| `public/manifest.webmanifest` | معدّل | إضافة `id`؛ name/short_name عربي؛ lang=ar وdir=rtl (موجودان مسبقاً)؛ theme/background موحّدان (#1E2A78/#F8FAFC)؛ standalone؛ start_url؛ أيقونات 192/512/maskable |
| `public/sw.js` | معدّل (v2) | denylist إلزامية (+/wallet /subscription /payments)؛ منع cache لغير GET ولكل cross-origin؛ منع تخزين استجابات no-store/private وغير basic؛ كاشان مفصولان (shell/static) مع تنظيف إصدارات؛ network-first للتنقل مع fallback ثابت؛ **لا skipWaiting تلقائي** — التفعيل فقط برسالة SKIP_WAITING |
| `public/offline.html` | معدّل | هوية التطبيق (#1E2A78 على #F8FAFC بدل البنفسجي)؛ viewport-fit=cover + safe-area؛ زر إعادة محاولة + رابط رئيسية؛ توضيح أن الاختبارات/التدريب تتطلب اتصالاً ولا تُرسل الإجابات دون اتصال |
| `src/lib/pwa/install-prompt.ts` | **جديد** | التقاط beforeinstallprompt مبكراً + appinstalled + كشف iOS/standalone |
| `src/lib/pwa/register-sw.ts` | معدّل | تسجيل بالإنتاج فقط؛ حدث `pwa:update-available` عند وجود نسخة منتظرة؛ `applyPendingUpdate` لا يعمل إلا بإيماءة مستخدم صريحة + reload واحد عند controllerchange |
| `src/components/pwa/PwaInstallHint.tsx` | معدّل | Android: زر «تثبيت التطبيق الآن» يستدعي الحوار الأصلي عند توفره؛ iOS Safari: إرشاد يدوي (مشاركة ← إضافة إلى الشاشة الرئيسية)؛ إخفاء دائم بعد الرفض/التثبيت؛ safe-area + a11y |
| `src/components/pwa/PwaUpdateNotice.tsx` | **جديد** | شريط غير حاجب «تتوفر نسخة جديدة» بزر «تحديث الآن» (صريح) و«لاحقاً» — لا يقطع الجلسة ولا الاختبار |
| `src/routes/__root.tsx` | معدّل (3 تعديلات فقط) | viewport-fit=cover؛ استيراد وتركيب `<PwaUpdateNotice />` — لا لمس لـ routeTree.gen.ts ولا auth |
| `tests/pwa/service-worker-policy.static.test.mjs` | **جديد** | 7 اختبارات سياسة ثابتة (denylist، GET فقط، cross-origin، no-store، لا cache للتنقل، لا تفعيل تلقائي، manifest) — تُشغَّل بـ `node --test tests/pwa/` |

## 2) إجابات أسئلة المرحلة

| السؤال | الجواب |
|---|---|
| ما الملفات المعدلة؟ | الجدول أعلاه (7 معدلة/3 جديدة + تقرير) |
| هل manifest صالح؟ | نعم — JSON مُتحقق منه آلياً، واختبار السياسة يؤكد lang/dir/display/colors/icons |
| هل service worker لا يخزن auth/admin/api/storage؟ | نعم — denylist تشمل /auth /admin /api /_server /wallet /subscription /payments وكل cross-origin (Supabase API/storage) لا يُعترض أصلاً، ولا تخزين لـ no-store/private |
| هل offline fallback يعمل؟ | نعم معمارياً — network-first للتنقل مع رجوع لـ offline.html المُخزَّن مسبقاً؛ لا يُقدَّم للمسارات المحرَّمة ولا يُخزَّن أي HTML للتنقل (التحقق المرئي النهائي يكون في معاينة ما بعد الدمج) |
| هل install hint تحسن؟ | نعم — حوار Android أصلي + إرشاد iOS يدوي + حفظ الرفض + safe-area |
| هل Android installability جاهزة مبدئياً؟ | نعم — manifest مكتمل (id/name/icons 192+512+maskable/display/start_url/theme) + SW مُسجَّل بالإنتاج |
| هل iOS instructions موجودة؟ | نعم — نص عربي: زر المشاركة ثم «إضافة إلى الشاشة الرئيسية» |
| هل الاختبارات لم تصبح offline؟ | مؤكد — لا cache للتنقل ولا للامتحانات، لا IndexedDB/localStorage في SW، ونص صريح في offline.html، واختبار سياسة يمنع الانحراف مستقبلاً |
| هل build نجح؟ | **نعم** — `vite build` (client + server) EXIT=0 على شجرة كاملة 202 ملف |
| هل لا يوجد Deploy؟ | لا Deploy ولا Publish — عمل على فرع فقط |
| هل لا يوجد SQL/migration؟ | لا — صفر تغييرات على supabase/ |

## 3) نتائج الفحوص (بيئة بناء محلية كاملة، 2026-07-21)

| الفحص | النتيجة |
|---|---|
| `npm install` (529 حزمة) | PASS (npm ci غير مستخدم — EUSAGE @emnapi معروف وموثق من Cycle-02) |
| `npm run build` (client + server) | **PASS** — 20.1s |
| `npx tsc --noEmit` | **PASS** — 0 أخطاء |
| `npm test` (node v22.14، سكربت PR #18) | **PASS — 8/8** |
| `node --test tests/pwa/` (سياسة جديدة) | **PASS — 7/7** |
| `npx eslint` scoped (ملفات المرحلة) | **PASS — 0 أخطاء**، تحذير واحد مطابق للـ baseline (unused eslint-disable في sw.js — محفوظ عمداً) |
| سلامة البصمات | 9/9 ملفات على الفرع تطابق git blob SHA للنسخ المبنية محلياً |

## 4) ملاحظات وانحرافات موثقة

1. **أيقونات maskable**: الأيقونة الحالية `icon-maskable-512.png` تعمل لكنها بلا منطقة أمان (نسخة من icon-512). أُعدّت نسخ محسّنة (80% safe zone على خلفية #1E2A78) وسُلّمت للمالك خارج الـ PR (قناة الدفع لا تدعم الثنائيات) — تُضاف لاحقاً عبر Lovable/git محلي. الـ manifest يعمل مع الحالية دون كسر.
2. بناء التحقق المحلي استخدم placeholder مؤقتاً لـ `src/assets/hero-student.png` (ثنائي تعذّر جلبه) — الأصل على GitHub لم يُمس والـ PR لا يتعلق به.
3. فرع اختبار مؤقت `tmp/binary-push-test` أُنشئ أثناء التحقق من قناة الدفع — يُنصح بحذفه: `gh api -X DELETE repos/msorori-mh/tas-heel-8e64d405/git/refs/heads/tmp/binary-push-test`.
4. لا CI منشور — الفحوص موثقة محلياً كما في الدورات السابقة.

## 5) حدود النطاق (التزام كامل)

لا Deploy/Publish، لا Flutter/Capacitor، لا migrations/SQL، لا تغيير auth أو Storage، لا cache لـ admin/auth/api/storage/wallet/subscription/payments، الاختبارات تبقى online، لا خلط lint/CRLF (التحذير الوحيد baseline معروف).

## 6) القرار النهائي

**PASS_PWA_FOUNDATION_PR_READY** — الـ PR مستقل، الفحوص الستة كلها ناجحة، والبصمات مطابقة. الدمج بيد المالك حصراً.
