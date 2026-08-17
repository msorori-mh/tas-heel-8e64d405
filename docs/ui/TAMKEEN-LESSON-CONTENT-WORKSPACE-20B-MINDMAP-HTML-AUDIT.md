# TAMKEEN_LESSON_CONTENT_WORKSPACE_AND_CAPABILITY_CONTRACT_20B — تعديل الخريطة الذهنية (HTML)

الحالة: Audit + Contract + Admin UX — **بدون Migration وبدون أي كتابة على قاعدة الإنتاج**.

## 0. النتائج المطلوبة

| المفتاح | القيمة |
|---|---|
| MIND_MAP_FORMAT | HTML |
| MIND_MAP_STRUCTURED_DB_MODEL_REQUIRED | NO |
| MIND_MAP_EXISTING_PATH_REUSED | YES — خط أنابيب HTML القائم (`lesson_resources.html_resource_type='mindmap'` + `html-pipeline`) |
| HTML_SANITIZER | `src/lib/content-import/html-package/html-parser.ts` (Allow-list للوسوم/السمات + رفض `javascript:` + منع `<iframe>/<frame>/<frameset>`) + CSP مبنية لكل حزمة (`buildPackageCsp`) + `srcDoc` داخل iframe بـ `sandbox="allow-scripts"` فقط |
| SCRIPT_POLICY | لا تنفيذ خارجي: `script src` خارجي مرفوض؛ السكربت الداخلي يُهَش (SHA-256) ويُسمح به فقط عبر CSP nonce/hash داخل الـ sandbox. أي سكربت خارجي أو CDN = BLOCK |
| ASSET_POLICY | الأصول المضمنة تُرحّل إلى تخزين تمكين المُدار عند الاستيراد النهائي (Storage + signed student access)؛ لا روابط CDN خارجية |
| BULK_HTML_IMPORT_READY | PARTIAL — الاستيراد الجماعي القائم يعمل بـ ZIP + Excel (`InteractiveHtmlImportPanel`). دعم `<lesson_code>.html` المسطّح = **مقترح** (§8) وغير منفّذ بعد |

## 1. Audit الوضع الحالي

- CURRENT_MIND_MAP_TABLE = `public.lesson_resources` (`resource_type='mindmap'` أو `html_resource_type='mindmap'`) + جداول دعم `storage_operations` ونسخ المسودة (`current_draft_version_id`). لا يوجد جدول nodes ولا نموذج parent-child.
- CURRENT_ADMIN_PATH = `/admin/lessons/$lessonId` → «إدارة موارد الدرس» (`LessonResourcesDialog`) + الاستيراد التفاعلي (`InteractiveHtmlImportPanel`) + دوال الخادم `src/lib/api/html-workflow.functions.ts` (initialize → finalize → submitForReview → approve → publish/unpublish/rollback).
- CURRENT_STUDENT_RENDERER = `src/components/lessons/InteractiveResourceViewer.tsx` — iframe `srcDoc` مع CSP + nonce + `sandbox="allow-scripts"` + جسر postMessage مُتحقَّق منه.
- CURRENT_IMPORT_PATH = قالب 06 (`lesson_resources`) للروابط، وحزمة ZIP + `manifest.json` (`resource_type=mind_map_html`) للمحتوى التفاعلي.
- CURRENT_STATUS_MODEL = `lifecycle_status`: `draft → in_review → approved → published` (+ `unpublish` / `rollback`).

**الخلاصة:** المسار قائم بالكامل ⇒ إعادة الاستخدام، وإلغاء أي اقتراح لنموذج بنيوي أو Migration خاص بالخريطة الذهنية.

## 2. عقد القدرة (منفَّذ)

`src/lib/lessons/lesson-content-contract.ts`:

```ts
mindMap = { present, status, studentVisible, htmlRef, updatedAt, count, sourceRef }
```

- `status`: `ABSENT` بلا صفوف، `DRAFT` عند وجود HTML غير منشور، `READY` عند وجود نسخة منشورة.
- `studentVisible`: منشور **و** بوابة الوصول مفتوحة.
- `htmlRef`: `resource_code` (أو `id`) للحزمة المرتبطة.
- الترتيب الطلابي: `tamkeenExplanation` → **🗺️ الخريطة الذهنية** → `simulation` (مطابق لـ `STUDENT_CAPABILITY_ORDER`).

## 3. Admin Workspace

`LessonContentWorkspace` يعرض حالة الخريطة الذهنية + `htmlRef` + آخر تحديث + زر التحرير و«معاينة كطالب». عمليات Upload / Replace / Save Draft / Mark Ready تُنفَّذ عبر دوال خط الأنابيب القائمة (`initializeHtmlImportFn`, `finalizeHtmlUploadFn`, `submitHtmlForReviewFn`, `approveHtmlResourceFn`, `publishHtmlResourceFn`) — لا حاجة لأي مسار جديد.

## 4. تحقق HTML (سياسة إلزامية)

RTL، responsive، منع overflow أفقي، تعقيم Allow-list، أنماط مقيَّدة داخل الحزمة (لا تسريب CSS عام بفضل عزل iframe/srcDoc).

فحوص الحظر عند الاستيراد: `SCRIPT_PRESENT` (inline مسموح بعد الهاش، خارجي BLOCK)، `EXTERNAL_ASSETS` = BLOCK قبل الترحيل للتخزين المُدار، `EXTERNAL_CDN` = BLOCK، `IFRAME_PRESENT` = BLOCK.

## 5. مقترح الاستيراد الجماعي (غير منفّذ)

ملفات باسم `<lesson_code>.html` داخل ZIP واحد، بقواعد: `UNKNOWN_LESSON=BLOCK`، `DUPLICATE_FILE=BLOCK`، `INVALID_HTML=BLOCK`، `PARTIAL_FAILURE=ISOLATED` (فشل ملف لا يُسقط الدفعة).

## 6. الالتزامات

MIGRATIONS_APPLIED = 0 • PRODUCTION_DB_WRITES = 0 • PUBLISH = NO
