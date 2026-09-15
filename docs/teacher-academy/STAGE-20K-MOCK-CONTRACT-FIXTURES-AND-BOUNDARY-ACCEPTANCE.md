# STAGE 20K — Mock Contract Fixtures & Boundary Acceptance

## الحالة

مرحلة تحليل وتصميم غير إنتاجية فقط لـ«أكاديمية معلم الثانوية»، مبنية على `main@2cfe143b81a841033fedd0b5e1c4f05d1ec54d74`.

- Production write: **NO**
- Migration apply: **NO**
- Deploy: **NO**
- Payment integration: **NO**
- Question Bank runtime cutover: **NO**
- Supabase schema/RLS/RPC change: **NO**
- Student role/profile reuse for Academy authorization: **NO**

## 1. إعادة تقييم بوابات البدء

### بنك الأسئلة — OPERATIONAL IMPROVEMENT / FORMAL HOLD

دمج PR #228 حسّن استقرار «اختبر فهمك» عمليًا عبر:

- إصلاح تعارض `lesson_assessments_code_uniq` باستخدام الهوية الموحدة عند النشر.
- مزامنة الإجابة الصحيحة إلى `question_options.is_correct`.
- إصلاح الإصدارات المنشورة المتأثرة بإصدارات جديدة غير مدمرة للسجل.
- إضافة تعديل/حذف الفقرات مع Audit وحفظ المحاولات السابقة والوسائط.
- منع `anon` من إجراءات الإدارة وقصرها على فريق المحتوى.

لكن هذا **لا يغلق** بوابة QB الرسمية؛ PR #58 ما يزال Draft، والـruntime الافتراضي فيه `LEGACY`، ولا يوجد Cutover معتمد إلى نموذج المراجعات كمرجع تشغيل كامل.

**الحالة:** `QUESTION_BANK = PASS_OPERATIONAL_IMPROVED / HOLD_FORMAL_CUTOVER`.

### عقد الاستيراد — PASS_OPERATIONAL_STRONG / HOLD_FORMAL

PR #96 ما يزال Draft/HOLD رسميًا. تحسن المسار التشغيلي واختبارات CF10/CF11 لا يحول العقد إلى مرجع نهائي قبل اعتماد V2 رسميًا وإغلاق بوابة الدمج.

**الحالة:** `IMPORT_CONTRACT = PASS_OPERATIONAL_STRONG / HOLD_FORMAL`.

### بنية المناهج — PASS_BASELINE / RELEASE-GOVERNANCE HOLD

بنية الصف/المسار/الفصل/المادة/الوحدة/الدرس وGolden Lesson كافية للرؤية والتصميم واختبارات العقود الوهمية.

لكن `admin_curriculum_force_delete` ما تزال موجودة في `main`. توجد Migration سابقة ألغت المنح، ثم Migration لاحقة أعادت `GRANT EXECUTE ... TO authenticated`. لذلك تبقى قدرة شديدة الحساسية يجب إغلاق حوكمتها قبل أي توسع إنتاجي جديد للأكاديمية.

**الحالة:** `CURRICULUM = PASS_BASELINE / SECURITY_GOVERNANCE_HOLD`.

### الأدوار — TARGET FROZEN / RUNTIME PARTIAL

النموذج التشغيلي الحالي لا يزال يعتمد `academy.capability_grants` على مستوى المستخدم/القدرة، بينما النموذج المستهدف المجمد للأكاديمية هو:

`actor -> organization -> program -> cohort -> capability`

ولا يجوز استخدام Student `app_role` أو Student profile لمنح أي Academy capability.

**الحالة:** `SCOPED_RBAC = TARGET_FROZEN / RUNTIME_PARTIAL`.

### الاشتراكات والعقود والاستحقاقات — TARGET FROZEN / RUNTIME NOT READY

وجود `academy.self_enroll(program_version_id)` يعني أن المسار التشغيلي لم يتحول بعد إلى العقد المستهدف:

`plan/order/contract -> entitlement -> enrollment -> learning -> completion -> certificate`

**الحالة:** `ENTITLEMENTS = TARGET_FROZEN / RUNTIME_NOT_READY`.

### بوابة الأمان

لا يمكن إعلان `ZERO_CRITICAL_SECURITY_BLOCKERS` ما دامت حوكمة force-delete، Scoped RBAC، وEntitlement enforcement غير مغلقة.

**القرار:** `ACADEMY_FULL_PROGRAMMING_GATE = CLOSED`.

## 2. هدف Stage 20K

تجميد **عقد Fixtures وهمي** يمكن استخدامه لاحقًا في النماذج التفاعلية واختبارات UX/A11y دون Backend أو Supabase أو Payment أو Question Bank runtime.

الهدف ليس إنشاء جداول أو API، بل تحديد بيانات الحالة التي يجب أن تفهمها واجهة الأكاديمية دون أي اعتماد على بيانات الطالب.

## 3. معرفات Fixture القياسية

كل Fixture يستخدم معرفات وهمية صريحة تبدأ بـ `mock_` حتى لا تختلط بسجلات إنتاجية:

- `mock_teacher_*`
- `mock_org_*`
- `mock_program_*`
- `mock_program_version_*`
- `mock_contract_*`
- `mock_entitlement_*`
- `mock_enrollment_*`
- `mock_certificate_*`

ممنوع استخدام بريد/هاتف/هوية/مدرسة حقيقية في Fixtures.

## 4. Teacher Persona Fixtures

### K-TEACHER-01 — Teacher Only

```text
persona=teacher
teacher_profile=complete
student_profile=absent
academy_role=teacher_learner
```

**قبول:** تعمل `/academy` دون إنشاء Student profile أو قراءة Student subscription.

### K-TEACHER-02 — Dual Persona

```text
identity=shared_auth_user
student_profile=present
teacher_profile=present
active_persona=teacher
```

**قبول:** الهوية مشتركة فقط؛ navigation/state/authorization/entitlements منفصلة.

### K-TEACHER-03 — Wrong Persona

```text
active_persona=student
requested_surface=academy_learning
```

**قبول:** رفض صريح أو طلب تبديل persona؛ لا توريث لـStudent role إلى Academy.

## 5. Plan & Entitlement Fixtures

### K-ENT-01 — No Entitlement

```text
plan=visible
entitlement=none
enrollment=none
```

**قبول:** يمكن استعراض البرنامج، ولا يبدأ محتوى مدفوع ولا ينشأ Enrollment.

### K-ENT-02 — Pending

```text
entitlement=pending
```

**قبول:** تعرض حالة انتظار فقط؛ لا تعلم ولا تقييم ولا شهادة.

### K-ENT-03 — Active

```text
entitlement=active
program_version=mock_program_version_math_v1
```

**قبول:** الوصول للإصدار المحدد فقط.

### K-ENT-04 — Suspended

**قبول:** يمنع نشاطًا جديدًا ولا يوسّع Scope.

### K-ENT-05 — Expired

**قبول:** يمنع البدء الجديد؛ معالجة السجل السابق تبقى حسب السياسة التجارية المعتمدة لاحقًا.

### K-ENT-06 — Revoked

**قبول:** رفض صريح دون كشف سبب أمني/تجاري داخلي.

## 6. Organization Contract Fixtures

### K-ORG-01 — Active Contract / Seats Available

```text
contract=active
organization=mock_org_01
seat_pool=25
assigned_seats=20
```

**قبول:** تخصيص المقعد يولّد فقط Entitlement scoped في النموذج الوهمي، ولا ينشئ Enrollment قبل تحقق الاستحقاق.

### K-ORG-02 — Seats Exhausted

```text
seat_pool=25
assigned_seats=25
```

**قبول:** رفض؛ لا Entitlement جزئي ولا زيادة صامتة.

### K-ORG-03 — Wrong Organization

**قبول:** deny-by-default؛ لا كشف لعدد المقاعد أو أسماء المعلمين أو تفاصيل العقد.

### K-ORG-04 — Suspended / Expired / Terminated

**قبول:** لا تخصيص مقاعد جديدة، لا توسيع Scope، ولا تحويل تلقائي إلى اشتراك فردي.

## 7. Scoped RBAC Fixtures

### Teacher Learner

يسمح: تعلمه، تقييمه، شهاداته.

يرفض: العقود، المقاعد، منح القدرات، تعديل البرامج، إدارة مستخدمين آخرين.

### Organization Admin

يسمح: إدارة عقد ومقاعد مؤسسته فقط.

يرفض: محتوى البرنامج، الدرجات، Academy platform capabilities، أي مؤسسة أخرى.

### Program Manager

يسمح: البرنامج/الإصدار المسند.

يرفض: عقود المؤسسة، برامج أخرى، Student app data.

### Cohort Coordinator

يسمح: الدفعات المسندة.

يرفض: توسيع Scope أو تعديل العقود أو منح الصلاحيات.

### Instructor

يسمح: أنشطة التدريب داخل البرنامج/الدفعة المسندة.

يرفض: RBAC، العقود، Entitlements، الإصدار الإداري للشهادات.

### Certificate Officer

يسمح: إجراءات الشهادة وفق Eligibility مثبتة.

يرفض: تعديل completion evidence أو نتائج التقييم.

## 8. Certificate Fixtures

### K-CERT-01 — Not Eligible

```text
completion=partial
assessment_passed=false
certificate=none
```

**قبول:** لا رمز تحقق، وتظهر المتطلبات الناقصة للمصرح له فقط.

### K-CERT-02 — Eligible / Not Issued

**قبول:** الأهلية لا تعني الإصدار؛ يجب تثبيت `program_version_id` وCompletion evidence.

### K-CERT-03 — Issued

```text
certificate=issued
verification_code=mock_verify_001
```

**قبول:** الشهادة مثبتة على إصدار البرنامج ولا تتغير بتحديث البرنامج.

### K-CERT-04 — Revoked

**قبول:** التحقق العام يعرض `REVOKED` دون سبب داخلي حساس.

### K-CERT-05 — Not Found

**قبول:** نتيجة محايدة لا تكشف وجود حساب أو بيانات شخصية.

## 9. حدود الخصوصية في التحقق العام

يمكن عرض الحد الأدنى المعتمد فقط:

- حالة الشهادة.
- اسم البرنامج.
- اسم حامل الشهادة بالقدر الذي تعتمد السياسة إظهاره.
- تاريخ الإصدار.
- رمز التحقق.

ممنوع في التحقق العام:

- البريد.
- الهاتف.
- Student profile data.
- المحاولات والتقييمات التفصيلية.
- أسباب السحب الداخلية.
- تفاصيل العقد أو المؤسسة غير اللازمة للتحقق.

## 10. Invariants واجبة القبول

أي Mock/UX لاحق يجب أن يفشل إذا خالف أحد الآتي:

1. Student `app_role` يمنح Academy capability.
2. Academy grant يمنح Student/Admin behavior.
3. Enrollment يظهر بلا Entitlement صالح.
4. Entitlement مؤسسي بلا organization/program scope.
5. Certificate تصدر بلا program version ثابت وCompletion evidence.
6. Teacher يرى عقد مؤسسة أخرى.
7. Public verification يكشف PII غير ضروري.
8. Persona switch يخلط cache/navigation بين الطالب والمعلم.
9. Fixture يستخدم معرف/بريد/هاتف إنتاجي حقيقي.
10. أي سيناريو وهمي يستدعي Supabase/API/Payment/QB runtime.

## 11. UX/A11y Acceptance Matrix

كل Fixtures السابقة يجب أن تكون قابلة للعرض على:

- 360px
- 390px
- 412px
- 768px
- 1280px

ومتطلبات القبول:

- RTL صحيح.
- Keyboard reachable.
- Focus ينتقل إلى نتيجة الإجراء/الرفض.
- الرفض لا يعتمد على اللون وحده.
- رسائل المستخدم لا تكشف تفاصيل أمنية داخلية.
- لا Student navigation داخل Academy workspace.
- لا Academy management links داخل Student workspace.

## 12. Decision Log غير المحسوم

لا يتم اختراع قيم قبل اعتماد المنتج/العمل التجاري:

- أسعار الخطط.
- مدة الاشتراك الفردي.
- الخصومات.
- فترة السماح بعد انتهاء الاشتراك/العقد.
- سياسة الاسترداد.
- سياسة نقل المقعد المؤسسي.
- مدى بقاء الوصول للمواد السابقة بعد انتهاء الاستحقاق.
- مستوى إظهار اسم حامل الشهادة في صفحة التحقق العامة.

## 13. بوابات الانتقال من التصميم إلى البرمجة

لا يبدأ Backend/DB للأكاديمية حتى تتحقق جميعها:

1. `QUESTION_BANK_RUNTIME_CUTOVER = PASS` أو قرار رسمي بعزل الأكاديمية عنه مع عقد ثابت مستقل.
2. `IMPORT_CONTRACT_FORMAL_GATE = PASS`.
3. Scoped RBAC runtime contract معتمد وقابل للاختبار.
4. Entitlement/contract lifecycle معتمد بدل `self_enroll` المفتوح.
5. `SECURITY_CRITICAL_BLOCKERS = ZERO`، بما في ذلك قرار نهائي لحوكمة force-delete.
6. فصل Teacher/Student authorization مثبت باختبارات deny-by-default.

## 14. الجزء التالي المسموح إذا بقيت البوابات مغلقة

`Stage 20L — UX State Inventory & Static Prototype Acceptance` فقط:

- تحويل Fixtures هنا إلى شاشات/حالات Mock ثابتة.
- لا Backend.
- لا Supabase.
- لا Migration.
- لا Deploy إنتاجي.
- لا Payment.
- لا Question Bank runtime integration.

## 15. الحالة النهائية

```text
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
QUESTION_BANK=PASS_OPERATIONAL_IMPROVED/HOLD_FORMAL_CUTOVER
IMPORT_CONTRACT=PASS_OPERATIONAL_STRONG/HOLD_FORMAL
CURRICULUM=PASS_BASELINE/SECURITY_GOVERNANCE_HOLD
SCOPED_RBAC=TARGET_FROZEN/RUNTIME_PARTIAL
ENTITLEMENTS=TARGET_FROZEN/RUNTIME_NOT_READY
TEACHER_STUDENT_SEPARATION=REQUIRED_AND_FROZEN

PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
PAYMENT_INTEGRATION=NO
QB_RUNTIME_INTEGRATION=NO
```
