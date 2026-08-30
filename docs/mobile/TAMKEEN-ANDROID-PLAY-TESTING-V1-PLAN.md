# تمكين الطالب — خطة Android Play Testing V1

## القرار

النسخة الأولى مبنية على Capacitor وتعرض مصدر الإنتاج الآمن
`https://studentamkeen.com` داخل غلاف Android، مع صفحة Offline محلية. لا توجد
نسخة ثانية من منطق الأعمال ولا مفاتيح Supabase داخل تطبيق أصلي منفصل.

## هوية الإصدار

- Package: `app.studentamkeen.tamkeen`
- Name: `تمكين الطالب`
- Version code: `1`
- Version name: `1.0.0`
- Minimum Android: API 24
- Compile/target: API 36
- Cleartext HTTP: disabled
- Mixed content: disabled

اعتبارًا من 31 أغسطس 2026، يجب أن تستهدف التطبيقات الجديدة Android 16 / API
36؛ لذلك لا يجوز تخفيض `targetSdkVersion` عن 36:
<https://support.google.com/googleplay/android-developer/answer/11926878>

## مسار الاختبار المطلوب

1. Internal testing لفحص التثبيت والتسجيل والدرس والاختبار والتنزيل على أجهزة فعلية.
2. Closed testing بعد إغلاق الأعطال الحرجة.
3. إذا كان حساب المطور شخصيًا وأُنشئ بعد 13 نوفمبر 2023: إبقاء 12 مختبرًا
   منضمين بصورة متصلة 14 يومًا قبل طلب الوصول إلى Production:
   <https://support.google.com/googleplay/android-developer/answer/14151465>

## التوقيع

Google Play App Signing هو المسار المعتمد. مفتاح الرفع RSA 2048 أو أعلى يبقى
خارج Git، ويُمرر إلى GitHub Actions عبر الأسرار التالية:

- `ANDROID_UPLOAD_KEYSTORE_BASE64`
- `ANDROID_UPLOAD_KEYSTORE_PASSWORD`
- `ANDROID_UPLOAD_KEY_ALIAS`
- `ANDROID_UPLOAD_KEY_PASSWORD`

المصدر: <https://support.google.com/googleplay/android-developer/answer/9842756>

تشغيل workflow يدويًا دون الأسرار الأربعة يفشل مغلقًا ولا ينتج AAB موقّعًا.

## بوابات قبل رفع AAB

- اختيار أيقونة الهوية النهائية واستبدال أصول Android/PWA المؤقتة.
- نجاح Android CI على API 36.
- نجاح `jarsigner -verify -strict`.
- استخراج SHA-256 لشهادة **App signing key certificate** من Play Console، وليس شهادة Upload key.
- نشر `/.well-known/assetlinks.json` بالبصمة الحقيقية فقط.
- تحويل HTTPS callback إلى `autoVerify=true` بعد نجاح التحقق من النطاق.
- فحص OAuth على جهاز فعلي وعدم فتح Chrome بعد العودة للتطبيق.
- تعبئة Data safety، تصنيف المحتوى، سياسة الخصوصية، البريد الداعم ولقطات المتجر.

## معيار PASS للنسخة الاختبارية

- AAB موقّع من workflow المعتمد.
- قبول Play Console للحزمة وAPI 36 دون تحذير مانع.
- تثبيت من رابط الاختبار على جهازين على الأقل.
- تسجيل الدخول والخروج والعودة من Google OAuth تعمل.
- فتح درس منشور، HTML تفاعلي، اختبار، PDF، وحالة Offline تعمل دون crash.
- لا تظهر لوحة الإدارة لطالب عادي.
- لا بيانات اختبارية متبقية في الإنتاج.
