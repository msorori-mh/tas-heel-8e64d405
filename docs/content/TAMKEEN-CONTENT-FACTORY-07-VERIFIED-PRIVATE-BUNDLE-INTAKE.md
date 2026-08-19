# Content Factory 07 — Verified Private Bundle Intake

## القرار

`SOURCE_READY / PRODUCTION_NOT_APPLIED`

تغلق CF07 فجوة الثقة بين ZIP الذي ينشئه فريق المحتوى ونسخة الـmanifest المحفوظة. لا تعطي هذه المرحلة أي صلاحية نشر أو READY أو كتابة في جداول محتوى الطالب.

## المسار المعتمد

1. يطلب موظف المحتوى مسار رفع عشوائيًا وموقّعًا تحت مجلد UUID الخاص به.
2. يرفع المتصفح ZIP مباشرة إلى bucket خاص؛ لا يمر الملف الكبير Base64 عبر TanStack Server Function.
3. يعيد الخادم تنزيل نفس الكائن الخاص بهوية الموظف ويفحص central directory وCRC والبنية والحجم ونسبة الضغط.
4. يجب أن يساوي محتوى ZIP بالضبط `manifest.json` والملفات المعلنة؛ لا ملفات ناقصة أو زائدة.
5. تُعاد بصمة SHA-256 لكل artifact وprovenance وملف الإجابات الخادمي من البايتات الفعلية.
6. بعد نجاح كل الفحوص فقط يُنشأ/يعاد استخدام إصدار CF04، ثم يسجل RPC محصور بـservice role شهادة bundle غير قابلة للاستبدال.
7. Trigger مستقل يمنع الانتقال `DRAFT → SUBMITTED` ما لم توجد الشهادة الخادمية.

## الحراس

- bucket غير عام، 50MB، ZIP فقط، insert/select لهوية المالك وموظفي المحتوى.
- لا UPDATE أو DELETE policy: الكائن المرجعي immutable.
- حد 32 ملفًا، 5MB للملف، 50MB إجماليًا، ونسبة ضغط 100:1.
- منع multi-disk، encryption، symlink، zip-slip، الأسماء غير UTF-8، الأسماء المتكررة بعد Unicode normalization، والملفات غير المعلنة.
- `service_role` لا يصل إلى المتصفح؛ استخدامه محصور في server function بعد تحقق JWT للموظف والتحقق الفعلي من ZIP.
- attestation لا يمكن استبدالها بقيم مختلفة، و`authenticated` لا يملك تنفيذ RPC الشهادة.

## خارج النطاق

- تطبيق migrations على الإنتاج.
- تحويل artifact إلى جداول الدرس.
- publish أو READY أو student visibility.
- حذف أو تعديل محتوى قائم.

## بوابة الخروج

عقد TypeScript + اختبارات ZIP السلبية + بروفة PG17 لـCF04 ثم CF07 + typecheck/build + CI كاملة. بعدها تكون الخطوة التالية CF08: atomic domain staging adapter، لا production executor.
