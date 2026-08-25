# أكاديمية معلم الثانوية — حزمة نموذج UX غير الإنتاجي ومعايير القبول (Stage 15)

| الحقل | القيمة |
|---|---|
| المعرّف | `TEACHER_ACADEMY_MVP_NONPROD_UX_PROTOTYPE_AND_ACCEPTANCE_PACK_15` |
| الحالة | `PASS_NONPROD_DESIGN_CONTINUATION_ONLY` |
| الأساس | Stage 09 Threat Model + Stage 11 UX Release Contract + Stage 12 Screen/Role Acceptance Matrix + Stage 13 Implementation Waves + Stage 14 Retention/Audit/Support |
| نوع العمل | Mock UX / Acceptance Pack / No Backend |
| Schema / Migration / Production write / Deploy | **ممنوع** |
| تكامل بنك أسئلة الطلاب | **DISABLED** حتى إثبات الإغلاق المستقل النهائي Runtime/Cutover |

## 1. قرار البوابة الحالي

تمت مراجعة أحدث حالة متاحة من مشروع تطبيق طلاب الثانوية قبل بدء هذه المرحلة.

```text
STUDENT_MAIN_HEAD=d87312353e507107e1a2d644a22bedd20b5c2b1e
QUESTION_BANK_IMPORT_FOUNDATION=PASS_STRONG
QUESTION_BANK_FINAL_INDEPENDENT_RUNTIME_CLOSURE=NOT_PROVEN
IMPORT_CONTENT_PIPELINE=PASS_STRONG_SOURCE_AND_IDEMPOTENCY
IMPORT_LIFECYCLE_FINAL_INDEPENDENT_GATE=NOT_PROVEN
CURRICULUM_STRUCTURE=PASS_STRONG
CONTENT_V3_SECURITY_FOUNDATION=PASS_STRONG
ACADEMY_ROLES_CAPABILITIES=PASS_DESIGN_FROZEN
ACADEMY_COMMERCE_SUBSCRIPTIONS=PASS_DESIGN_FROZEN
ACADEMY_CERTIFICATES=PASS_DESIGN_FROZEN
ZERO_CRITICAL_SECURITY_BLOCKERS=NOT_FULLY_PROVEN_AS_COMPOSITE_GATE
ACADEMY_PROGRAMMING_GATE=CLOSED
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED
```

السبب المباشر لاستمرار إغلاق بوابة البرمجة هو عدم وجود دليل نهائي مستقل يثبت إغلاق Runtime/Cutover لبنك الأسئلة، مع بقاء مراجعة دورة حياة الاستيراد النهائية مطلوبة قبل اعتبارها اعتمادًا أمنيًا للأكاديمية.

لذلك Stage 15 لا تنشئ Backend أو Schema أو Migration، وتستخدم بيانات Mock محلية فقط.

## 2. الهدف

إنتاج نموذج UX قابل للمراجعة يغلق قبل البرمجة الأسئلة التالية:

1. ما الذي يراه المعلم المتعلم؟
2. ما الذي يراه المدرب؟
3. ما الذي يراه مدير المؤسسة؟
4. ما الذي يراه مسؤول الشهادات؟
5. كيف تعمل الاشتراكات الفردية والمؤسسية بصريًا دون الاعتماد على أنظمة الطالب؟
6. كيف تظهر حالات Entitlement/Contract/Seat/Certificate؟
7. كيف يفشل الوصول عند انعدام الصلاحية؟
8. كيف نحافظ على الفصل التام بين واجهة المعلمين وتطبيق الطلاب؟

## 3. قواعد العزل غير القابلة للتفاوض

- هوية `auth.users` يمكن أن تكون مشتركة لاحقًا، لكن لا يعاد استخدام `student app_role` في الأكاديمية.
- لا تظهر بيانات الطالب أو درجاته أو خدماته أو ولي أمره في أي شاشة Academy Mock.
- لا تستخدم واجهة الأكاديمية Wallet أو Subscription أو Certificates الخاصة بالطالب.
- لا توجد أزرار أو شاشات تمنح `qb_edit`, `qb_review`, `qb_publish`.
- تكامل بنك الأسئلة في Stage 15 يظهر كـ`Disabled / Future Published-Revision Integration` فقط.
- لا يوجد Admin bypass شامل؛ كل شاشة حساسة تعرض Capability مطلوبة بوضوح في مواصفات القبول.

## 4. Personas المعتمدة للنموذج

### A. Teacher Learner

معلم مسجل في برنامج تدريبي، يرى فقط البرامج المتاحة له، تسجيلاته، تقدمه، تقييماته، وشهاداته.

### B. Trainer

يدير الجلسات والتكليفات والتقييمات داخل Cohorts الممنوحة له فقط، ولا يرى Commerce أو عقود المؤسسة إلا ما يلزم تشغيل الدفعة.

### C. Organization Manager

يدير عقد المؤسسة، المقاعد، دعوات المعلمين، استخدام المقاعد، والفواتير ضمن المؤسسة فقط.

### D. Certificate Officer

يراجع Completion Evidence ويصدر/يلغي شهادة ضمن نطاقه؛ لا يملك تعديل المحتوى أو العقود.

### E. Academy Admin

يدير كتالوج الأكاديمية، الإصدارات، التعيينات والصلاحيات scoped؛ لا يحصل تلقائيًا على بيانات الطالب أو صلاحيات QB.

### F. Support Operator

يرى طلبات الدعم فقط مع أقل قدر من البيانات، وأي وصول حساس مؤقت ومؤرشف وفق Stage 14.

## 5. شاشات Teacher Learner

### 5.1 الصفحة الرئيسية

بطاقات Mock:

- البرامج الحالية
- نسبة التقدم
- الجلسة القادمة
- مهمة تحتاج تسليم
- شهادة جاهزة
- إشعار انتهاء entitlement

Acceptance:

- لا توجد أي بطاقات من تطبيق الطلاب.
- لا يوجد زر Wallet طالب.
- لا توجد مواد دراسية لطالب إلا إن كانت لاحقًا مصادر Published Read-only مع وسم واضح.

### 5.2 كتالوج البرامج

كل بطاقة تعرض:

- اسم البرنامج
- النسخة `program_version`
- الساعات
- نوع الوصول: فردي / مؤسسي
- السعر أو «ضمن عقد المؤسسة»
- حالة entitlement

الحالات Mock:

`AVAILABLE`, `ENTITLED`, `ENROLLED`, `EXPIRED`, `SOLD_OUT`, `NOT_ELIGIBLE`.

### 5.3 تفاصيل البرنامج

الأقسام:

- وصف
- النتائج التعليمية
- الدورات
- الوحدات
- المدربون
- متطلبات الإكمال
- سياسة الشهادة
- معلومات النسخة

قاعدة: التسجيل يثبت `program_version` ولا يتحرك تلقائيًا إلى نسخة أحدث.

### 5.4 تجربة التعلم

- قائمة الدروس
- تقدم محلي Mock
- نشاط نصي
- مهمة
- جلسة مباشرة كعنصر Placeholder
- تقييم Academy Mock مستقل

QB integration لا يظهر إلا كبطاقة مستقبلية معطلة تحمل:

`Published Question Revision Integration — Disabled until runtime gate PASS`.

### 5.5 الشهادات

- الشهادات النشطة
- الشهادات الملغاة
- QR/verification placeholder
- `program_version`
- تاريخ الإصدار
- حالة `ISSUED/REVOKED`

لا حذف صامت للشهادة.

## 6. شاشات Trainer

### 6.1 لوحة الدفعات

- Cohorts الموكلة
- عدد المسجلين
- جلسات قادمة
- تسليمات تحتاج مراجعة
- تنبيهات تقدم

### 6.2 تفاصيل Cohort

يسمح فقط بـ:

- قراءة قائمة أعضاء الدفعة
- إدارة الجلسات ضمن Cohort
- مراجعة submissions
- rubric feedback

لا يسمح بـ:

- عرض عقود غير مرتبطة
- تغيير entitlement
- إصدار شهادة مباشرة إذا لم توجد capability مستقلة
- تصفح بيانات طلاب تطبيق الثانوية

## 7. شاشات Organization Manager

### 7.1 لوحة المؤسسة

- العقد الحالي
- المقاعد المشتراة
- المقاعد المستخدمة
- المقاعد المتاحة
- تاريخ الانتهاء
- البرامج المشمولة

### 7.2 إدارة المقاعد

حالات Mock:

`AVAILABLE`, `INVITED`, `ASSIGNED`, `ACTIVE`, `REVOKED`, `EXPIRED`.

Acceptance:

- العضوية الزمنية للمؤسسة شرط.
- سحب المقعد لا يحذف التقدم التاريخي.
- انتهاء العقد يمنع الوصول الجديد دون حذف السجل.

### 7.3 الفواتير والعقود

عرض Read-only Mock للمدير المخول فقط.

Trainer لا يرى هذه الشاشة.

## 8. الاشتراك الفردي — UX contract

التدفق:

```text
Catalog
→ Program Version
→ Price
→ Checkout Mock
→ Order Mock
→ Payment Success Mock
→ Entitlement Active
→ Enrollment
```

حالات الفشل:

- payment failed
- entitlement pending
- duplicate purchase
- program version unavailable
- account not eligible

لا يتم استعمال أي كيان Wallet من تطبيق الطلاب.

## 9. الاشتراك المؤسسي — UX contract

التدفق:

```text
Organization
→ Contract
→ Product/Program Version
→ Seat Pool
→ Invite/Assign
→ Membership Check
→ Entitlement
→ Enrollment
```

حالات الفشل:

- contract expired
- no seats
- member outside organization
- seat already assigned
- program not included in contract

## 10. Certificate Officer UX

قائمة مرشحي الشهادة تعرض:

- المعلم
- البرنامج والنسخة
- completion percentage
- assessment status
- required evidence
- entitlement history

الإجراءان فقط:

- `Issue` بعد اكتمال الشروط
- `Revoke` مع سبب إلزامي

لا يوجد Delete.

## 11. Support UX

### L0

مقالات مساعدة فقط.

### L1

بيانات حساب محدودة وحالة entitlement العامة.

### L2

تفاصيل تشغيلية إضافية Scoped عند الحاجة.

### L3 Emergency Access

Mock flow يتطلب:

- سبب
- مدة قصيرة
- نطاق محدد
- موافقة أو policy gate
- audit event
- انتهاء تلقائي

## 12. Offline MVP Mock

النطاق فقط:

- Shell cache
- Catalog snapshot
- Text lesson cache
- Progress outbox

خارج Stage 15/MVP:

- protected video offline
- offline grading authority
- offline certificate issue
- offline QB published-revision cache قبل Gate

## 13. حالات الوصول المرفوض

يجب أن يحتوي النموذج على شاشات رفض فعلية، لا مجرد إخفاء زر:

1. Teacher يحاول فتح Org contract → `403 Academy scope`.
2. Trainer يحاول تعديل entitlement → `403 Capability required`.
3. Org Manager يحاول إصدار شهادة → `403 Certificate capability required`.
4. Support يحاول فتح assessment evidence دون grant → `403 Temporary access required`.
5. مستخدم بلا entitlement يحاول فتح برنامج مدفوع → `Access expired/not entitled`.
6. عضو انتهت عضويته المؤسسية → لا وصول جديد، مع بقاء history.
7. محاولة فتح Student profile من سياق Academy → `Not available in Academy boundary`.
8. محاولة الوصول إلى QB editor → `Feature disabled / no capability`.

## 14. Mock data pack

لا تستخدم بيانات حقيقية. الحد الأدنى:

- 6 Teacher Learners
- 2 Trainers
- 2 Organizations
- 2 Organization Managers
- 1 Certificate Officer
- 1 Support Operator
- 3 Programs
- نسختان على الأقل لبرنامج واحد
- 4 Cohorts
- عقدان: Active + Expired
- Entitlements متنوعة
- 5 Certificates: 3 issued + 1 revoked + 1 pending

كل اسم/هاتف/بريد اصطناعي بالكامل.

## 15. Accessibility / Arabic UX

Acceptance baseline:

- RTL كامل.
- Keyboard navigation.
- Focus visible.
- labels واضحة.
- لا يعتمد المعنى على اللون فقط.
- touch targets مناسبة للجوال.
- empty/error/loading states عربية واضحة.
- تواريخ وأرقام لا تكسر RTL.

## 16. Viewports المطلوبة للنموذج

- 360×800
- 390×844
- 412×915
- 768×1024
- 1280×900

المعيار: لا horizontal overflow غير مقصود.

## 17. Prototype structure المقترح لاحقًا عند التنفيذ غير الإنتاجي

إذا نُفذ Prototype ككود في مرحلة لاحقة، يجب أن يكون في نطاق معزول مثل:

```text
src/features/teacher-academy-prototype/
```

مع:

- static routes أو dev-only preview
- mock repository محلي
- zero Supabase writes
- zero migration
- zero production route exposure
- feature flag افتراضي OFF

Stage 15 الحالية توثيق Acceptance فقط ولا تنشئ هذا الكود.

## 18. Exit criteria

تنتقل الأكاديمية من Stage 15 إلى مرحلة Prototype code غير الإنتاجي فقط عندما:

```text
SCREEN_MATRIX_ACCEPTED=YES
ROLE_BOUNDARY_ACCEPTED=YES
COMMERCE_UX_ACCEPTED=YES
CERTIFICATE_UX_ACCEPTED=YES
SUPPORT_UX_ACCEPTED=YES
STUDENT_DATA_ISOLATION_ACCEPTED=YES
MOCK_ONLY=YES
PRODUCTION_WRITE=ZERO
```

ولا يفتح ذلك Backend/Schema gate.

فتح Backend/Schema يبقى مشروطًا مستقلًا بـ:

```text
QUESTION_BANK_FINAL_INDEPENDENT_RUNTIME_CLOSURE=PASS
IMPORT_LIFECYCLE_FINAL_INDEPENDENT_GATE=PASS
CRITICAL_SECURITY_BLOCKERS=0
ACADEMY_SCHEMA_AUTHORIZATION=EXPLICIT
```

## 19. القرار النهائي

```text
STAGE_15=STARTED_AND_FROZEN_AS_NONPROD_ACCEPTANCE_PACK
ACADEMY_PROGRAMMING_GATE=CLOSED
ACADEMY_BACKEND_GATE=CLOSED
ACADEMY_SCHEMA_GATE=CLOSED
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED
PRODUCTION_WRITE=NO
MIGRATION=NO
DEPLOY=NO
NEXT_SAFE_STAGE=NONPROD_MOCK_UI_PROTOTYPE_ONLY_AFTER_ACCEPTANCE
```
