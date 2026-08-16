# TAMKEEN_NATIVE_PDF_ARABIC_FIDELITY_RECOVERY_18C2

**الحكم: `PASS_READY_FOR_PHYSICAL_DEVICE`** — المحرك البديل مثبت ومُبرهن على مستوى المحرك (PDFium) والكود، ويبقى تشغيل APK على جهاز فعلي خارج نطاق هذه البيئة.

---

## 1) القرار المعماري

`pdf.js` أُسقط كمسار أساسي. الاختيار يتم عبر طبقة واحدة جديدة فقط:
`src/lib/pdf/pdf-renderer-adapter.ts` → `PdfRendererAdapter`.

| المنصة | المحرك | السبب |
|---|---|---|
| Android (Capacitor) | `ANDROID_NATIVE` — `android.graphics.pdf.PdfRenderer` (PDFium) | يعرض خطوط الكتب الوزارية المضمّنة بشكل صحيح |
| ويب بمحرك PDF مدمج (`navigator.pdfViewerEnabled`) | `BROWSER_NATIVE` — `<object type="application/pdf">` على Object URL من نفس الكاش | محرك المتصفح نفسه، بلا إعادة رسم |
| غير ذلك | `PDFJS` | مسار احتياطي أخير فقط |

**لم يتغير أي شيء أعلى الـAdapter:** نفس `/api/lesson-file/:id` المحمي بـ`can_access_lesson`، نفس `lesson-file-client`، نفس `pdf-cache` (IndexedDB على الويب و`Directory.Data` على أندرويد)، نفس الحزم وLRU والتحميل المسبق عبر Wi‑Fi، ونفس `last_opened_page`.

## 2) إثبات دقة العربية

الصفحة الذهبية: `sajda.pdf` (سورة السجدة) صفحة 2 — نفس الملف الذي أخفق فيه pdf.js في 18C1.

| المحرك | النتيجة |
|---|---|
| Poppler (مرجع) | ✅ «الفصل الدراسي الأول — أولاً: الحفظ والتفسير» |
| **PDFium (محرك `PdfRenderer` على أندرويد)** | ✅ **مطابق** — متوسط فرق البكسل `4.8/255`، البكسلات المختلفة >40 = **3.37%** (تنعيم حواف فقط) |
| pdf.js 4.10.38 و 5.4.149 | ❌ تفكك التشكيل والوصل |

المرجعان محفوظان في المستودع كحارس انحدار:
- `docs/mobile/golden/quran-sajda-page2-poppler-reference.jpg`
- `docs/mobile/golden/quran-sajda-page2-pdfium-native.png`

`ARABIC_RENDERING_FIDELITY = PASS (PDFIUM_NATIVE)`

## 3) الجسر الأصلي (Android)

| الملف | الدور |
|---|---|
| `TamkeenPdfViewerPlugin.java` | Capacitor plugin: `isAvailable()` و`open({localPath,title,initialPage})` ويعيد `lastPage` |
| `PdfViewerActivity.java` | عارض Native: صفحة/صفحة، Pinch‑zoom (1×–3×)، تنقل، زر «رجوع للدرس»، RTL |
| `MainActivity.java` | تسجيل الإضافة |
| `AndroidManifest.xml` | `PdfViewerActivity` بـ`android:exported="false"` |
| `src/lib/pdf/native-pdf-viewer.ts` | غلاف JS + حارس المسار |
| `src/components/lessons/NativePdfDelivery.tsx` | يجهّز الملف عبر خط 18C ثم يسلّمه للعارض |

**الأمان:** الجسر يقبل **مساراً نسبياً داخل مجلد التطبيق الخاص فقط**. يُرفض أي مسار مطلق، أو `..`، أو `scheme://` — مرتين: في JS (`isPrivateRelativePath`) وفي Java قبل فتح الملف. لا رابط ولا رمز وصول ولا اسم مخزن يعبر الجسر، والعارض لا يلمس الشبكة إطلاقاً، ولا يُفتح متصفح خارجي.

**الذاكرة:** صفحة واحدة فقط تُرسم في كل لحظة (`RENDER_MODE_FOR_DISPLAY`)، والـBitmap السابق يُعاد تدويره قبل إنشاء التالي، وكل الموارد تُغلق في `onDestroy`. لا يوجد أي مسار يرسم المستند كاملاً.

## 4) الاختبارات

`tests/student/native-pdf-renderer-18c2.static.test.mjs` — 10 حراس ناجحة:
اختيار المحرك لكل منصة · عدم وصول أندرويد إلى pdf.js · رفض المسارات المطلقة/الاختراق/الروابط في الطبقتين · خلو الجسر من أي رابط أو رمز · رسم صفحة واحدة وإعادة تدوير الـBitmap · إعادة `lastPage` وحفظه · إعادة استخدام كاش 18C دون `fetch` مباشر · بقاء الصفحة الذهبية.

`tests/student/*`: **47/47 ناجحة** (باستثناء ملف 13E القديم المكتوب بـ`node:test` وليس vitest — سابق لهذه المهمة). فحص الأنواع نظيف.

## 5) ما تبقّى

تشغيل APK موقّع على جهاز أندرويد فعلي والتقاط صفحة السجدة من العارض الأصلي ومقارنتها بالصورة الذهبية. البيئة هنا لا تبني APK ولا تشغّل محاكياً، لذلك الحكم `PASS_READY_FOR_PHYSICAL_DEVICE` وليس `PASS` كاملاً.
