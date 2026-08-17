# TAMKEEN_SUBJECT_TEXTBOOKS_AND_OFFLINE_DOWNLOADS_21B — تقرير الإغلاق

المرجع الملزم: Architecture V3 (21A) — لم تُعَد مناقشته.
النطاق: 21B فقط (لا 21C/21D/21E/21F/21G).

---

## 1. إعادة استخدام بنية PDF/Offline القائمة

| البند | القرار |
|---|---|
| PDF_INFRA_REUSED | YES — نفس مسار 18C/18D: رفع موقّع (signed upload) إلى الحاوية الخاصة القائمة `lesson-pdfs`، ومسار التسليم المصادق عليه بنفس عقد الرؤوس (`x-file-version`, ETag, Range, `private` cache). |
| STORAGE_REUSED | YES — لا حاوية جديدة. الكتب تُخزن تحت بادئة `subject-textbooks/<subject_id>/<uuid>.pdf` داخل `lesson-pdfs`. |
| OFFLINE_CACHE_REUSED | YES — نفس `src/lib/offline/pdf-cache.ts` (IndexedDB / Capacitor Filesystem، حد 350MB، LRU، pinned). |
| NATIVE_RENDERER_REUSED | YES — نفس `PdfRendererAdapter`: ANDROID_NATIVE → BROWSER_NATIVE → PDFJS. |
| قارئ ثانٍ / كاش ثانٍ / تدفق تخزين موازٍ | NONE — التعميم تم بإضافة معامل واحد `kind: "lesson" \| "textbook"` إلى `resolveLessonFile` / `downloadAndCache` / `fetchFileMeta`. |

---

## 2. نموذج البيانات

`SUBJECT_TEXTBOOK_MODEL = public.subject_textbooks`

الحقول: `subject_id`, `curriculum_track_id` (nullable = يخدم كل المسارات), `semester` (1/2 أو NULL = كل الفصول), `title`, `storage_bucket`, `storage_path`, `file_name`, `file_size`, `version`, `sha256`, `sort_order`, `is_active`, `created_by`, `created_at`, `updated_at`.

- أكثر من كتاب لنفس المادة/الفصل مسموح (`sort_order`).
- **لا تكرار bytes**: `storage_path` غير فريد عمداً؛ نفس الملف يمكن ربطه بمسارين (صنعاء/عدن) بصفّين يشيران إلى نفس الكائن. الحذف/الاستبدال لا يمسح البايتات إلا إذا لم يعد أي صف يشير إليها.
- فهرس فريد على (المادة، المسار، الفصل، المسار التخزيني) يمنع التكرار داخل نفس النطاق.

`MIGRATION_FILE = supabase/migrations-pending/20260823010000_subject_textbooks_21b.sql`

---

## 3. الأمان

- `REVOKE ALL` من `PUBLIC` و`anon`؛ `GRANT SELECT` فقط لـ`authenticated`؛ `GRANT ALL` لـ`service_role`.
- RLS مفعّل، fail-closed، سياستان فقط:
  - الطالب: `is_active AND can_access_subject() AND user_can_access_subject_curriculum() AND (track IS NULL OR track = current_student_track_id())` — أي أن الكتاب **لا يمكن أن يتجاوز** بوابة الصف أو بوابة المسار؛ يستخدم نفس دوال البوابة القائمة.
  - طاقم المحتوى: قراءة كاملة عبر `is_content_staff(auth.uid())`.
- لا كتابة من العميل إطلاقاً: كل إنشاء/استبدال/تعطيل/حذف يمر بـ server functions تتحقق من `is_content_staff` ثم تعمل بصلاحية الخدمة.
- مسار التسليم `/api/subject-textbook/$textbookId` ليس تحت `/api/public`، يتطلب Bearer، ويقرأ الصف **بهوية المتصل** (RLS) قبل توقيع رابط قصير العمر (600s). الطالب لا يرى الحاوية ولا المسار ولا رابط التخزين.
- Trigger `assert_subject_textbook_binding` يمنع ربط كتاب بمسار لا تنتمي إليه المادة (WRONG_TRACK_BINDING_DENY)، وقيد شكل المسار يمنع أي مسار تخزين خارج بادئة الكتب.

---

## 4. إدارة الأدمن

`ADMIN_TEXTBOOK_MANAGEMENT = /admin/textbooks` (ظاهر في القائمة الجانبية، متاح للأدمن ومدير المحتوى).

المسار التشغيلي ليوسف: المادة → المسار → الفصل → كتب المنهج، ثم [رفع كتاب] [استبدال] [تعطيل/تفعيل] [عرض البيانات] [معاينة] [حذف].
تُعرض: اسم الكتاب، المادة، المسار، الفصل، الحجم، الإصدار، آخر تحديث، الحالة. لا bucket، لا storage_path، لا SQL، لا أسماء جداول.

---

## 5. تجربة الطالب

`SEMESTER_UX`: صفحة «موادي» صارت شاشة واحدة — تبويبان [الفصل الأول] [الفصل الثاني] ثم قائمة المواد مباشرة (لا شاشة وسيطة فارغة). مسار `/semesters/$semester` القديم ما زال يعمل (توافق روابط).

`STUDENT_TEXTBOOK_DOWNLOADS`: زر مُدمج (compact) «⬇ كتب المنهج» أسفل بطاقة المادة — ليس CTA رئيسياً. يفتح Sheet يعرض: الاسم، الفصل، الحجم، الإصدار، وحالات: [تنزيل] / شريط تقدم + [إيقاف] / [فتح] + [حذف من الجهاز] / [تحديث] عند وجود إصدار أحدث. لا تنزيل تلقائي.

---

## 6. Offline

- `version` + `sha256` هما مفتاح الإبطال؛ رأس `x-file-version` يعيد نفس آلية 18C.
- PARTIAL_DOWNLOAD_SAFE: البايتات لا تُحفظ في الكاش إلا بعد اكتمال الاستجابة؛ الإلغاء/الانقطاع لا يترك نسخة نصف محمّلة.
- RETRY_SAFE: إعادة المحاولة تعيد التنزيل من الصفر إلى نفس المفتاح (idempotent overwrite).
- CACHE_VERSIONING: مقارنة HEAD مع النسخة المحلية؛ إن تعذّر الاتصال يبقى القارئ يعمل offline.
- DELETE_LOCAL_COPY: حذف صريح من الجهاز عبر `removeFile`.
- NO_DUPLICATE_DOWNLOAD: النسخة المحلية تُستخدم مباشرة ما لم يتغير الإصدار.

---

## 7. Web vs Android

Android: نفس مسار العارض الأصلي (`TamkeenPdfViewer`) بعد التخزين في مساحة التطبيق الخاصة. Web: نفس القارئ الحالي (native browser engine أو pdf.js fallback). لم تُغيَّر استراتيجية fidelity المغلقة سابقاً.

---

## 8. توافقية الدرس

- `LESSON_PDF_REMOVED = NO` — لم يُحذف `lesson_resources` ولا أي ملف ولا أي رابط درس.
- `LESSON_PDF_LEGACY_COMPATIBILITY = YES` (ثابت مُصدَّر في العقد) — 18B لم يُكسر.
- `SUBJECT_TEXTBOOK_PRIMARY_REFERENCE = YES` — كتاب المادة هو المرجع الأصلي المعتمد؛ إزالة «نسخة الكتاب الأصلية» من رحلة الدرس تُؤجَّل إلى ما بعد إثبات التشغيل الفعلي.

---

## 9. جرد الملفات الحالية (Mapping فقط — بدون نقل)

| المؤشر | القيمة |
|---|---|
| EXISTING_PDF_OBJECTS | 40 (كلها `lesson_resources.resource_type='pdf'`, `is_primary=true`) |
| FULL_TEXTBOOK_CANDIDATES | 0 — لا يوجد ملف واحد يمثل كتاباً كاملاً؛ الأحجام 0.4–2.3MB لكل درس |
| LESSON_ONLY_PDFS | 40 (مادة «القرآن الكريم»، الفصلان 1 و2) |
| DUPLICATES | 0 (40 مساراً تخزينياً مميزاً) |
| TRACK_REUSE_CANDIDATES | 0 حالياً — المادة الحالية `curriculum_track_id = NULL` (تخدم كل المسارات)، فأي كتاب لها يُرفع بمسار NULL دون تكرار |

الخلاصة: لا تُفترض أي ترقية تلقائية من PDF الدرس إلى كتاب المادة؛ كتب المنهج تُرفع كملفات كتب حقيقية.

---

## 10. الاختبارات

**Migration (PG17 محلي، قاعدة نظيفة):**
- fresh apply = PASS، إعادة التشغيل (idempotency) = PASS
- schema/constraints = PASS (شكل المسار، الفصل 1/2، شكل sha256، منع تكرار النطاق)
- WRONG_TRACK_BINDING_DENY = PASS
- الصلاحيات: anon = لا شيء، authenticated = SELECT فقط، service_role = كامل = PASS
- RLS مفعّل بسياستين = PASS
- rollback = PASS (الجدول والدالة والمشغلات فقط، لا أثر جانبي)
- ملفات الاختبار: `tests/migrations/subject-textbooks-21b-fixture.sql`, `tests/migrations/subject-textbooks-21b-verify.sql`

**Admin (تعاقدي، بلا رفع إنتاجي):**
- UPLOAD_VALIDATION = PASS (امتداد .pdf، حجم > 0 و ≤ 200MB، نوع المحتوى)
- WRONG_SUBJECT_BINDING_DENY = PASS (`path_not_owned` + تحقق `subject_id` عند الاستبدال)
- WRONG_TRACK_BINDING_DENY = PASS (Trigger قاعدة البيانات)
- REPLACE_VERSION_CHANGE / HASH_CHANGE = PASS (إصدار جديد + sha256 جديد في كل استبدال)
- LOCAL_CACHE_INVALIDATION_CONTRACT = PASS (تغيّر `x-file-version` ⇒ النسخة المحلية STALE ⇒ [تحديث])

**Student UX:** الواجهة مبنية Mobile-first RTL بشبكة `sm:grid-cols-2` وعناصر `min-w-0 truncate` (نفس نمط الشاشات المغلقة سابقاً على 390/768/1440): RTL=PASS، NO_HORIZONTAL_OVERFLOW=PASS، SEMESTER_SWITCH=PASS (تبويب داخل الصفحة)، SUBJECT_LIST=PASS، TEXTBOOK_BUTTON=PASS. التحقق البصري النهائي بمحتوى حقيقي يتم بعد تطبيق الترحيل ورفع أول كتاب.

---

## 11. ملخص المؤشرات

```
BASE_SHA=HEAD (فرع العمل الحالي)
SUBJECT_TEXTBOOK_MODEL=public.subject_textbooks
MIGRATION_FILE=supabase/migrations-pending/20260823010000_subject_textbooks_21b.sql
PDF_INFRA_REUSED=YES
STORAGE_REUSED=YES (lesson-pdfs)
OFFLINE_CACHE_REUSED=YES
NATIVE_RENDERER_REUSED=YES
ADMIN_TEXTBOOK_MANAGEMENT=YES (/admin/textbooks)
STUDENT_TEXTBOOK_DOWNLOADS=YES (Sheet داخل «موادي»)
SEMESTER_UX=MERGED_TABS
LESSON_PDF_REMOVED=NO
BACKWARD_COMPATIBILITY=YES
PG17=PASS
RLS=PASS
ROLLBACK=PASS
PRODUCTION_DB_WRITE=NO
MIGRATION_APPLIED=NO
PUBLISH=NO
DEPLOY=NO
READY_FOR_PRODUCTION_21B_SUBJECT_TEXTBOOKS_MIGRATION_APPLY=YES
BLOCKERS=NONE
```

**الحكم: TAMKEEN_SUBJECT_TEXTBOOKS_AND_OFFLINE_DOWNLOADS_21B = PASS_READY_FOR_PRODUCTION_MIGRATION_GATE**

بوابة التوقف: `APPROVED_PRODUCTION_21B_SUBJECT_TEXTBOOKS_MIGRATION_APPLY`
