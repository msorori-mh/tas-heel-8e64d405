# TAMKEEN — First Offline Open Closure (21B3)

الحالة السابقة: 21B2 = PASS_WITH_ONE_OPEN_ITEM (FIRST_OFFLINE_OPEN_AFTER_DOWNLOAD)

الحكم النهائي: **PASS_READY_FOR_OFFLINE_PREFETCH_DEPLOY_GATE**
(مع `PENDING_PHYSICAL_ANDROID_VERIFY` — لا يُحتسب فشل كود)

---

## 1. مراجعة prefetch المضاف بعد 21B2

`prefetchPdfViewerChunk()` السابق كان best-effort فقط:
- يطلق استيراد الحزم دون انتظار أو تحقق من النجاح،
- لا يجلب worker الخاص بـ pdf.js (وهو أول ما يفشل دون إنترنت)،
- لا يمنع عرض شارة «محفوظ للاستخدام دون إنترنت» قبل جاهزية القارئ.

النتيجة: الحالة `PDF_READY=YES / READER_READY=NO` كانت تُعرض للطالب كأنها جاهزة.

## 2. Reader runtime assets المطلوبة للفتح Offline

| المحرك | الأصول المطلوبة | التجهيز |
| --- | --- | --- |
| ANDROID_NATIVE | مكوّن النشر + الجسر Capacitor (مضمّن في APK) | لا شيء يُجلب — جاهز دائماً |
| BROWSER_NATIVE | route/entry chunk + `BrowserNativePdfDelivery` chunk | dynamic import |
| PDFJS | entry chunk + `PdfViewer` chunk + محرك `pdfjs-dist` + `pdf.worker.min.mjs` (asset مجزّأ بالهاش) | dynamic import + `fetch(workerUrl)` لتخزينه في SW static cache |
| CSS | Tailwind مجمّع في CSS الرئيسي المُحمّل مسبقاً | لا يحتاج تجهيزاً إضافياً |
| WASM | لا يوجد — لا نستخدم بناء pdf.js بـ WASM | — |

التنفيذ في `src/lib/pdf/reader-runtime.ts` (`ensureReaderReady` / `isReaderReady`)،
مع بصمة جاهزية مخزّنة محلياً مفتاحها عنوان worker المُجزّأ بالهاش، فيبطل تلقائياً عند أي نشر جديد.

## 3. تعريف OFFLINE_READY

```
OFFLINE_READY = PDF_READY && READER_READY
```
شارة «محفوظ للاستخدام دون إنترنت» لا تظهر إلا عند تحقق الشرطين
(`SubjectTextbooksSheet.tsx`: `const offlineReady = pdfReady && readerReady`).

## 4. حالة PDF جاهز والقارئ غير جاهز

- لا إعادة تنزيل للملف إطلاقاً (`reader-runtime` لا يستدعي `resolveLessonFile` ولا `downloadTextbook`).
- زر «تجهيز القارئ» يعيد المحاولة لأصول القارئ فقط.
- النص المعروض: «الملف محفوظ · القارئ غير جاهز للعمل دون إنترنت»، و`OFFLINE_READY=NO`.

## 5. اختبار Production-like

- `tsgo --noEmit` → PASS
- `vite build` (نسخة إنتاجية كاملة) → PASS (exit 0)
- سيناريو Playwright (`fresh context → student session → /semesters/1 → كتب المنهج → تنزيل → دون فتح → set_offline(true) → أول فتح`):
  - ظهرت شارة OFFLINE_READY بعد اكتمال التنزيل + تجهيز القارئ،
  - أول فتح **بدون إنترنت** نجح: عُرض «القرآن الكريم وعلومه — الجزء الأول»، صفحة 1 من 66، نصوص عربية سليمة، تكبير 110%، وشارة «محفوظ للاستخدام دون إنترنت».
  - لا رسالة خطأ، والوحيد في الكونسول هو `ERR_INTERNET_DISCONNECTED` المتوقع لطلبات الشبكة الجانبية.

**FIRST_OFFLINE_OPEN_WEB = PASS**

ملاحظة: البداية الباردة الكاملة (إغلاق التطبيق ثم فتحه بلا شبكة) تعتمد على تنقّل الـ SW،
وهو خارج نطاق 21B3 (لا تعديلات على سياسة الـ Service Worker في هذه المرحلة).

## 6. Android

لا يوجد جهاز فعلي متاح في بيئة التنفيذ:

- FIRST_OFFLINE_OPEN_ANDROID = PENDING_PHYSICAL_ANDROID_VERIFY
- NATIVE_PDF_RENDERER = PENDING_PHYSICAL_ANDROID_VERIFY
- ARABIC_FIDELITY = PENDING_PHYSICAL_ANDROID_VERIFY
- ZOOM = PENDING_PHYSICAL_ANDROID_VERIFY
- LAST_PAGE = PENDING_PHYSICAL_ANDROID_VERIFY

منطقياً مسار Android لا يعتمد على أي أصل يُجلب من الشبكة (المحرك داخل APK)،
لذا `READER_READY=YES` دائماً هناك، ويبقى التحقق الميداني مطلوباً فقط.

## 7. نطاق التغيير

- لا تغييرات: DB / Migration / RLS / RPC / Storage / صفوف الكتب.
- الملفات المتأثرة: `src/lib/pdf/reader-runtime.ts` (جديد)،
  `src/components/lessons/InAppPdfDelivery.tsx`،
  `src/components/textbooks/SubjectTextbooksSheet.tsx`،
  `tests/student/textbook-first-offline-open-21b3.static.test.mjs` (جديد).

## 8. مراجعة أمنية

- لا مسارات شبكة جديدة عدا جلب أصل build عام مُجزّأ بالهاش (نفس الأصل، لا اعتماديات).
- لا توكنات ولا روابط تخزين ولا معرفات مستخدم في التخزين المحلي الجديد
  (القيمة المخزّنة = عنوان أصل build فقط).
- لا تعديل على بوابات RLS أو تسليم الملفات الآمن.

## الحكم

**PASS_READY_FOR_OFFLINE_PREFETCH_DEPLOY_GATE** — بانتظار
`APPROVED_21B3_OFFLINE_PREFETCH_DEPLOY` قبل النشر،
مع بند ميداني مفتوح: `PENDING_PHYSICAL_ANDROID_VERIFY`.
