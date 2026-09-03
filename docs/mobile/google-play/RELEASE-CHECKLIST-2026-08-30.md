# تمكين الطالب — بوابة جاهزية Google Play

آخر تحديث: 2026-09-02. النطاق: Android 1.0.2، الحزمة `app.studentamkeen.tamkeen`، وإصدار الاختبار المغلق Offline‑First.

## مصفوفة القرار

| المتطلب                  | الحالة                          | الدليل / الإجراء                                                                                                                         |
| ------------------------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| AAB وPlay App Signing    | HOLD_EXTERNAL                   | مسار AAB موجود؛ يجب إنشاء Upload key آمن وتفعيل Play App Signing وإدخال أسرار CI الأربعة                                                 |
| Package name             | PASS_SOURCE                     | `app.studentamkeen.tamkeen` متطابق في Capacitor وGradle وJava                                                                            |
| Version                  | PASS_SOURCE                     | `versionCode 4` و`versionName 1.0.3`؛ الأرقام 1–3 استُخدمت في Play/حزم الاختبار ولا يُعاد استخدامها                                      |
| Target API               | PASS_SOURCE                     | compile/target 36، وهو خط الأساس المطلوب للتطبيقات الجديدة والتحديثات بدءًا من 2026-08-31                                                |
| 64-bit / 16 KB page size | PASS_CURRENT_AAB_IF_NO_SO       | قارئ PDF يستخدم API المنصة؛ CI يفشل إذا دخلت مكتبة `.so` غير مدققة. يجب تشغيل الحارس على AAB النهائي قبل مهلة تحديثات Play في 2027-02-01 |
| الصلاحيات الحساسة        | PASS_SOURCE                     | الصلاحية الوحيدة INTERNET؛ لا موقع/كاميرا/رسائل/جهات اتصال/Advertising ID                                                                |
| أمان النقل               | PASS_SOURCE / VERIFY_PRODUCTION | HTTPS فقط، cleartext وmixed content معطّلان؛ افحص شهادة النطاق من الجهاز                                                                 |
| النسخ الاحتياطي          | PASS_SOURCE                     | Android backup معطّل لتقليل نسخ جلسات وبيانات WebView الحساسة                                                                            |
| سياسة الخصوصية           | PASS_SOURCE / VERIFY_PRODUCTION | `/privacy` عام في المصدر؛ يجب نشره وفحص HTTP 200 من خارج الحساب                                                                          |
| حذف الحساب داخل التطبيق  | PASS_SOURCE / PHYSICAL_PENDING  | يدعم حساب البريد وحساب OAuth؛ يجب اختبار حذف فعلي لحسابين تجريبيين                                                                       |
| حذف الحساب خارج التطبيق  | PASS_SOURCE / VERIFY_PRODUCTION | `/data-deletion` يوضح البريد وما يُحذف ولا يتطلب إعادة تثبيت التطبيق                                                                     |
| Data safety              | HOLD_OWNER_CONSOLE              | مسودة جرد موجودة؛ يلزم تحقق المزودين وإقرار مالك الحساب في Play Console                                                                  |
| الإعلانات                | PASS_SOURCE / DECLARE_CONSOLE   | لا SDK إعلاني؛ اختر No في Ads declaration بعد فحص AAB النهائي                                                                            |
| المدفوعات                | PASS_CURRENT_RELEASE            | الإصدار مجاني وكل مسارات الطالب للدفع مغلقة؛ أي تفعيل لاحق يحتاج مراجعة سياسة Payments وتنفيذ المسار المسموح                             |
| Target audience          | HOLD_OWNER_LEGAL                | المقترح 13–15 و16–17 و18+ لطلاب الثانوية؛ اختيار القاصرين قد يُدخل Families policy حسب البلد                                             |
| Content rating           | HOLD_CONSOLE                    | تعبئة IARC بدقة؛ التطبيق تعليمي ولا توجد مقامرة/عنف، مع تأكيد أي محتوى ينشئه المستخدم                                                    |
| App access               | HOLD_OWNER_SECRET               | إنشاء حساب مراجع ثابت، صالح عالميًا، دون OTP؛ يدخل في Play Console فقط                                                                   |
| Store listing النصي      | PASS_DRAFT                      | النص العربي في `STORE-LISTING-AR.md` ضمن الحدود                                                                                          |
| Store icon               | PASS_APPROVED_SOURCE            | PNG ‏512×512 أقل من 1MB، مولّدة من الشعار الذي اعتمده المالك ببصمة مصدر ثابتة                                                            |
| Feature graphic          | TECH_PASS / VISUAL_REVIEW       | PNG ‏1024×500 دون alpha موجود في `docs/mobile/google-play/assets/feature-graphic-1024x500.png`؛ يلزم فحص العرض النهائي في Play Console   |
| Phone screenshots        | BLOCKED_FINAL_BUILD             | يلزم لقطتان على الأقل من AAB النهائي؛ المرفقات الحالية سطح مكتب وليست دليل Android نهائيًا                                               |
| App Links / Google OAuth | HOLD_EXTERNAL                   | نشر `assetlinks.json` ببصمة Play App Signing ثم `autoVerify=true` واختبار جهاز حقيقي                                                     |
| Internal testing         | HOLD_CONSOLE                    | رفع AAB الموقّع ثم اختبار التثبيت والتحديث والمسارات الحرجة                                                                              |
| Closed testing           | CONDITIONAL_HOLD                | للحساب الشخصي المنشأ بعد 2023-11-13: 12 مختبرًا منضمًا باستمرار 14 يومًا                                                                 |
| Pre-launch report        | HOLD_AFTER_UPLOAD               | تشغيل التقرير وإغلاق crashes/ANRs/accessibility blockers قبل Production                                                                  |
| Developer identity       | HOLD_ACCOUNT_CHECK              | تحقق الهوية ووسائل الاتصال؛ للحساب المؤسسي قد يلزم D-U-N-S. راجع تسجيل package قبل 2026-09-30                                            |
| النشر الإنتاجي           | HOLD                            | لا يتم قبل إغلاق جميع حالات HOLD/BLOCKED أعلاه                                                                                           |

## أوامر الإصدار المعتمدة

إنشاء مفتاح الرفع يتم مرة واحدة خارج المستودع، مع نسخة احتياطية آمنة. لا يُستخدم مفتاح Play App Signing الذي تحتفظ به Google كمفتاح رفع محلي.

```bash
node node_modules/@capacitor/cli/bin/capacitor sync android
cd android
./gradlew bundleRelease --stacktrace
jarsigner -verify -strict app/build/outputs/bundle/release/app-release.aab
cd ..
bash scripts/mobile/verify-play-aab.sh android/app/build/outputs/bundle/release/app-release.aab
```

البناء `bundleRelease` يفشل مغلقًا إذا غاب `android/keystore.properties` أو كانت خصائصه ناقصة أو كان ملف المفتاح غير موجود.

## ترتيب الإغلاق

1. يعتمد المالك نوع حساب Play والهوية القانونية واسم المطور ووسائل الاتصال.
2. ينشئ Upload key خارج Git، يملأ أسرار CI، ثم يشغّل Signed Play testing AAB يدويًا.
3. ينشئ تطبيق Play بالحزمة المحددة ويفعّل Play App Signing؛ لا يُرفع أكثر من إصدار تجريبي بالـversionCode نفسه.
4. يأخذ SHA-256 من شهادة **App signing key certificate** في Play Console، لا من Upload key، وينشر `/.well-known/assetlinks.json`.
5. بعد تحقق App Links، يُغيّر `autoVerify` إلى `true` في دفعة مصدر منفصلة ويُعاد بناء AAB.
6. ينشر سياسة الخصوصية وصفحة الحذف، ثم يفحصهما من نافذة خاصة وشبكة خارجية.
7. ينشئ بيانات مراجع، يعبئ App content وData safety وTarget audience وContent rating.
8. يفحص الأيقونة وFeature graphic المعتمدتين داخل Play Console، وينتج لقطات هاتف من Internal testing.
9. ينفذ جلسة جهازين: Android 9/API 28 أو قريب من الحد الأدنى، وAndroid 16/API 36، مع RTL وضعف الشبكة وoffline وOAuth والحذف.
10. يرفع إلى Internal testing، يشغّل Pre-launch report، ثم Closed testing عند انطباق شرط الحساب.

## سيناريوهات الجهاز الحاسمة

- تثبيت جديد، ترقية فوق إصدار سابق، تشغيل أول، ورجوع من الخلفية.
- دخول بالبريد ودخول Google والعودة إلى التطبيق دون بقاء Chrome مفتوحًا.
- الرئيسية، المواد، درس منشور، اختبار، التقدم، تنزيل كتاب، فتحه دون إنترنت.
- حذف حساب بريد وحساب Google ثم التأكد أن إعادة الدخول لا تعيد البيانات المحذوفة.
- طالب عادي لا يرى الإدارة أو الأكاديمية، ولا يصل إلى دفع/محفظة فعالة حتى عبر رابط مباشر.
- تدوير الشاشة، تكبير الخط، قارئ الشاشة، شريط التنقل السفلي، ومناطق الأمان.

## دليل التحقق المحلي لهذه الدفعة

| البوابة                                    | النتيجة                                                                      |
| ------------------------------------------ | ---------------------------------------------------------------------------- |
| Google Play + mobile/theme focused         | 61/61 PASS                                                                   |
| Subject hierarchy + ministerial track UX   | 27/27 PASS                                                                   |
| Maintained Vitest inventory                | 341/341 PASS                                                                 |
| Node/Web contract suite                    | 255/255 PASS                                                                 |
| PWA policy                                 | 7/7 PASS                                                                     |
| TypeScript                                 | PASS                                                                         |
| ESLint                                     | PASS — 0 errors، 26 baseline warnings                                        |
| Production web build                       | PASS                                                                         |
| Android release signing gate runtime       | HOLD_ENV — Gradle distribution غير مخزنة محليًا والشبكة المقيدة تمنع تنزيلها |
| Android debug/signed AAB after this change | HOLD_CI — يجب تشغيل Android CI؛ لا يُعاد استخدام AAB سابق كدليل لهذه الدفعة  |
| Approved logo source and generated assets  | PASS — Web/PWA/Android/Play icon + feature graphic                           |
| Visual/physical Android                    | HOLD_DEVICE_AND_PHONE_SCREENSHOTS                                            |

لم تُنفذ كتابة قاعدة بيانات أو نشر أو رفع Play أو تغيير OAuth أو `assetlinks.json` إنتاجي.

## المصادر الرسمية

- Target API: https://support.google.com/googleplay/android-developer/answer/11926878
- App bundles: https://developer.android.com/guide/app-bundle
- App signing: https://developer.android.com/studio/publish/app-signing
- 16 KB page size: https://developer.android.com/guide/practices/page-sizes
- App content/review: https://support.google.com/googleplay/android-developer/answer/9859455
- App access credentials: https://support.google.com/googleplay/android-developer/answer/15748846
- Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- Account deletion: https://support.google.com/googleplay/android-developer/answer/13327111
- Target audience: https://support.google.com/googleplay/android-developer/answer/9867159
- Store assets: https://support.google.com/googleplay/android-developer/answer/9866151
- Payments policy: https://support.google.com/googleplay/android-developer/answer/9858738
- Closed testing: https://support.google.com/googleplay/android-developer/answer/14151465
- Developer account information: https://support.google.com/googleplay/android-developer/answer/13628312
- Android developer verification: https://developer.android.com/developer-verification/guides/google-play-console
