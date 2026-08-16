# 18C — In-App PDF Viewer + Smart Offline Cache

مرحلة مستقلة بعد 18A (استرجاع المحتوى) و18B (Dynamic Lesson UX). لا تمس منطق الاستيراد ولا نموذج القدرات.

## القرار المعتمد

| البند | القرار |
|---|---|
| IN_APP_VIEWER | نعم |
| LOCAL OFFLINE STORAGE | نعم (App Private Storage) |
| DOWNLOAD_ON_FIRST_OPEN | نعم |
| REUSE_LOCAL_COPY | نعم |
| DOWNLOAD_SUBJECT_PACK | نعم |
| DOWNLOAD_GRADE_PACK | اختياري من الإعدادات |
| WI-FI PREFETCH | نعم (الدرس الحالي + درسين) |
| DOWNLOAD_ALL_PLATFORM | لا |
| EXTERNAL_BROWSER_DEFAULT | لا |
| VERSIONED_CACHE | نعم |

## عقبة معمارية يجب حلها أولاً

الوضع الحالي: ملفات الدروس روابط Google Drive تُفتح في iframe أو تبويب خارجي. المتصفح/الـWebView **لا يستطيع** تنزيل بايتات ملف Drive مباشرة (CORS + إعادة توجيه)، لذا لا يمكن بناء عارض داخلي أو تخزين محلي فوق رابط Drive كما هو.

الحل: مسار خادم وسيط (Proxy) يبقى Drive مجرد مصدر تخزين لا هوية محتوى:

```text
تمكين (Viewer)
  → GET /api/lesson-file/{resourceId}          (Bearer + can_access_lesson)
      → الخادم يتحقق من الصلاحية
      → يجلب البايتات من Drive أو من Supabase Storage الموقّع
      → يعيد application/pdf + ETag (نسخة الملف)
  → الجهاز يخزّن نسخة محلية خاصة بالتطبيق
```

الطالب لا يرى Drive إطلاقاً.

## المراحل

### 18C-1 — طبقة التسليم على الخادم
- مسار `src/routes/api/lesson-file.$resourceId.ts` (محمي، ليس تحت `/api/public`): يتحقق عبر `can_access_lesson` ثم يبثّ الملف.
- رأس `ETag` / `X-File-Version` مشتق من `updated_at` للمورد، ورأس `Content-Length` لعرض الحجم.
- دعم `HEAD` لجلب الحجم والنسخة فقط (لعرض «الحجم التقريبي» قبل تحميل المادة).
- إعادة استخدام منطق `getLessonFileUrl` الحالي لملفات Supabase Storage.

### 18C-2 — العارض داخل التطبيق
- `src/components/lessons/PdfViewer.tsx` باستخدام pdf.js (يعمل في الويب وفي WebView أندرويد بنفس الشيفرة، بلا كود أصلي).
- الميزات: تكبير/تصغير، تنقل الصفحات، «صفحة 3 من 8»، ملء الشاشة، رجوع للدرس، حفظ آخر صفحة (محلياً لكل مورد)، شارة «✓ محفوظ للاستخدام دون إنترنت».
- RTL + رموز التصميم الحالية، Mobile-first.
- استبدال `ExternalLessonDelivery` لملفات PDF بالعارض الداخلي؛ يبقى الفتح الخارجي كخيار احتياطي فقط عند فشل التنزيل.

### 18C-3 — مخزن الملفات المحلي
- `src/lib/offline/pdf-cache.ts` بواجهة واحدة وتنفيذين:
  - أندرويد: `@capacitor/filesystem` في `Directory.Data` (مساحة التطبيق الخاصة، غير ظاهرة في مدير الملفات).
  - الويب: IndexedDB / Cache Storage.
- فهرس محلي لكل مورد: `resource_id, local_path, downloaded_version, downloaded_at, file_size, last_opened_page`.
- منطق النسخ: إذا `server_version != downloaded_version` → النسخة المحلية STALE → تنزيل واستبدال. عند انقطاع الشبكة تُفتح النسخة القديمة مع تنبيه لطيف.
- سياسة مساحة: سقف افتراضي + إزالة الأقدم استخداماً، وزر «إفراغ المحتوى المحمّل» في الإعدادات.

### 18C-4 — مستويات التحميل
1. تلقائي عند فتح الدرس (الافتراضي).
2. زر «تحميل المادة للاستخدام دون إنترنت» في صفحة المادة، مع عدّاد «☁ غير محمّل / 📱 على الجهاز» والحجم التقريبي وتنبيه تفضيل Wi-Fi.
3. الإعدادات → «المحتوى دون إنترنت»: تحميل مواد الصف، عرض الحجم المستخدم، إدارة/حذف.
4. Prefetch للدرسين التاليين فقط عند Wi-Fi (`@capacitor/network`) ومساحة كافية.

### 18C-5 — الجاهزية والتحقق
- قاعدة الجاهزية تبقى كما أُقرّت في 18B: وجود PDF أساسي = STUDENT_READY، والملخص شرط لـ Quick Review فقط.
- تحقق ببروفة Playwright بحساب طالب حقيقي: فتح أول مرة (تنزيل)، فتح ثانٍ (0 شبكة)، وضع Offline، ونسخة محدّثة على الخادم.
- تقرير: `docs/mobile/TAMKEEN-IN-APP-PDF-AND-OFFLINE-CACHE-18C-REPORT.md`.

## تفاصيل تقنية

- بلا Migration في 18C-1..18C-4: نسخة الملف مشتقة من `lesson_resources.updated_at` والحجم من رأس الاستجابة. لو أردنا لاحقاً `sha256`/`file_size` مخزّنين، تُضاف كمرحلة صغيرة 18C-6 مع تحديث قيد مفاتيح `metadata` في تريغر 13F.
- حزم جديدة: `pdfjs-dist` (+ `@capacitor/filesystem`, `@capacitor/network`). لا كود أندرويد أصلي (`PdfRenderer` غير لازم لأن الغلاف WebView).
- الأمان: الملفات في مساحة التطبيق الخاصة فقط، وكل تنزيل يمر ببوابة `can_access_lesson`. هذا ليس DRM؛ عند تفعيل الاشتراكات تُضاف Entitlement check قبل فتح النسخة المحلية أيضاً (تُسجَّل كبند مفتوح).
- لا تغيير على RLS، ولا على محرك الاستيراد، ولا على منطق 18A/18B.

الحكم المستهدف: `TAMKEEN_IN_APP_PDF_AND_OFFLINE_CACHE_18C = PASS`.
