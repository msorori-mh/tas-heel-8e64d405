# TAMKEEN — Physical Android Field Review & Stabilization (21B4A)

نوع المرحلة: **AUDIT + IMPLEMENTATION PLAN فقط** — لا نشر، لا ترحيل قاعدة بيانات، لا كتابة بيانات، لا تعديل OAuth الإنتاجي، لا دمج قبل التقرير.

## G0 — SOURCE LOCK

| البند | القيمة |
| --- | --- |
| `git branch --show-current` | `edit/edt-f17285f9-67a2-45f0-ab54-fe0775843dbf` |
| `git rev-parse HEAD` | `fc6caeed864a6658dd9ba452da92b548deb44a88` |
| `git log -1 --oneline` | `fc6caeed أتمّ النشر والتحقق النهائي` |
| `git status` | نظيف (لا تعديلات غير مُتتبَّعة ذات صلة) |

HEAD الحالي **مطابق تماماً** للنسخة التي جرى عليها الاختبار الفيزيائي (`fc6caeed…`). لا يوجد انحراف مصدري ⇒ لا `BLOCKED_SOURCE_MISMATCH`، والتدقيق أدناه ينطبق حرفياً على البناء الذي شُغّل على الهاتف.

## VALIDATION (read-only)

- `tsgo --noEmit`: بدون أخطاء.
- `vitest tests/student/textbook-first-offline-open-21b3.static.test.mjs` + `native-pdf-renderer-18c2.static.test.mjs`: 16/16 PASS.
- لم تُعدَّل أي ملفات متتبَّعة في هذه المرحلة عدا هذا التقرير.

---

## جدول النتائج

| ID | Observation | Evidence | Root Cause | Severity | Affected Files | Security Impact | Offline Impact | Proposed Fix | Prod Config? | DB Migration? | Batch |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| OBS-01 | تطبيقان على الهاتف / ارتباك الهوية | `applicationId "app.studentamkeen.tamkeen"` وحيد في `android/app/build.gradle`؛ لا flavors ولا `applicationIdSuffix`؛ `versionCode 1 / versionName "1.0"`؛ اسم التطبيق «تمكين» عبر `@string/app_name` | البناء لا ينتج package إضافياً. التطبيق الثاني هو غلاف Lovable preview (`dev.lovable.build`) المثبّت يدوياً على الجهاز | Low (Release hygiene) | `android/app/build.gradle`, `android/app/src/main/res/values/strings.xml`, `capacitor.config.ts` | لا شيء | لا شيء | إزالة Lovable preview من جهاز الاختبار؛ توحيد `app_name`/`title_activity_main`/أيقونة واحدة؛ رفع `versionCode/versionName` وتوثيق قناة توزيع واحدة (نفس keystore) قبل أي تسليم للطلاب | لا | لا | 21B4-G |
| OBS-02 | Google Login يخرج المستخدم إلى تجربة متصفح ولا يعود إلى التطبيق | `src/routes/auth.tsx:32-56` يستخدم `signInWithOAuth` + `skipBrowserRedirect` ثم `window.location.href = url`؛ `redirectTo = getAuthRedirectUrl("/auth/callback")` = `https://studentamkeen.com/auth/callback`؛ `AndroidManifest.xml` لا يحوي أي `intent-filter` لـ `VIEW/BROWSABLE` (لا App Links ولا custom scheme)؛ `@capacitor/browser` و`@capacitor/app` مثبّتان لكن **غير مستخدمين** في أي مسار auth (لا `appUrlOpen` listener في المشروع) | لا يوجد مسار عودة أصلي: الـ WebView ينتقل إلى Google، ويتم استكمال الجلسة داخل سياق متصفح/WebView عام، بينما التطبيق لا يملك أي فلتر نوايا يلتقط `https://studentamkeen.com/auth/callback` أو `app.studentamkeen.tamkeen://` | **P0/P1 (High)** | `src/routes/auth.tsx`, `src/routes/auth.callback.tsx`, `src/lib/auth-helpers.ts`, `src/lib/authRedirects.ts`, `android/app/src/main/AndroidManifest.xml`, `capacitor.config.ts` | متوسط: بدون Custom Tab قد ينتهي الـ code في سياق غير التطبيق؛ يجب ألا يمرّ أي token عبر مسار قابل للاعتراض | لا شيء مباشر (لكن فشل الدخول يمنع أي تنزيل) | إدخال مسار native: `@capacitor/browser` (Chrome Custom Tab) + `App.addListener('appUrlOpen')` + `exchangeCodeForSession`، مع Deep Link عبر Android App Links على `https://studentamkeen.com/auth/callback` (مع `assetlinks.json`) أو custom scheme احتياطي؛ و`getAuthRedirectUrl` يصبح platform-aware | **نعم** (إضافة redirect URL في إعداد المصادقة + استضافة `assetlinks.json`) — مؤجَّل خارج 21B4A | لا | 21B4-C |
| OBS-03 | الصفحة الرئيسية طويلة ومشتتة | `src/routes/_authenticated/app.tsx` يرصّ 8 أقسام: `WelcomeCard`, `HomeSubscriptionBanner`, `ContinueSection`, `TodayMissionCard`, `LearningToolsSection`, `ProgressSummary`, `SemesterPicker`, ثم شبكة `AchievementsSection` + `AiAssistantCard` | الترتيب يطابق FM V2 أساساً، لكن يوجد ازدواج معلوماتي (`ContinueSection` ↔ `TodayMissionCard` يستهلكان نفس `continueItems`) وبطاقات ذيلية بلا فعل واضح على شاشة الهاتف (`AchievementsSection`, `AiAssistantCard`, `MotivationFooter`) وتباعد رأسي كبير | P1 | `src/routes/_authenticated/app.tsx`, `src/components/home/*` | لا شيء | لا شيء | تبسيط Mobile-first فقط: دمج الهدف اليومي داخل بطاقة «تابع التعلم»، إخفاء zero-state بلا action، طيّ الإنجازات/المساعد داخل قسم قابل للتوسيع أو `lg:` فقط، تقليص `space-y` وضغط `WelcomeCard`. لا إعادة تصميم | لا | لا | 21B4-F |
| OBS-04 | تجربة تنزيل الكتاب مربكة | `src/components/textbooks/SubjectTextbooksSheet.tsx`: زر «قراءة الآن» يظهر في حالة `NOT_DOWNLOADED` بجانب «تنزيل»، وبعد الجاهزية تظهر 4 أزرار بنفس الوزن البصري («فتح»، «تجهيز القارئ»، «تحديث»، «حذف من الجهاز»)؛ حالتا `PDF_READY` و`READER_READY` تُشرحان بنص صغير فقط | ضعف تسلسل هرمي للأزرار وغياب CTA أساسي واحد؛ الحذف بمستوى الفتح نفسه | P1 | `src/components/textbooks/SubjectTextbooksSheet.tsx`, `src/components/lessons/InAppPdfDelivery.tsx`, `src/lib/pdf/reader-runtime.ts`, `src/lib/textbooks/subject-textbook-client.ts` | لا شيء | إيجابي: توضيح الفرق بين downloaded و offline-ready يقلل محاولات الفتح الفاشلة | تطبيق تعاقد الحالات الأربع حرفياً؛ CTA أساسي وحيد «فتح الكتاب»؛ نقل «حذف» و«تحديث» إلى قائمة (…)؛ إزالة «قراءة الآن» من حالة عدم التنزيل أو تحويلها لرابط ثانوي؛ شريط تقدم بنسبة + حجم | لا | لا | 21B4-D |
| OBS-05 | «نسخة الكتاب الأصلية» ما زالت داخل رحلة الدرس | `src/lib/lessons/lesson-content-contract.ts:40,56,69,82,460-482` يُبقي `originalBookPdf` ضمن `LESSON_CONTENT_CAPABILITIES` و`STUDENT_CAPABILITY_ORDER` (العنصر 10)؛ `src/routes/_authenticated/lessons.$lessonId.tsx:550-572` يحسب `originalPdfGateOpen` و`showOriginalBookPdf` (منطق 20D §8) | المعمارية انتقلت إلى Content V3 (الكتاب على مستوى المادة عبر `subject_textbooks`) لكن العقد ما زال يعرّف القدرة العاشرة ويُدخلها في `studentVisibleContract` وبالتالي في `computeLessonProgress`/readiness | P1 (Architecture drift) | `src/lib/lessons/lesson-content-contract.ts`, `src/routes/_authenticated/lessons.$lessonId.tsx`, `src/routes/_authenticated/admin.lesson-content.$lessonId.tsx`, `tests/student/lesson-*`, `tests/student/lesson-capability-lifecycle-20c` | لا شيء | لا شيء | إخراج `originalBookPdf` من `STUDENT_CAPABILITY_ORDER` ومن حساب التقدم/الجاهزية، وإبقاؤه **admin-only** كحقل مصدر (بدون حذف بيانات أو `lesson_resources`)؛ تحديث الاختبارات الثابتة المرتبطة | لا | لا (لا حذف بيانات) | 21B4-E |
| OBS-06 | Offline blocker على Android | logcat: `TamkeenPdfViewer registered successfully` ثم `ERR_INTERNET_DISCONNECTED` و`chrome-error://chromewebdata`؛ `capacitor.config.ts:18-24` → `server.url = https://studentamkeen.com`, `webDir = mobile/www`؛ `mobile/www/index.html` صفحة نصية ساكنة بلا أي إجراء؛ التخزين المحلي موجود فعلاً في `src/lib/offline/pdf-cache.ts` (Filesystem `Directory.Data` + `localPath`) | الغلاف يحمّل SSR origin بعيد؛ عند إعادة إنشاء WebView دون شبكة تُفقد كل مداخل React، فيصبح PDF محفوظاً لكن غير قابل للوصول. خطأ `Cannot read properties of undefined (reading 'triggerEvent')` هو نتيجة تحميل صفحة خطأ Chrome بلا bridge (`window.Capacitor` غير معرّف) وليس سبباً مستقلاً | **P0** | `capacitor.config.ts`, `mobile/www/index.html`, `android/app/src/main/java/app/studentamkeen/tamkeen/MainActivity.java`, `TamkeenPdfViewerPlugin.java`, `PdfViewerActivity.java`, `src/lib/offline/pdf-cache.ts`, `src/lib/pdf/reader-runtime.ts` | يجب أن يبقى الجسر ضيقاً: مسارات نسبية داخل التخزين الخاص فقط (الحارس قائم في `TamkeenPdfViewerPlugin.open`)، ولا tokens/secrets داخل سجل الكتب المحلي | جوهري: هو الفارق بين «كتاب محفوظ» و«كتاب يمكن فتحه» | Minimal Solution (انظر أدناه) | لا | لا | 21B4-B |

---

## OBS-06 — Minimal Solution المقترح (بدون تنفيذ)

1. **errorPath محلي**: `mobile/www/index.html` يصبح شاشة «كتبك المحفوظة» داخل الـ APK، وتُربط عبر `server.errorPath` (أو `errorUrl`) في `capacitor.config.ts` بحيث تُعرض بدل `chrome-error://chromewebdata` عند فشل الأصل البعيد.
2. **سجل محلي موثوق**: عند نجاح تنزيل كتاب، تُكتب فقط `{ id, title, subject, localPath, sizeBytes, version, savedAt }` في `Preferences`/ملف JSON داخل `Directory.Data`. ممنوع أي URL أو token أو مفتاح تخزين.
3. **الشاشة الاحتياطية** تقرأ السجل عبر Capacitor bridge المتاح محلياً (الصفحة مضمّنة في الـ APK ⇒ الجسر موجود)، وتعرض قائمة، وتستدعي `TamkeenPdfViewer.open({ localPath })` فقط — بلا React route بعيد، بلا Supabase، بلا أي طلب شبكة أو chunk بعيد.
4. **الحارس الأمني** قائم بالفعل ويُبقى كما هو: رفض المسارات المطلقة و`..` و`://`، والملف يجب أن يوجد داخل `getFilesDir()`.
5. **إصلاح `triggerEvent`**: عدم استدعاء أي bridge API قبل التحقق من `window.Capacitor?.isNativePlatform`، وإضافة إعادة محاولة عند `resume` (lifecycle) للعودة إلى الأصل عندما تعود الشبكة.

---

## LOG TRIAGE

| الفئة | العناصر |
| --- | --- |
| **A — TAMKEEN_ACTIONABLE** | `ERR_INTERNET_DISCONNECTED` + `chrome-error://chromewebdata` داخل package `app.studentamkeen.tamkeen` (OBS-06)؛ `Cannot read properties of undefined (reading 'triggerEvent')` (نتيجة تابعة لفقد الجسر في صفحة الخطأ)؛ خروج تدفق Google خارج التطبيق (OBS-02) |
| **B — ANDROID/SAMSUNG_NOISE** | ACDB، SmartCapture، Nearby، Bluetooth، BadgeProvider — لا علاقة لها بـ `app.studentamkeen.tamkeen` ولا تُعالج |
| **C — NEEDS_INVESTIGATION** | سلوك pause/resume: هل تُعاد تهيئة WebView بعد قتل النظام للعملية أثناء انقطاع الشبكة؟ وهل تُستأنف جلسة Supabase بعد العودة؟ يتطلب جهازاً فعلياً مع logcat موسوم بالوقت |

`TamkeenPdfViewer registered successfully` = سلوك سليم (تسجيل الملحق في `MainActivity.onCreate`)، وليس خطأً.

---

## الدفعات المقترحة (بترتيب التنفيذ الموصى به)

| الدفعة | النطاق | الأولوية |
| --- | --- | --- |
| **21B4-B** | Android Offline Shell + مدخل الكتب المحفوظة محلياً | P0 |
| **21B4-C** | Google OAuth Return-to-App (Custom Tab + Deep Link) | P0/P1 |
| **21B4-D** | تعاقد حالات تنزيل/فتح الكتاب في الواجهة | P1 |
| **21B4-E** | إخراج «نسخة الكتاب الأصلية» من رحلة الدرس (Content V3) | P1 |
| **21B4-F** | تبسيط الصفحة الرئيسية للهاتف | P1 |
| **21B4-G** | تنظيف هوية التطبيق والحزمة (تحضير الإصدار) | Release prep |

**ملاحظة على الترتيب:** الترتيب المطلوب مقبول ولا أقترح تغييره، مع تحفّظ واحد: **21B4-D** يعتمد جزئياً على قرار السجل المحلي في **21B4-B** (نفس مصدر الحقيقة لحالة `PDF_READY`/`READER_READY`)، لذا يُفضَّل تنفيذ B قبل D — وهو ما يوافق الترتيب أصلاً. كما أن **21B4-C** يتطلب تغيير إعداد إنتاجي (redirect URL + `assetlinks.json`) لذا يجب أن يبدأ بتغييرات الكود القابلة للاختبار محلياً ثم بوابة اعتماد منفصلة قبل الإعداد الإنتاجي.

---

## FINAL VERDICT

**PASS_AUDIT_READY_FOR_21B4B**
