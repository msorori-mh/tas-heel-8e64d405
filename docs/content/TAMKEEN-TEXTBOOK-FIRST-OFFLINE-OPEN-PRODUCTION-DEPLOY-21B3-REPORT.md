# TAMKEEN_TEXTBOOK_FIRST_OFFLINE_OPEN_PRODUCTION_DEPLOY_21B3

التاريخ: 2026-08-18 (UTC)

## G0 — HEAD LOCK
- CURRENT_HEAD_SHA = 64a87ae0f4cc2d246914fcc1769a73da4491414e
- REPORT_21B3_HEAD_SHA = 64a87ae0 (نفس HEAD الذي اجتاز 21B3)
- التغييرات منذ آخر نشر (e28f0e0c) محصورة في:
  - `src/lib/pdf/reader-runtime.ts` (reader asset prefetch)
  - `src/components/textbooks/SubjectTextbooksSheet.tsx` (offline readiness contract + زر «تجهيز القارئ»)
  - `src/components/lessons/PdfViewer.tsx` / `InAppPdfDelivery.tsx` (prefetch hooks)
  - الاختبار + تقريرا 21B2/21B3
- SCOPE_VIOLATION = NONE

## G1 — SOURCE SAFETY
TYPECHECK=PASS · BUILD=PASS · SECURITY_REVIEW=PASS (لا نتائج حرجة؛ تحذير واحد قديم على wallet_topup policy)
DB_CHANGES=NO · MIGRATION_CHANGES=NO · RLS_RPC_CHANGES=NO · TEXTBOOK_DATA_CHANGES=NO · STORAGE_MUTATIONS=NO

## G2 — DEPLOY
نُشر HEAD المراجَع فقط إلى studentamkeen.com. لا تعديل مصدر أثناء النشر، لا hotfix، لا migration، لا كتابة DB.

## G3 — LIVE OFFLINE READY CONTRACT
- بعد التنزيل: PDF_READY=YES · READER_READY=YES → ظهرت «محفوظ للاستخدام دون إنترنت».
- مفتاح الجاهزية `tamkeen.reader-ready.v1` موجود في localStorage.
- عند غياب جاهزية القارئ لا تظهر الشارة، ويتوفر مسار التجهيز دون إعادة تنزيل PDF.

## G4 — FRESH FIRST-OFFLINE-OPEN WEB
جلسة نظيفة → تنزيل الكتاب (القرآن الكريم — الجزء الأول، 66 صفحة) → دون فتحه → قطع الشبكة → أول فتح:
FIRST_OFFLINE_OPEN_WEB=PASS · PDF_RENDER=PASS (صفحة 1/66، نص عربي سليم) · NO_NETWORK_DEPENDENCY=PASS
CONSOLE_ERRORS=ZERO (لا أخطاء تطبيقية؛ فقط ERR_INTERNET_DISCONNECTED المتوقّع من محاولة شبكة تسقط إلى الكاش)

## G5 — READER ASSETS
ROUTE_CHUNK=READY · PDFJS_ENGINE=READY · PDF_WORKER=READY (assets/pdf.worker.min-*.mjs من الكاش) · REQUIRED_CSS=READY · OTHER_REQUIRED_RUNTIME_ASSETS=READY
MISSING_REQUIRED_READER_ASSETS=0

## G6 — RETRY PATH
بعد إبطال جاهزية القارئ وإعادة التحميل: أُعيد التجهيز تلقائياً عند فتح قائمة الكتب وعادت الشارة.
PDF_REDOWNLOAD_REQUIRED=NO (0 طلبات /api/subject-textbook أثناء التجهيز)
PDF_BYTES_DUPLICATED=NO (IndexedDB: pdf-blobs=1، pdf-meta=1 قبل وبعد)
زر «تجهيز القارئ» يظهر فقط عند فشل التجهيز التلقائي.

## G7 — EXISTING TEXTBOOK REGRESSION
TEXTBOOK_ROWS=7 · PHYSICAL_STORAGE_OBJECTS=7 · DUPLICATE_BYTES=0
- القرآن: جزء1 (فصل 1) + جزء2 (فصل 2) → عزل الفصول PASS
- الرياضيات: أساسي فصل1/فصل2 + كتاب تمارين سنوي → PASS
- الكيمياء: أساسي سنوي + تمارين سنوي → PASS
- Secure download: authed 200 · anon 401 · Range 206 (`bytes 0-99/32136004`) → PASS

## G8 — LESSON REGRESSION
lesson_resources=40 · 18B=PASS (14/14 اختبار) · معيار البلوكات يشمل figure (3 أصول) · لا تغيير في محتوى الدروس.

## G9 — ANDROID
FIRST_OFFLINE_OPEN_ANDROID=PENDING_PHYSICAL_DEVICE (لا جهاز فعلي متاح)

## الحكم
PRODUCTION_DEPLOY_21B3 = PASS (Web) · Android معلّق على جهاز فعلي.
