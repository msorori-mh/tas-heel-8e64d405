# TAMKEEN-ANDROID-GOOGLE-OAUTH-HTTPS-APP-LINK-21B4C-R1

MODE: AUDIT + SOURCE ADJUSTMENT فقط. لا Deploy، لا Merge، لا migration، لا DB writes،
لا Storage mutation، لا تغيير Google provider، لا تغيير Site URL، لا 21B4D.

## PHASE 1 — AUDIT (نتائج فعلية، بلا افتراض)

1. **هل يمكن إضافة `https://studentamkeen.com/auth/mobile-callback` إلى Allow List؟**
   **غير مطلوب أصلاً** — القراءة الحالية للـ Allow List تحتوي بالفعل:
   `https://studentamkeen.com/**` و `https://www.studentamkeen.com/**`.
   نمط `/**` يغطي `/auth/mobile-callback` حرفياً. هذا هو سبب فشل المسار السابق:
   السكيم المخصص ليس URL ضمن نطاق مسموح، بينما HTTPS callback مغطى منذ البداية.
2. **هل studentamkeen.com هو الدومين الإنتاجي؟** نعم — Custom domains النشطة:
   `https://studentamkeen.com`, `https://www.studentamkeen.com` (published: `tas-heel.lovable.app`).
   اعتُمد `studentamkeen.com` (بدون www) كأصل وحيد canonical للـ App Link.
3. **هل يقبل AndroidManifest استقبال https/host/pathPrefix؟** نعم — أُضيف intent-filter محدود:
   `scheme=https`, `host=studentamkeen.com`, `pathPrefix=/auth/mobile-callback`.
4. **assetlinks.json؟** **غير موجود** — لا `public/.well-known/` في المشروع ولا آلية App Links مُتحقَّقة.
   لذلك `autoVerify="false"` حالياً، والتسليم المباشر من Custom Tab إلى التطبيق **لن يعمل**
   قبل نشر assetlinks. لهذا احتُفظ بالجسر (انظر أدناه).
5. **SHA-256 signing certificate؟** **غير معروف من داخل هذه البيئة** — لا يوجد
   `~/.android/debug.keystore` ولا keystore إصدار في المستودع. يجب استخراجه على جهاز البناء:
   - debug: `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android`
   - release: من keystore الإصدار (أو Play App Signing → SHA-256 من Play Console).
   لم تُفترض أي قيمة.

## SOURCE CONTRACT (بعد التعديل)

```
Android OAuth redirectTo = https://studentamkeen.com/auth/mobile-callback
Web OAuth                = getAuthRedirectUrl("/auth/callback")   [دون تغيير]
appUrlOpen يقبل فقط:
  https://studentamkeen.com/auth/mobile-callback     (App Link)
  app.studentamkeen.tamkeen://auth/callback          (جسر داخلي فقط)
كل ما عداه: ignored (fail closed, صامت).
```

### لماذا بقي الـ custom scheme (مبرَّر لا تكرار عشوائي)

Custom Tab لا يسلّم رابط https إلى التطبيق إلا إذا كان **App Link مُتحقَّقاً** عبر assetlinks.
قبل ذلك، صفحة `/auth/mobile-callback` (على أصل مسموح فعلاً) تُمرّر **الكود فقط** إلى
`app.studentamkeen.tamkeen://auth/callback`. هذا الجسر:
- لا يُرسَل أبداً إلى مزوّد المصادقة (لا يحتاج Allow List) → يتجاوز سبب الرفض السابق نهائياً.
- app-private، fail-closed، ويصبح مساراً ميتاً تلقائياً بمجرد تفعيل autoVerify.

## الملفات المعدَّلة

| ملف | التغيير |
| --- | --- |
| `src/lib/auth/native-oauth.ts` | `NATIVE_OAUTH_REDIRECT_URL` → HTTPS؛ ثوابت `HTTPS_CALLBACK_*` و `NATIVE_BRIDGE_*`؛ مُطابِق يقبل https-canonical + الجسر فقط |
| `src/routes/auth.mobile-callback.tsx` | جديد — صفحة App Link؛ `noindex,nofollow`؛ تمرير الكود عبر `location.replace`؛ لا عرض tokens/codes/session/debug |
| `android/app/src/main/AndroidManifest.xml` | intent-filter https محدود بـ pathPrefix + إبقاء الجسر؛ `autoVerify=false` موثّق |
| `tests/mobile/android-google-oauth-return-21b4c.static.test.mjs` | إعادة تأسيس على عقد HTTPS (13 اختباراً) |

`google-sign-in.ts` و `NativeAuthDeepLinkHandler.tsx` لم يتغيرا سلوكياً: PKCE،
`skipBrowserRedirect`, Custom Tab, `exchangeCodeForSession` داخل نفس WebView — كلها كما هي.
الويب دون أي تغيير.

## CONFIGURATION REQUIREMENT

```
REQUIRED_AUTH_REDIRECT      = NOT_REQUIRED
                              (مغطّى مسبقاً بـ https://studentamkeen.com/** في Allow List)
REQUIRED_ANDROID_APP_LINK   = https://studentamkeen.com/auth/mobile-callback
                              (intent-filter مضاف؛ autoVerify=true خلف بوابة assetlinks)
REQUIRED_ASSETLINKS         = https://studentamkeen.com/.well-known/assetlinks.json
                              package_name = app.studentamkeen.tamkeen
                              relation = delegate_permission/common.handle_all_urls
                              sha256_cert_fingerprints = [debug, release]
                              (لم يُنشر — بوابة منفصلة)
REQUIRED_SIGNING_SHA256     = UNKNOWN_MUST_BE_EXTRACTED_ON_BUILD_MACHINE
                              debug: androiddebugkey من ~/.android/debug.keystore
                              release: keystore الإصدار أو Play App Signing
```

## TESTS

```
mobile suite: 25/25 PASS (21B4B: 12 + 21B4C-R1: 13)
- Android chooses HTTPS mobile callback ............ PASS
- Web auth unchanged ............................... PASS
- correct host accepted ............................ PASS
- wrong host rejected (evil.com, suffix, www) ...... PASS
- wrong path rejected .............................. PASS
- http rejected .................................... PASS
- malformed URL rejected ........................... PASS
- duplicate callback safe (idempotent) ............. PASS
- PKCE preserved ................................... PASS
- no token logging ................................. PASS
- 21B4B offline regression unaffected .............. PASS
typecheck: PASS   build: PASS
PHYSICAL_ANDROID_TEST = PENDING_DEVICE_AVAILABLE
```

## FINAL VERDICT

**PASS_SOURCE_READY_PENDING_HTTPS_APP_LINK_CONFIG**

المصدر جاهز على عقد HTTPS App Link، ولا يحتاج أي إضافة إلى Auth Redirect Allow List.
المتبقي خلف بوابة منفصلة: استخراج SHA-256، نشر assetlinks.json، ثم `autoVerify="true"`،
ثم اختبار على جهاز حقيقي. لا نشر ولا دمج.
