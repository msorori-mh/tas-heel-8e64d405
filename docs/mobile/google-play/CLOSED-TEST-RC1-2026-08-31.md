# تمكين الطالب — مرشح Closed Testing RC1

التاريخ: 2026-08-31

## مرشح الإصدار

- التطبيق: تمكين الطالب
- الحزمة: `app.studentamkeen.tamkeen`
- `versionCode`: `1`
- `versionName`: `1.0.0`
- `compileSdk`: `36`
- `targetSdk`: `36`
- الفرع: `release/google-play-closed-test-v1`
- قاعدة الفرع: أحدث `main` وقت القطع (`ed897f339f267433cf5fa118afb1e849e03bab3e`)

## ما أُغلق في المصدر

- هوية التطبيق والحزمة ثابتة ومتطابقة في Capacitor وGradle وAndroid.
- الاسم الظاهر: «تمكين الطالب».
- Android 16 / API 36 مستهدف، وهو متطلب Google Play للتطبيقات الجديدة والتحديثات بدءًا من 31 أغسطس 2026.
- `minSdk 24`.
- لا صلاحيات حساسة في Android Manifest؛ الصلاحية الوحيدة `INTERNET`.
- النسخ الاحتياطي Android معطل، وHTTP cleartext معطل.
- النسخة الحالية مجانية ولا تحتوي SDK إعلانيًا أو Advertising ID.
- صفحات الخصوصية وحذف الحساب موجودة في مسارات عامة بالمصدر.
- نص المتجر العربي، أيقونة 512×512، وFeature Graphic 1024×500 جاهزة بالمستودع.
- Android CI يبني AAB تجريبيًا على API 36 ويفحص بنية الحزمة وبوابة 16 KB.
- مسار Release موقّع موجود في GitHub Actions ويفشل مغلقًا إذا غابت أسرار Upload key.

## الدليل الحالي

آخر تشغيل Android CI على رأس PR #168 (`9e16b445ca58a6e3c4ecb68ca2b44b70cb249a71`) نجح، وأنتج artifact باسم `tamkeen-android-debug-aab` بحجم يقارب 3.97 MB. هذا دليل بناء فقط وليس ملف Play النهائي لأن ملف الرفع يجب أن يكون Release موقّعًا بمفتاح Upload دائم.

## ما يلزم قبل أول رفع إلى Play Console

1. إنشاء Upload key دائم وآمن خارج Git، والاحتفاظ بنسخة احتياطية منه.
2. إضافة الأسرار الأربعة إلى GitHub Actions:
   - `ANDROID_UPLOAD_KEYSTORE_BASE64`
   - `ANDROID_UPLOAD_KEYSTORE_PASSWORD`
   - `ANDROID_UPLOAD_KEY_ALIAS`
   - `ANDROID_UPLOAD_KEY_PASSWORD`
3. تشغيل workflow `Android CI and Play bundle` يدويًا (`workflow_dispatch`).
4. تنزيل artifact `tamkeen-play-testing-v1-signed-aab` والتحقق من بصمته وحفظه كأثر إصدار.
5. إنشاء التطبيق في Play Console بالحزمة `app.studentamkeen.tamkeen` وتفعيل Play App Signing.
6. رفع AAB الموقّع إلى Internal testing أولًا، ثم Closed testing.
7. بعد إنشاء Play App Signing، أخذ SHA-256 من **App signing key certificate** ونشر `/.well-known/assetlinks.json` ثم تفعيل `autoVerify=true` في دفعة مصدر منفصلة.
8. إدخال App content: Data safety، Ads=No، App access، Target audience، IARC، وسياسة الخصوصية وحذف الحساب.
9. التقاط لقطات هاتف فعلية من النسخة المثبتة عبر Internal testing ورفعها للمتجر.
10. تشغيل Pre-launch report وإغلاق أي crash/ANR/blocker قبل بدء العدّ المغلق.

## فترة الاختبار المغلق

إذا كان حساب المطور **شخصيًا وتم إنشاؤه بعد 13 نوفمبر 2023**، فالوصول للإنتاج يتطلب Closed test فيه **12 مختبرًا على الأقل منضمين باستمرار لمدة 14 يومًا**. لذلك الهدف العملي بعد رفع RC1 هو بدء هذه المدة فورًا.

## لا نخلط Offline V2 بهذا الإصدار

مرحلة «تمكين بلا نت» الكاملة تبقى في فرع مستقل ولا تدخل RC1. بعد بدء فترة الاختبار، نعود إلى تنفيذ Offline-first مع SQLite وحزم المحتوى والمزامنة، ثم تُرفع كتحديث لاحق بـ `versionCode` أعلى.

## القرار

`SOURCE_READY / SIGNED_AAB_PENDING_UPLOAD_KEY_AND_PLAY_CONSOLE`
