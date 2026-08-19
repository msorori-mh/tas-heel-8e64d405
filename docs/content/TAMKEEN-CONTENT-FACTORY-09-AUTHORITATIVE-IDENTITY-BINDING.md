# Content Factory 09 — Authoritative Curriculum Identity Binding

## القرار

`PASS_CONTENT_FACTORY_09_SOURCE_IDENTITY_BINDING`

تربط CF09 دفعة CF08 بهوية منهجية موجودة فعلًا، بصورة ذرية وغير قابلة للتعديل، قبل تصميم أي منفّذ يكتب المحتوى الحي.

## العقد

- `gradeCode` يحل صفًا واحدًا من `grades.slug`.
- كل `curriculumTrackCode` يحل مسارًا واحدًا نشطًا، بلا تكرار.
- `subjectCode` يحل مادة واحدة تحت الصف نفسه، ومربوطة بكل المسارات المطلوبة.
- `lessonSlug` يحل المفتاح الطبيعي الفعلي `(subject_id, lessons.slug)` حسب Import Contract 01.
- `lessonCode` يبقى رمز Content Factory الخارجي، ويُثبت داخل snapshot ولا يُختلق له عمود موازٍ.
- `unitCode = null` يعني أن الدرس يجب أن يكون مرتبطًا بالمادة مباشرة؛ لا تُنشأ وحدة وهمية.
- عند وجود `unitCode` يجب أن توجد وحدة واحدة داخل المادة وأن يطابقها `lesson.unit_id`.

## Fail-closed

الغياب أو التعدد أو اختلاف الصف/المسار/الوحدة يوقف الربط بلا أي صف جزئي. لا تنشئ CF09 صفًا أو مسارًا أو مادة أو وحدة أو درسًا؛ إنشاء الهيكل يبقى ملك نظام الاستيراد 01–03.

تُحفظ UUIDs والرموز والعلاقات في `identity_snapshot` مع SHA-256. سيُلزم المنفذ المستقبلي بإعادة حسابها داخل transaction قبل الكتابة لمنع TOCTOU.

## السلطة والحدود

- Admin فقط عبر Server Function ثم RPC خاص بـ`service_role`.
- الربط immutable وidempotent: إعادة نفس الطلب = صفر كتابة.
- لا domain writes، لا publish، لا READY، ولا production apply.
- migration باقية في `migrations-pending` وتُختبر فقط على PostgreSQL 17 معزول.

`PRODUCTION_WRITES=0`
