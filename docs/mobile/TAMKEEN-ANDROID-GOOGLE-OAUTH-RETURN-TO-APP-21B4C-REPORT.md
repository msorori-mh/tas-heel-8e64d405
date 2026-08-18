# TAMKEEN — Android Google OAuth Return-to-App (21B4-C)

النطاق: مصدر فقط. **لا نشر، لا merge، لا ترحيل/كتابة قاعدة بيانات، لا تغيير Supabase/Google Console الإنتاجي، لا 21B4-D.**

## G0 — PRESERVE 21B4B

| البند | القيمة |
| --- | --- |
| `21B4B_IMPLEMENTATION_BRANCH` | `edit/edt-d4e634f1-d63f-4f8a-8493-d41e80c5d5c7` (فرع العمل الذي تديره منصة Lovable) |
| `21B4B_IMPLEMENTATION_SHA` | `563c4a2c16fec6d80839a4b718a02d7c8ff03368` ("Implemented 21B4B Android shell") |
| حالة 21B4B | **PASS_READY_FOR_PHYSICAL_ANDROID_RETEST** |
| الاختبار الفيزيائي | **PENDING_DEVICE_AVAILABLE** |

commit 21B4B لم يُعدَّل. 21B4C بُنيت فوق `563c4a2c` كطبقة إضافية.
**ملاحظة تشغيلية صريحة:** منصة Lovable تدير الفروع داخلياً ولا تسمح بأوامر git الحالة (`checkout`/`branch`)، لذلك لم يُنشأ فرع منفصل يدوياً؛ العزل تحقّق بأن كل تغييرات 21B4C في ملفات جديدة أو مسارات auth حصراً، **ولا ملف من ملفات Offline (21B4B) تغيّر** (يوجد اختبار حارس رقم 12).

- START_HEAD = `563c4a2c16fec6d80839a4b718a02d7c8ff03368`
- END_HEAD = شجرة عمل 21B4C غير المدموجة (تُختم عند البوابة)

## الملفات المتغيّرة

| الملف | التغيير |
| --- | --- |
| `src/lib/auth/native-oauth.ts` | **جديد** — عقد الـdeep link، التحقق fail-closed، منع التكرار، فتح/إغلاق Custom Tab |
| `src/lib/auth/google-sign-in.ts` | **جديد** — نقطة دخول واحدة لتسجيل الدخول بـGoogle (تفرّع Web/Android) |
| `src/components/mobile/NativeAuthDeepLinkHandler.tsx` | **جديد** — استقبال `appUrlOpen` + تبادل الكود + شاشة «جارٍ إكمال تسجيل الدخول...» |
| `src/routes/auth.tsx` | حذف النسخة المحلية من `signInWithGoogle` واستدعاء `startGoogleSignIn` (نفس سلوك الويب حرفياً) |
| `src/routes/__root.tsx` | تركيب `<NativeAuthDeepLinkHandler />` بجانب `<AndroidBackHandler />` |
| `android/app/src/main/AndroidManifest.xml` | `intent-filter` واحد ضيّق: scheme + host + path |
| `tests/mobile/android-google-oauth-return-21b4c.static.test.mjs` | **جديد** — 12 اختباراً |
| `docs/mobile/…-21B4C-REPORT.md` | هذا التقرير |

## ROOT CAUSE الفعلي

الكود قبل هذه الدفعة (`src/routes/auth.tsx`) موحّد لكل المنصات:

```ts
redirectTo: getAuthRedirectUrl("/auth/callback")   // https://studentamkeen.com/auth/callback
window.location.href = url;                        // ملاحة داخل WebView
```

على Android يجتمع سببان:

1. **لا يوجد أي `intent-filter` من نوع VIEW/BROWSABLE** في المانيفست (تم تأكيده في تدقيق 21B4A ومجدداً هنا). ولأن App Links عبر HTTPS غير مُحقّقة (لا `assetlinks.json` ولا `autoVerify` ولا توقيع release مربوط)، فإن `https://studentamkeen.com/auth/callback` **لا يمكن أن يعود إلى التطبيق إطلاقاً** — يفتحه Chrome.
2. Google ترفض عرض شاشة الموافقة داخل WebView خام (`disallowed_useragent`)، فينتقل التدفق إلى المتصفح الخارجي. تكتمل الجلسة هناك في تخزين Chrome، بينما WebView الخاص بتمكين يبقى بلا جلسة **ويحتفظ وحده بـPKCE code verifier**.

⇒ النتيجة الميدانية: الطالب ينتهي داخل المتصفح، والتطبيق ما يزال يعتبره غير مسجّل.

`capacitor.config.ts` كان أيضاً بلا أي إعداد deep link، و`@capacitor/app` مستخدم لزر الرجوع فقط (لا `appUrlOpen`)، و`@capacitor/browser` مثبّت لكنه غير مستخدم في مسار الدخول.

## TARGET FLOW (Authorization Code + PKCE)

```
Tamkeen WebView
  └─ supabase.auth.signInWithOAuth({ skipBrowserRedirect: true,
        redirectTo: app.studentamkeen.tamkeen://auth/callback })   ← verifier يُخزَّن في WebView
  └─ Browser.open(url)  → Chrome Custom Tab (Google يقبله)
        └─ اختيار حساب Google → موافقة
        └─ Google → <supabase>/auth/v1/callback → 302 إلى الـdeep link
  └─ Android intent (singleTask) → نفس MainActivity/WebView → appUrlOpen
  └─ التحقق الصارم من الرابط → Browser.close() → exchangeCodeForSession(code)
  └─ navigate("/auth/callback") → منطق اكتمال الملف القائم → /app أو /complete-profile
```

نقطة المفتاح المعمارية: التبادل يتم **داخل نفس WebView** الذي بدأ الطلب، فيتوافر code verifier ولا حاجة لأي سر داخل الـAPK.

## DEEP-LINK CONTRACT

| الحقل | القيمة |
| --- | --- |
| scheme | `app.studentamkeen.tamkeen` (مطابق لـ `appId`، مملوك حصراً للتطبيق) |
| host | `auth` |
| path | `/callback` (مطابقة تامة؛ `/callback/extra` مرفوض) |
| المعاملات المقبولة | `code` (8–512 حرفاً من `A-Za-z0-9._~-`)، `state`، أو `error`/`error_description` |
| launchMode | `singleTask` (لا نسخة ثانية من Activity) |
| autoVerify | `false` — سكيم خاص، لا علاقة له بـApp Links |

أي رابط آخر (scheme/host/path مختلف، URL تالف، بلا `code`) ⇒ **ignore بصمت** دون رسالة ودون تسجيل.

## SECURITY REVIEW

- **Fail closed**: `parseNativeAuthCallback` ترفض كل ما لا يطابق السكيم والمضيف والمسار وشكل الكود.
- **لا تسريب**: صفر `console.*` في الملفات الثلاثة الجديدة؛ لا `access_token`/`refresh_token`/`code` يظهر في أي سجل أو نص خطأ. الرد على رابط يحمل توكنات ضمنية: خطأ عام بالعربية بلا أي قيمة (اختبار 7 يتحقق أن الناتج لا يحوي القيمة).
- **لا أسرار في الـAPK**: لا client secret، لا service role، لا مفاتيح؛ PKCE يغني عن ذلك.
- **State/PKCE**: يولّده ويتحقق منه `supabase-js` (تدفق PKCE الافتراضي) و`state` يُمرَّر فقط للمعاينة ولا يُستخدم للثقة محلياً.
- **Idempotency**: كل `code` يُستهلك مرة واحدة في الجلسة؛ التسليم المكرر (appUrlOpen + getLaunchUrl) لا يعيد التبادل.
- **لا wildcard**: `intent-filter` واحد ضيّق بثلاثة قيود، غير قابل لالتقاط روابط https عامة.
- **تنظيف**: `Browser.close()` قبل أي تفرّع، فلا يبقى Custom Tab أمام الطالب.

## WEB REGRESSION

`WEB_GOOGLE_AUTH = UNCHANGED`. مسار الويب نُقل حرفياً (نفس `redirectTo` ونفس منطق الإطار المضمّن/التبويب الجديد/الملاحة العلوية)، والتفرّع الوحيد خلف `Capacitor.isNativePlatform()` الذي يعيد `false` على الويب ويُستورد ديناميكياً. مسارات البريد/كلمة المرور/OTP و`/auth/callback` بلا تغيير. `<NativeAuthDeepLinkHandler />` يعيد `null` ولا يحمّل أي مكوّن إضافي خارج الغلاف الأصلي.

## TESTS / BUILD

- `tests/mobile/android-google-oauth-return-21b4c.static.test.mjs` → **12/12 PASS** (تغطي البنود 1–12 المطلوبة).
- `tests/mobile` كاملاً (21B4B + 21B4C) → **24/24 PASS**.
- `tsgo --noEmit` → **نظيف**.
- `bun run build` (production) → **نجح**.
- `bunx cap sync android` → **نجح** بعد تعديل المانيفست.
- الجناح الكامل `vitest run tests/` → 223/224 assertions ناجحة. الفشل الوحيد في `tests/security/units-select-authenticated-only.static.test.mjs` (بصمة SHA لملف ترحيل units SELECT) و**سابق لهذه الدفعة وغير متعلق بها** — 21B4C لم تلمس أي ملف ترحيل أو RLS. ملفات "No test suite found" هي سكربتات `node:test` قديمة (وضع سابق).
- `assembleDebug` → **غير ممكن**: لا Android SDK/JDK في بيئة Lovable. **لا يوجد ادعاء PASS فيزيائي.**

## CONFIGURATION MATRIX

| Environment | Platform | OAuth Redirect URI | Android Intent Match | Supabase Allowed Redirect | Google Console Dependency | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Web Production | Browser | `https://studentamkeen.com/auth/callback` | — | مُهيّأ مسبقاً | لا شيء (Google يعرف Supabase callback فقط) | ✅ UNCHANGED |
| Web Preview | Browser | `https://…lovable.app/auth/callback` | — | مُهيّأ مسبقاً | لا شيء | ✅ UNCHANGED |
| Android Debug | Capacitor | `app.studentamkeen.tamkeen://auth/callback` | scheme+host+path ✅ (مضاف) | ⛔ **مطلوب إضافته** | لا شيء | ⏳ BLOCKED_ON_SUPABASE_REDIRECT |
| Android Release | Capacitor | `app.studentamkeen.tamkeen://auth/callback` | scheme+host+path ✅ (مضاف) | ⛔ **مطلوب إضافته** | لا شيء | ⏳ BLOCKED_ON_SUPABASE_REDIRECT |

تصنيف التغييرات: المصدر = **A** (مُنجز). الحاجة المتبقية = **B** فقط. **لا C** (Google Console بلا تغيير: عميل OAuth يعيد التوجيه إلى Supabase `/auth/v1/callback` حصراً، وSupabase هو من يعيد التوجيه إلى السكيم). **لا D** (لم نعتمد App Links، لذلك لا `assetlinks.json` ولا ربط بصمة التوقيع — وهذا اختيار متعمّد يجعل الدفعة قابلة للتنفيذ بلا لمس البنية الإنتاجية).

## REQUIRED_PRODUCTION_CONFIG

```
SUPABASE_REDIRECT_URI = app.studentamkeen.tamkeen://auth/callback
    السبب: Supabase يرفض أي redirect_to خارج قائمة Additional Redirect URLs
    ويعيد التوجيه إلى Site URL بدلاً منه، فلا يعود الطالب إلى التطبيق.
    (Site URL يبقى https://studentamkeen.com دون تغيير.)

GOOGLE_REDIRECT_URI_OR_APP_LINK = لا تغيير مطلوب
    السبب: عميل Google OAuth يعيد التوجيه إلى Supabase /auth/v1/callback فقط،
    وهو مسجّل مسبقاً ويعمل على الويب اليوم.

ANDROID_SCHEME/HOST/PATH = app.studentamkeen.tamkeen / auth / /callback
    السبب: مطابقة intent-filter المضاف في المصدر؛ لا يحتاج أي إعداد سحابي.
```

**لم تُطبَّق أي منها.** التوقف عند بوابة: `APPROVED_21B4C_PRODUCTION_OAUTH_CONFIG`.

## إجراء الاختبار الفيزيائي (بعد إقرار البوابة)

1. أضف `app.studentamkeen.tamkeen://auth/callback` إلى Additional Redirect URLs في إعدادات المصادقة (بعد الموافقة).
2. `bunx cap sync android` ثم `assembleDebug` من بيئة بها Android SDK، وثبّت APK نظيفاً على R5CY246Q11J.
3. افتح تمكين وأنت **مسجَّل خروج**، ثم اضغط «سجّل عبر Google».
4. تحقق: تُفتح Custom Tab داخل التطبيق (وليس Chrome كتطبيق منفصل) — GOOGLE_LOGIN_LAUNCH.
5. تحقق: تظهر قائمة اختيار حساب Google — GOOGLE_ACCOUNT_SELECTION.
6. اختر حساباً وأكمل الموافقة — OAUTH_CALLBACK.
7. تحقق: تُغلق Custom Tab تلقائياً ويعود التطبيق للواجهة — RETURN_TO_TAMKEEN_APP، بلا ضغط Back ولا إغلاق يدوي.
8. تحقق: تظهر «جارٍ إكمال تسجيل الدخول...» لحظياً ثم الانتقال إلى `/app` (حساب مكتمل) أو `/complete-profile` (حساب جديد) — SESSION_RESTORED_IN_APP.
9. تحقق: لا تبقى أي نافذة متصفح مفتوحة — NO_BROWSER_DEAD_END.
10. أغلق التطبيق وأعد فتحه: يجب أن تستمر الجلسة بلا تسجيل دخول جديد.
11. سيناريو سلبي: نفّذ `adb shell am start -a android.intent.action.VIEW -d "app.studentamkeen.tamkeen://evil/callback?code=x"` — يجب ألا يحدث شيء (تجاهل صامت، لا انهيار).
12. سيناريو إلغاء: ابدأ الدخول ثم اضغط Back داخل Custom Tab — يعود للتطبيق بشاشة الدخول سليمة.
13. تحقق من عدم انحدار 21B4B: نزّل كتاباً، فعّل وضع الطيران، أعد التشغيل، افتح الكتاب.
14. اجمع اللوج: `adb logcat -s Capacitor:V Capacitor/Plugin:V chromium:E AndroidRuntime:E` وتأكد من خلوه من أي `code`/`access_token`.

## FINAL VERDICT

**PASS_SOURCE_READY_PENDING_OAUTH_CONFIG_AND_PHYSICAL_TEST**

المصدر مكتمل ومختبَر ثابتاً؛ الإكمال الفعلي يتوقف على إضافة redirect URI واحد في إعدادات المصادقة (بوابة `APPROVED_21B4C_PRODUCTION_OAUTH_CONFIG`) ثم اختبار على جهاز حقيقي. لا نشر ولا merge.

---

## PRODUCTION OAUTH CONFIG — G0 PREFLIGHT (2026-08-18)

قراءة الحالة الحالية لإعدادات المصادقة (read-only):

```
Site URL: https://tas-heel.lovable.app
OAuth server (managed): Disabled
Redirect URI allow list (كما هي، بدون أي تعديل):
- https://studentamkeen.com/**
- https://www.studentamkeen.com/**
- https://id-preview*--0e731d8e-4edd-4b70-80ca-41ff8733cacc.lovable.app/**
- https://id-preview*--0e731d8e-4edd-4b70-80ca-41ff8733cacc.*.lovable.app/**
- https://0e731d8e-4edd-4b70-80ca-41ff8733cacc.lovableproject.com/**
- https://0e731d8e-4edd-4b70-80ca-41ff8733cacc-thr_*.lovableproject.com/**
- https://preview--tas-heel.lovable.app/**
- https://tas-heel.lovable.app/**
```

المطلوب الوحيد: إضافة `app.studentamkeen.tamkeen://auth/callback` (exact match، بلا wildcard).

## APPLY — النتيجة

`PRODUCTION_OAUTH_CONFIG_APPLIED=NO (TOOLING_GAP)`

لا تتوفر للوكيل أي أداة تكتب في Auth Redirect Allow List. الأدوات المتاحة للمصادقة
(`configure_auth`, `configure_social_auth`, `configure_oauth_server`) لا تملك حقل redirect URLs،
واستخدام `configure_oauth_server` كان سيفعّل OAuth server (تغيير خارج النطاق) → رُفض التزاماً بـ
"ممنوع أي تغيير إضافي".

الإجراء اليدوي المطلوب من المالك (خطوة واحدة، بلا حذف أي قيمة):
Cloud → Users → Auth Settings → URL Configuration → Additional Redirect URLs →
إضافة سطر واحد: `app.studentamkeen.tamkeen://auth/callback`

## POST-APPLY VERIFY (حالة اليوم)

```
PRODUCTION_OAUTH_CONFIG_APPLIED=NO (pending manual add — no agent tool)
REDIRECT_URI=app.studentamkeen.tamkeen://auth/callback (NOT YET PRESENT)
SITE_URL_UNCHANGED=YES
GOOGLE_PROVIDER_UNCHANGED=YES
EXISTING_REDIRECTS_PRESERVED=YES
WILDCARD_ADDED=NO
PHYSICAL_ANDROID_TEST=PENDING_DEVICE_AVAILABLE
```

## SOURCE CONTRACT CHECK

```
capacitor.config.ts:12                  appId  = app.studentamkeen.tamkeen
AndroidManifest.xml:31                  scheme = app.studentamkeen.tamkeen
src/lib/auth/native-oauth.ts:19         NATIVE_APP_SCHEME = app.studentamkeen.tamkeen
callback = app.studentamkeen.tamkeen://auth/callback  ✔ مطابق
```

## SECURITY CHECK

- callback matcher fail-closed (host=auth, path=/callback، غير ذلك يُرفض صامتاً) ✔
- wrong scheme / wrong callback / malformed callback مرفوضة — مغطاة باختبارات
  `tests/mobile/android-google-oauth-return-21b4c.static.test.mjs` ✔
- لا تسجيل لأي `code` أو `access_token` في اللوج ✔
- PKCE مفعّل كما هو (لا تغيير) ✔
- تدفق الويب دون تغيير ✔

## VERDICT

**FAILED_CONFIG_VERIFICATION** — التحقق البعدي أثبت أن الـ redirect URI الجديد غير موجود بعد؛
الإضافة تحتاج خطوة يدوية واحدة من المالك. لم يُنشر ولم يُدمج شيء، ولم تتغير أي قيمة قائمة.
