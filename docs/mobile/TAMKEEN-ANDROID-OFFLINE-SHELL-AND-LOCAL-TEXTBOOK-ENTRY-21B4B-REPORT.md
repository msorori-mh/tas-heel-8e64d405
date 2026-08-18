# TAMKEEN — Android Offline Shell & Local Textbook Entry (21B4-B)

النطاق: تنفيذ + اختبارات محلية/ثابتة + تحضير بناء Android فقط. **لا نشر إنتاجي، لا ترحيل قاعدة بيانات، لا كتابة بيانات، لا تعديل schema، لا مساس بالكتب السبعة، ولا merge قبل البوابة.**

## G0 — SOURCE LOCK

| البند | القيمة |
| --- | --- |
| START_HEAD | `fc6caeed864a6658dd9ba452da92b548deb44a88` ✅ مطابق للـ HEAD المعتمد |
| Branch | `edit/edt-f17285f9-67a2-45f0-ab54-fe0775843dbf` (منهجية المستودع تدير الفروع تلقائياً؛ لم يُنشأ فرع يدوي) |
| END_HEAD | نفس شجرة العمل + تغييرات 21B4-B غير المدموجة (تُختم عند البوابة) |
| `git status` قبل البدء | نظيف |

## الملفات المتغيّرة

| الملف | التغيير |
| --- | --- |
| `src/lib/offline/local-textbook-registry.ts` | **جديد** — سجل الكتب المحلي (app-private) + `sanitizeRecord` + `computeSha256` |
| `src/lib/textbooks/subject-textbook-client.ts` | تسجيل الكتاب بعد نجاح التنزيل، وإلغاء التسجيل عند الحذف |
| `src/components/textbooks/SubjectTextbooksSheet.tsx` | مزامنة `offlineReady` عند نجاح/فشل تجهيز القارئ (سطران فقط؛ لا تغيير UX — مؤجَّل لـ21B4-D) |
| `android/.../TamkeenPdfViewerPlugin.java` | `openTextbook({textbookId})` + `listSavedTextbooks()` + تشديد `open()` بـ canonical-path |
| `mobile/www/index.html` | **Tamkeen Offline Entry** بدل صفحة نصية ساكنة |
| `capacitor.config.ts` | `server.errorPath: "index.html"` |
| `tests/mobile/android-offline-shell-21b4b.static.test.mjs` | **جديد** — 12 حارساً ثابتاً |
| `docs/mobile/…-21B4B-REPORT.md` | هذا التقرير |

## المعمارية — قبل / بعد

**قبل:** الغلاف يحمّل `https://studentamkeen.com` فقط. عند فقد الشبكة تظهر `chrome-error://chromewebdata` بلا جسر Capacitor ⇒ `Cannot read properties of undefined (reading 'triggerEvent')`، والكتاب المحفوظ يصبح غير قابل للوصول رغم وجوده على القرص.

**بعد:** يبقى الأصل البعيد هو المصدر الرئيسي عند توفر الشبكة. عند فشل تحميله يحمّل Android الصفحة المضمّنة داخل الـ APK (`errorPath`)، وهي سطح استرداد أدنى فقط: تعريف بعدم الاتصال، قائمة «كتبك المحفوظة»، فتح Native، وإعادة المحاولة. **لا SPA، لا نسخة ثانية من التطبيق، لا نظام محتوى Offline ثانٍ.**

## عقد السجل (Local Textbook Registry)

المسار: `files/tamkeen/registry/textbooks.json` (app-private، يُحذف مع إلغاء التثبيت).

```
{ registryVersion, updatedAt, books: [{
  textbookId, title, subjectId, subjectLabel, bookType,
  coverageLabel, localPath, version, sha256, fileSize,
  downloadedAt, offlineReady }] }
```

- `sanitizeRecord` هو الكاتب الوحيد ويُسقط أي مفتاح خارج `REGISTRY_ALLOWED_FIELDS`.
- ممنوع مطلقاً: access/refresh token، كلمة مرور، signed URL، service role، مفاتيح تخزين، أو أي بيانات طالب حساسة — يوجد حارس اختبار يمنع تسرّبها.
- `localPath` دائماً نسبي داخل `Directory.Data`، ولا يُصدَّر أبداً إلى طبقة HTML.
- `OFFLINE_READY = PDF_READY && READER_READY` (`isReaderReady()`؛ على Android القارئ الأصلي داخل الـAPK ⇒ true). التنزيل الفاشل/الملغى لا يُسجَّل، والحذف الرسمي يُلغي التسجيل مباشرة بعد حذف البايتات.

## الحد الأمني الأصلي (Native Security Boundary) — fail-closed

`openTextbook({ textbookId })` لا يقبل مساراً إطلاقاً؛ يحلّ المعرّف مقابل السجل الموثوق ويرفض ما لم تتحقق كل الشروط:

1. الكتاب موجود في السجل ومعرّفه مطابق.
2. `offlineReady === true`.
3. `localPath` نسبي، بلا `..` وبلا `://` وبلا `/` بادئة.
4. `getCanonicalPath()` يقع فعلاً داخل `getFilesDir()` (منع traversal/symlink).
5. الملف موجود وحجمه > 0.
6. `fileSize` المسجّل يطابق حجم الملف على القرص (رفض التنزيل الجزئي).

عند أي فشل: لا يُفتح شيء، وتعرض الصفحة: «تعذر فتح النسخة المحفوظة. اتصل بالإنترنت وأعد تنزيل الكتاب.»
`sha256` يُسجَّل عند التنزيل (best-effort ≤ 80MB) للتحقق المستقبلي؛ **لم يُفعَّل تحقق تجزئة عند كل فتح** تجنباً لكلفة قراءة عشرات الميغابايت في كل مرة — التحقق الحالي بالحجم + المسار الموثوق.

## سلوك Offline Entry

عربية RTL، بلا أي أصل بعيد (لا خطوط/صور/JS/CSS خارجية، لا fetch، لا Supabase، CSP محلي `default-src 'self'`). المكوّنات: العنوان «تمكين»، «أنت غير متصل بالإنترنت…»، قسم «كتبك المحفوظة» (عنوان + المادة/النوع/الفصل + زر أساسي «فتح الكتاب»)، رسالة فراغ صريحة، وزر «إعادة المحاولة» الذي يعيد الملاحة إلى الأصل.

**Root cause لـ `triggerEvent`:** الاستدعاء على صفحة خطأ Chrome لم يُحقن فيها جسر Capacitor (`window.Capacitor` غير معرّف). الإصلاح ضمن النطاق فقط: (أ) لم تعد صفحة خطأ Chrome تُعرض أصلاً بفضل `errorPath`، (ب) الصفحة الجديدة تتحقق من الجسر قبل أي استدعاء وتتراجع إلى حالة الفراغ بدل الانهيار.

## دورة الحياة

| الحالة | النتيجة المتوقعة | التغطية الآن |
| --- | --- | --- |
| A — foreground ثم Airplane ثم فتح كتاب | التطبيق المحمّل يفتح الكتاب من الكاش الأصلي (المسار القديم سليم) | Static ✅ / يحتاج جهاز |
| B — background ثم Airplane ثم resume | إن لم تُعد الملاحة يبقى DOM قائماً؛ وإن أُعيد التحميل وفشل ⇒ Offline Entry | يحتاج جهاز |
| C — Activity recreation دون شبكة | Offline Entry من الـAPK ⇒ فتح الكتاب | يحتاج جهاز |
| D — cold launch دون شبكة (الفجوة الميدانية) | Offline Entry ⇒ «كتبك المحفوظة» ⇒ فتح Native | **المستهدف الأساسي** — يحتاج جهاز |

## معالجة الأخطاء

سجل فارغ / سجل تالف (JSON غير صالح) / ملف مفقود / ملف جزئي / الملحق غير متاح / فشل فتح PDF ⇒ جميعها مسارات محكومة تنتهي إما بحالة الفراغ أو برسالة خطأ عربية واحدة. لا crash، لا WebView فارغ، ولا صفحة `chrome-error` كواجهة نهائية.

## الاختبارات والنتائج

- `tsgo --noEmit` → **نظيف**.
- `vitest tests/mobile/android-offline-shell-21b4b.static.test.mjs` → **12/12 PASS** (يغطي البنود 1–9 المطلوبة).
- Regression: `vitest tests/student tests/mobile tests/pwa` → **73 tests PASS**، ومنها 21B3 (`textbook-first-offline-open-21b3`) و18C2 (`native-pdf-renderer-18c2`) **PASS**. ملفان (`service-worker-policy.static`, `direct-lesson-without-unit-13e.static`) يُبلغان "No test suite found" لأنهما سكربتات `node:test` قديمة — وضع سابق للتغيير وغير متأثر به.
- `bunx cap sync android` → **نجح**؛ نُسخت الصفحة المضمّنة إلى `android/app/src/main/assets/public/index.html` وظهر `"errorPath": "index.html"` في `capacitor.config.json` المولّد.
- `assembleDebug` → **PENDING_PHYSICAL_ANDROID_RETEST**: لا يوجد Android SDK/JDK في بيئة Lovable (`ANDROID_HOME` غير معرّف). لا يُعدّ فشلاً.

## حراس عدم الانحدار

ONLINE_APP=UNCHANGED · AUTH_ONLINE=UNCHANGED · SUBJECT_TEXTBOOK_SECURITY=UNCHANGED · 7_PRODUCTION_BOOKS=UNCHANGED (لا كتابة/حذف بيانات) · LESSON_RESOURCES=UNCHANGED · STRUCTURED_QURAN_LESSON=UNCHANGED · 18B_DYNAMIC_LESSON_UX=UNCHANGED · لا تغيير في RLS/RPC/Schema/Curriculum.

## القيود المعروفة

1. لا تحقق sha256 عند كل فتح (بديله: مسار موثوق + مطابقة الحجم).
2. السجل يعمل على Android فقط؛ على الويب لا وجود لسطح استرداد داخل الحزمة (خارج النطاق).
3. الكتب التي نُزّلت قبل هذا الإصدار غير مسجَّلة؛ ستظهر بعد أول «تحديث/إعادة تنزيل» أو بعد فتح قائمة الكتب مع تجهيز القارئ.
4. UX التنزيل/الفتح الكامل مؤجَّل إلى 21B4-D.
5. لم يُختبر شيء على جهاز فعلي في هذه المرحلة.

## إجراء الاختبار الفيزيائي (الجهاز R5CY246Q11J)

1. أزل أي نسخة سابقة، ثم ثبّت APK نظيفاً (`assembleDebug` من بيئة بها Android SDK بعد `bunx cap sync android`).
2. مع اتصال إنترنت: افتح تمكين وسجّل الدخول.
3. ادخل مادة ← «كتب المنهج» ← نزّل كتاباً حقيقياً واحداً.
4. انتظر ظهور «محفوظ للاستخدام دون إنترنت» (OFFLINE_READY).
5. **لا تفتح الكتاب.**
6. فعّل وضع الطيران.
7. أجبر إعادة الإنشاء: أغلق التطبيق من قائمة التطبيقات الأخيرة (Force stop) — سيناريو D.
8. أعد فتح تمكين.
9. تحقق: تظهر شاشة Offline Entry (وليس صفحة خطأ Chrome).
10. تحقق: الكتاب المُنزَّل يظهر تحت «كتبك المحفوظة».
11. اضغط «فتح الكتاب» (أول فتح على الإطلاق).
12. تحقق من الصفحة الأولى والوسطى والأخيرة.
13. تحقق من سلامة العربية (تشكيل/اتصال الحروف).
14. جرّب التكبير/التصغير.
15. ارجع (Back) وتأكد من العودة إلى Offline Entry دون انهيار.
16. أعد فتح الكتاب نفسه مرة ثانية.
17. اجمع اللوج: `adb logcat -s Capacitor:V Capacitor/Plugin:V TamkeenPdfViewer:V chromium:E AndroidRuntime:E`.

كرّر الخطوات 6–16 لسيناريو C (إعادة إنشاء Activity عبر تدوير الشاشة/تغيير اللغة) وB (خلفية ثم resume).

## FINAL VERDICT

**PASS_READY_FOR_PHYSICAL_ANDROID_RETEST** — بانتظار تصريح `APPROVED_21B4B_PHYSICAL_ANDROID_RETEST`. لا merge ولا deploy.
