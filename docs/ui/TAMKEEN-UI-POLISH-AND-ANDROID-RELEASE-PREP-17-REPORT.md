# TAMKEEN_UI_POLISH_AND_ANDROID_RELEASE_PREP_17 — تقرير التنفيذ

الحالة: **PASS (17A مكتمل / 17B جاهز للبناء — SIGNING_REQUIRED)**
النطاق: واجهات وعرض فقط + تجهيز غلاف أندرويد. لا ميزات تعليمية جديدة، لا Migration، لا تغيير في RLS/RPC أو بيانات المحتوى والمحاولات.

## PHASE 17A — تلميع الواجهة

### مكوّنات ورموز موحّدة (Design Tokens فقط)
| الملف | الغرض |
|---|---|
| `src/lib/ui/vocabulary.ts` | توحيد المصطلحات العربية للأفعال والحالات وعناوين الأقسام |
| `src/components/common/PageHeader.tsx` | ترويسة صفحة مضغوطة Mobile-first موحّدة |
| `src/components/common/StatCard.tsx` | نمط بطاقة مؤشر (KPI) واحد بحالات تحميل ونغمات دلالية |
| `src/components/common/NavTile.tsx` | بطاقة انتقال موحّدة لمداخل الأدوات |
| `src/components/home/LearningToolsSection.tsx` | شبكة 2×2 تجمع: المراجعة السريعة، دفتر أخطائي، الأداء، النماذج الوزارية |

حُذفت البطاقات المنفصلة `QuickReviewEntry` و`MyMistakesEntry` و`PerformanceEntry` و`MinisterialExamsEntry`
(كانت أربع بطاقات كاملة العرض تُنتج تمريراً رأسياً طويلاً على الجوال).

### تقليل الازدحام والمساحات البيضاء
- الصفحة الرئيسية `/_authenticated/app.tsx`: تقليل التباعد الرأسي، ودمج أربعة أقسام في شبكة واحدة،
  ورفع «أدوات التعلم» قبل «الفصول الدراسية» لتقصير مسار الوصول إلى الأدوات.
- `ProgressSummary`: انتقلت إلى `StatCard` بشبكة أضيق.
- `/performance`: أعيدت هيكلتها على `PageHeader` + `StatCard` لتطابق بقية التطبيق.

### تحقق بصري (Playwright)
6 مسارات (`/app`, `/quick-review`, `/my-mistakes`, `/performance`, `/semesters`, `/settings`)
× 5 عروض (360 / 390 / 412 / 768 / 1024):

- الاتجاه RTL: 30/30 صحيحة.
- الفيضان الأفقي: **0px** في كل الحالات.
- عربية Cairo تُعرض دون قصّ أو تداخل.

## PHASE 17B — تجهيز إصدار أندرويد

المعمارية: تطبيق تمكين هو TanStack Start (SSR)، لذلك يعمل غلاف أندرويد بتحميل أصل الإنتاج
`https://studentamkeen.com` عبر Capacitor، مع صفحة احتياط محلية عند انقطاع الشبكة.

| العنصر | القيمة |
|---|---|
| `appId` | `app.studentamkeen.tamkeen` |
| `appName` | تمكين |
| `webDir` | `mobile/www` (صفحة احتياط offline فقط) |
| minSdk / targetSdk | 24 / 36 |
| versionCode / versionName | 1 / 1.0 |
| الأذونات | `INTERNET` فقط |
| المخطط | HTTPS فقط (`cleartext=false`, `allowMixedContent=false`) |

- `capacitor.config.ts`: إعداد الغلاف + SplashScreen بلون الهوية `#5B4BFF`.
- `android/`: مشروع أصلي مولّد عبر `cap add android`، `supportsRtl="true"` مفعّل.
- `src/components/mobile/AndroidBackHandler.tsx`: زر الرجوع الفيزيائي — يغلق النوافذ المنبثقة أولاً،
  ثم يرجع في التاريخ، وعلى الجذر يُصغّر التطبيق بدل إنهائه حتى لا تُفقد جلسة اختبار جارية.
  الاستيراد ديناميكي ومشروط بـ `Capacitor.isNativePlatform()` فلا يتأثر بناء الويب.
- التوقيع: `android/app/build.gradle` يقرأ `android/keystore.properties` إن وُجد (غير متتبَّع في Git)،
  والقالب في `android/keystore.properties.example`.

### خطوات البناء للنشر
```
bunx cap sync android
cd android && ./gradlew bundleRelease
# app/build/outputs/bundle/release/app-release.aab
```

**SIGNING_REQUIRED**: لم يُنشأ أي keystore ولم تُخترع أي بيانات اعتماد؛ يجب أن يولّدها فريق التشغيل.

## الانحدار
- `tsgo --noEmit`: نظيف.
- `vitest run`: 135/135 ناجحة (46 ملف `node:test` تفشل بالقراءة عبر vitest كما هو معروف مسبقاً وليست انحداراً).

**الحكم: TAMKEEN_UI_POLISH_AND_ANDROID_RELEASE_PREP_17 = PASS**
