# Content Factory 05 — Typed Persistence API and Production-Role Closure

## النتيجة

أضيفت طبقة API خادمية تربط واجهة مصنع المحتوى بـCF04 تحت JWT المستخدم وRLS، دون service role ودون أي مسار execute أو publish أو READY.

## الإغلاق المعماري

- النظام الفعلي يستخدم `content_manager` و`admin`؛ أزيل افتراض دوري `content_editor/content_reviewer` غير الموجودين.
- فصل المهام صار مبنيًا على هوية الفاعل في سجل التدقيق: معتمد المحتوى لا يمكن أن يكون المرسل نفسه، والمراجع التقني `admin` لا يمكن أن يكون معتمد المحتوى نفسه.
- فحص capability يميز عدم تطبيق migration ويرجع `SCHEMA_NOT_APPLIED`؛ عندها تبقى أزرار الحفظ والانتقال معطلة.
- الحفظ يعيد التحقق من Manifest على الخادم ثم يستدعي RPC المقيد فقط.
- قائمة الحزم، الإصدارات وسجل المراجعة تقرأ تحت RLS.

## الحدود

- migration ما زالت في `migrations-pending` ولم تطبق على الإنتاج.
- لا كتابة محتوى دراسي، لا تخزين ملفات، لا نشر، ولا تغيير lifecycle إلى READY.
- `PRODUCTION_WRITES=0` في هذا الإغلاق المصدري.

## القبول

- CF04 PG17: أدوار الإنتاج + فصل الفاعلين + RLS + idempotency.
- CF05 static contract: JWT/RLS، fail-closed capability، غياب execute/publish/READY.
- Typecheck، الاختبارات والبناء عبر GitHub Actions.
