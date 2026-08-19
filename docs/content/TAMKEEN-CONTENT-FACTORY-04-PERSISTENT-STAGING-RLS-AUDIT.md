# CONTENT FACTORY 04 — PERSISTENT STAGING, RLS, AND AUDIT

## Decision

`PASS_CONTENT_FACTORY_04_SOURCE_READY_FOR_SCHEMA_REVIEW`

هذه المرحلة تنقل حزمة Golden Lesson من مراجعة المتصفح المؤقتة إلى عقد persistence
خادمي قابل للاختبار، دون تطبيقه على الإنتاج ودون كتابة أي محتوى في جداول الطالب.

## المخطط

- `golden_lesson_packages`: الهوية والحالة والنسخة الحالية.
- `golden_lesson_package_versions`: Manifest كامل لكل نسخة مع بصمتين منفصلتين.
- `golden_lesson_package_reviews`: سجل انتقالات وأدلة غير قابل للتعديل أو الحذف.

## ضمانات الحماية

- RLS على الجداول الثلاثة، وقراءة فريق المحتوى فقط.
- لا INSERT/UPDATE/DELETE مباشر للمستخدم المصادق؛ mutation عبر RPCs فقط.
- لا صلاحيات `anon`.
- التحقق الخادمي يعيد فحص schema والهوية والقدرات والانطباق والملكية والـhash
  وprovenance وفصل الإجابات و`productionApply=false`.
- القفل الذري حسب `packageCode` يمنع سباق النسخ.
- إعادة نفس Manifest idempotent بصفر كتابة.
- تغيير Manifest تحت الهوية نفسها ينشئ version جديدًا ويعيد الحالة إلى `DRAFT`.
- هوية الحزمة غير قابلة للاستبدال تحت نفس `packageCode`.
- كل انتقال مثبت بالنسخة والدور والأدلة؛ الاعتماد التقني للأدمن فقط.
- لا دالة execute، ولا `READY`، ولا publish، ولا domain-content writes.

## حالة التطبيق

الملف موجود في `supabase/migrations-pending` ويُشغّل فقط على PostgreSQL 17 معزول
داخل CI. نقله إلى migrations المطبقة أو تشغيله على الإنتاج يحتاج بوابة مستقلة.
