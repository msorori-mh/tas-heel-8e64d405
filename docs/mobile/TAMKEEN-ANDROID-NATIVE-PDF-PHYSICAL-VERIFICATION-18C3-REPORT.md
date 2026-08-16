# TAMKEEN_ANDROID_NATIVE_PDF_PHYSICAL_VERIFICATION_18C3

**الحكم النهائي:** `NEEDS_REVISION (PENDING_PHYSICAL_DEVICE_RUN)`
كل ما يمكن إثباته من داخل بيئة العمل **PASS**، بما فيها بوابة الوصول (لم تعد Blocker). المتبقي حصراً هو البنود التي تتطلب هاتف أندرويد فعلياً (Renderer، Airplane Mode، Zoom، Private Storage) ولا يمكن تنفيذها من هذه البيئة — لا يوجد جهاز ولا محاكي متصل.

---

## 1) TEST ACCOUNT ENTITLEMENT — تم الحل، بلا أي bypass

سبب رسالة «هذا الدرس غير متاح» في الفحص السابق **لم يكن الاشتراك**:

- بوابة القاعدة `can_access_lesson → can_access_subject` لا تفحص الاشتراك إطلاقاً؛ تفحص: admin **أو** (`profiles.grade_uuid = subjects.grade_id` **و** مسار المنهج ضمن `subject_curriculum_tracks`).
- الحساب المستخدم سابقاً (مختار حسين، admin) صفّه `03780461…` بينما مادة القرآن صفّها `ae2fd78d…` (1ث)، وواجهة `lessons.$lessonId.tsx` تطبّق مطابقة الصف على مستوى العميل قبل عرض المحتوى → حجبت الصفحة رغم أن القاعدة تسمح للأدمن.

**المسار الرسمي المستخدم:** جلسة طالبة حقيقية مخوَّلة أصلاً (صف `ae2fd78d…` + مسار `7751f472…` وهو أحد مساري المادة) عبر آلية جلسات المعاينة الرسمية. لا SQL bypass، لا تعطيل حراس، لا تعديل بيانات.

`TEST_ACCOUNT_ACCESS = PASS`

## 2) درس سورة السجدة — تحقق فعلي بحساب الطالبة

المعرّف: `6fff752f-c6e5-46b1-8789-5cb11ad8d4c7`

| المعيار | النتيجة |
|---|---|
| lesson visible | **PASS** (فُتحت الصفحة ولم تظهر «غير متاح») |
| فتح الدرس (الإجراء الأساسي) | **AVAILABLE** — «خطوة 1 · افتح الدرس» وحيدة |
| primary PDF تحت الإجراء الأساسي | **PASS** (`is_primary = 1`، العارض الداخلي يعرض «صفحة 1 من 8») |
| primary PDF داخل «موارد إضافية» | **ZERO** — القسم غير موجود أصلاً في الصفحة |
| fake book content | **ZERO** (`lesson_book_contents = 0` صفوف) |
| مسار الملف | داخلي عبر `/api/lesson-file/:id` — لا رابط Drive ولا تبويب خارجي |

## 3) ANDROID NATIVE VIEWER

اختيار المحرك مُحسم في `pdf-renderer-adapter.ts`: `Capacitor.isNativePlatform() && platform === 'android'` → `ANDROID_NATIVE` (`android.graphics.pdf.PdfRenderer`/PDFium) قبل أي فرع آخر؛ pdf.js لا يُحمَّل على أندرويد.
في هذه البيئة (متصفح headless) اختير مسار المتصفح، وهو المتوقع.

| المعيار | الحالة |
|---|---|
| ARABIC_GLYPH_JOINING / RTL_WORD_ORDER / DIACRITICS / LINE_LAYOUT / PAGE_GEOMETRY | **PENDING_PHYSICAL_DEVICE** (مطابقة PDFium↔Poppler على الصفحة الذهبية أُثبتت في 18C2 مرجعياً، وتحتاج لقطة من الجهاز للاعتماد النهائي) |

## 4) VIEWER UX

`page X of Y` مُثبت في الواجهة (**صفحة 1 من 8** ظهرت فعلياً). Zoom / Fullscreen / Back مُنفَّذة داخل `PdfViewerActivity.java` وتحتاج لمسة فعلية.

| zoom | page navigation | page X of Y | fullscreen | back to lesson | no blank page |
|---|---|---|---|---|---|
| PENDING_DEVICE | PENDING_DEVICE | **PASS** | PENDING_DEVICE | PENDING_DEVICE | **PASS** (على الويب) |

## 5) OFFLINE

- التحميل والتخزين عند أول فتح: **PASS** — الواجهة أظهرت «محفوظ للاستخدام دون إنترنت» بعد الجلب.
- Airplane Mode / إعادة تشغيل التطبيق / إعادة استخدام النسخة المحلية: منطقها قائم (`resolveLessonFile` يعيد النسخة المخزّنة مع `stale = true` عند غياب الشبكة) لكن التحقق الفعلي **PENDING_PHYSICAL_DEVICE**.

## 6) LAST PAGE

`rememberLastPage(resourceId, page)` يكتب `lastOpenedPage` في مخزن IndexedDB الدائم، و`prepare()` يستعيده عند كل فتح ويمرره كـ`initialPage` للعارض الأصلي → الاستعادة تبقى بعد إغلاق التطبيق. التحقق الحسي **PENDING_PHYSICAL_DEVICE**.

## 7) STORAGE / SECURITY (تحقق كودي)

| cached file in app private storage | public Downloads copy | Drive URL in student UX | external browser default |
|---|---|---|---|
| **PASS** (كاش خاص بالتطبيق + ملف داخلي يمرَّر للعارض) | **ZERO** (لا كتابة خارج التخزين الخاص) | **ZERO** (المسار المحمي فقط) | **ZERO** (لا `window.open` للملف الأساسي) |

## 8) الملخص

```
TEST_ACCOUNT_ACCESS        = PASS
QURAN_LESSON_VISIBLE       = PASS
PRIMARY_PDF_MAPPING        = PASS
EXTRA_RESOURCE_DUPLICATION = ZERO
ANDROID_NATIVE_RENDERER    = PENDING_PHYSICAL_DEVICE (selection logic PASS)
ARABIC_FIDELITY            = PENDING_PHYSICAL_DEVICE
ONLINE_OPEN                = PASS
OFFLINE_OPEN               = PENDING_PHYSICAL_DEVICE (logic PASS)
AIRPLANE_MODE              = PENDING_PHYSICAL_DEVICE
CACHE_REUSE                = PENDING_PHYSICAL_DEVICE (logic PASS)
LAST_PAGE_RESTORE          = PENDING_PHYSICAL_DEVICE (persistence PASS)
ZOOM                       = PENDING_PHYSICAL_DEVICE
BACK_NAVIGATION            = PENDING_PHYSICAL_DEVICE
PRIVATE_STORAGE            = PASS (code-level)
EXTERNAL_BROWSER           = ZERO
BLOCKERS                   = لا يوجد جهاز/محاكي أندرويد متاح في بيئة التنفيذ
```

**الإجراء المطلوب لإغلاق 18C3:** بناء APK من `android/` وتثبيته على هاتف حقيقي، ثم تسجيل الدخول بحساب طالب صف أول ثانوي (مثل الحساب المستخدم هنا) وتنفيذ البنود 3–6 مع لقطات، وتحديث هذا التقرير إلى PASS.

`TAMKEEN_ANDROID_NATIVE_PDF_PHYSICAL_VERIFICATION_18C3 = NEEDS_REVISION (PENDING_PHYSICAL_DEVICE_RUN)`
