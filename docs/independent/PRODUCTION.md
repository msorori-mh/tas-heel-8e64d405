# استضافة الإنتاج المستقلة

هذا الإعداد يتيح بناء الإنتاج للنطاق النهائي دون تحويل نسخة الاختبار أو تغيير بيانات المصدر. التحويل نفسه يحتاج قبول التطبيق ومزامنة أخيرة أثناء إيقاف الكتابة في المصدر.

## الخدمة

- Node.js 22 أو أحدث.
- البناء: `npm ci && npm run build:independent && node scripts/independent/verify-build.mjs`.
- التشغيل: `npm run start:independent`.
- `TAMKEEN_DEPLOYMENT_ENV=production`.
- `TAMKEEN_PRODUCTION_ORIGIN=https://studentamkeen.com`.
- أزل `TAMKEEN_STAGING_ORIGIN` من خدمة الإنتاج. لا تغير متغيرات خدمة الاختبار.
- ضع مفتاح خادم Supabase الهدف `yjpirilbpqxtmnayruht` في سر `SUPABASE_SERVICE_ROLE_KEY` فقط؛ لا تستخدم VITE_ للأسرار.

الإنتاج يرفض أي نطاق آخر أو بيانات اعتماد داخل العنوان. فحص بدء الخادم يرفض بناء اختبار أو مشروع قاعدة بيانات مختلفًا أو مفتاح خادم غير مقبول. يبقى حظر منصة Lovable ومشروع المصدر فعالًا.

## التحقق والتحويل

`independent-release.json` يسجل environment=production وproductionOrigin ومعرف التطبيق الإنتاجي. للتحقق من الإصدار بعد تهيئة المضيف استخدم `node scripts/independent/verify-deployment.mjs` مع نفس إعدادات الإنتاج و`TAMKEEN_EXPECTED_SHA` المطابق تمامًا للالتزام المنشور. الاستجابة تحمل `X-Tamkeen-Environment: independent-production`.

قبل DNS، جهّز النطاق وTLS لدى الاستضافة، وسجل الحالة الحالية، وأبق سجلات بريد Hostinger دون تغيير. تأكد من السماح بروابط Google /auth/callback و/auth/mobile-callback و/academy/callback في Supabase الهدف. خدمة الاختبار وبناء Android الخاص بها يظلان منفصلين؛ هذه التغييرات لا تنشر APK أو Google Play ولا تثبت اختبار هاتف فعلي.

عند نافذة التحويل: أوقف كتابة المصدر، التقط المقارنة الأخيرة وانقل الفروق مع حماية كتابات الهدف، ثم تحقق وحوّل النطاق. عند التراجع احتوِ الكتابات الجديدة وصالحها قبل إعادة توجيه الزيارات؛ DNS وحده ليس استعادة للبيانات.
