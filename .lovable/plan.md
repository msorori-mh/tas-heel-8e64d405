## المطلوب
مزامنة مشروع Lovable مع آخر commit على GitHub `main`، ثم تشغيل Preview فقط للتحقق البصري — بدون Publish وبدون أي تعديل كود أو migration.

## الخطوات

1. **تحديد الـ repo الفعلي المرتبط بـ Lovable حالياً**
   - قراءة `git remote -v` وسجل آخر commits من داخل الـ sandbox لمعرفة أين يشير `origin`.
   - ملاحظة: بحسب آخر قرار متفق عليه، Source of Truth الرسمي هو `msorori-mh/qconcursos-unlocked` والمزامنة معه **يدوية**. لذلك "GitHub main" هنا = فرع `main` للـ repo المرتبط فعلياً بـ Lovable.

2. **التحقق من حالة المزامنة**
   - مقارنة آخر commit في الـ sandbox مع آخر commit على `origin/main`.
   - إن كان الـ sandbox متأخراً: الإشارة إلى ذلك في التقرير (لا يستطيع الـ agent تنفيذ pull/merge/checkout — هذه أوامر git محظورة، وتتم عبر واجهة Lovable "Sync with GitHub").

3. **تشغيل Preview فقط (Read-Only)**
   - التأكد من أن dev server يعمل عبر فتح `/` و `/admin/login` والتقاط لقطات شاشة بـ Playwright.
   - قراءة console/network للتأكد من عدم وجود أخطاء runtime.
   - **لا publish**، لا استدعاء لـ `preview_ui--publish`.

4. **التقرير النهائي**
   يشمل:
   - آخر commit على `origin/main` للـ repo المرتبط.
   - آخر commit في الـ sandbox + هل هما متطابقان.
   - نتيجة فتح Preview (`/`, `/admin/login`) + أي أخطاء console.
   - القرار: `SYNC_PREVIEW_OK` أو `SYNC_LAG_DETECTED` (يتطلب Sync يدوي من واجهة Lovable) أو `PREVIEW_RUNTIME_ERROR`.

## قيود صارمة
- بدون تعديل ملفات.
- بدون migration.
- بدون publish.
- بدون git write commands.
