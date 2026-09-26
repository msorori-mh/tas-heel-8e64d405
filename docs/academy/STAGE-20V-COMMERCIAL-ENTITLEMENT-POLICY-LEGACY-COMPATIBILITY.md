# Stage 20V — Commercial Entitlement Policy & Legacy Compatibility

الحالة: **تحليل وتصميم غير إنتاجي فقط**.

المرجع عند البدء: `main@8611663fff8b1056d12e3d26f64c929cea981bc9` بتاريخ 2026-09-24.

## 1. قرار البوابة بعد إعادة التحقق

بوابة البرمجة الكاملة لـ«أكاديمية معلم الثانوية» تبقى مغلقة.

### Question Bank

- PR #58 ما يزال `Open + Draft` وغير مدمج.
- الحزمة Design-only والـruntime الافتراضي الموثق فيها ما يزال `LEGACY`.
- لا يوجد formal cutover معتمد إلى Revision runtime.

**القرار:** `QUESTION_BANK=HOLD_FORMAL_CUTOVER`.

### Import Contract V2

- PR #96 ما يزال `Open + Draft/HOLD` وغير مدمج.
- الإصلاحات اللاحقة لمسارات المحتوى والتجارب والخرائط لا تمثل اعتمادًا رسميًا لعقد V2.
- شروط CF10/CF11 + PostgreSQL regression + E2E/RTL ما تزال ضمن شروط الاعتماد المعلنة في PR #96.

**القرار:** `IMPORT_CONTRACT_V2=HOLD_FORMAL_APPROVAL`.

### Curriculum / Roles / Subscriptions

- واجهة الأكاديمية ومخططها منفصلان عن تطبيق الطالب من حيث البناء والبيانات التشغيلية الأساسية.
- Runtime الحالي ما يزال يستدعي `academy.self_enroll` مباشرة من `apps/teacher-academy/src/lib/academy-api.ts`.
- منح الأكاديمية الحالية تعتمد `academy.capability_grants` على المستخدم والقدرة دون Scoped RBAC مؤسسي/برنامجي كامل.
- لا يوجد بعد runtime مكتمل لدورة `Plan/Contract → Entitlement → Enrollment`.

**القرار:** `CURRICULUM_BASE=AVAILABLE`, لكن `COMMERCIAL_ACCESS_TARGET=NOT_READY`.

### Security

- `public.admin_curriculum_force_delete(...)` ما تزال `SECURITY DEFINER`.
- تتحقق من Full Admin داخليًا، لكنها ممنوحة `EXECUTE` إلى `authenticated` في migration الحالية.
- الدالة تنفذ حذفًا عميقًا لبيانات تعلم وأسئلة ونشر، وتعلق immutable triggers محددة مؤقتًا داخل المعاملة.

**القرار:** `SECURITY_RELEASE_GATE=HOLD` حتى التقييد/التقاعد أو تحويلها إلى break-glass مضبوط ومختبر.

### النتيجة

```text
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
QUESTION_BANK=HOLD_FORMAL_CUTOVER
IMPORT_CONTRACT_V2=HOLD_FORMAL_APPROVAL
COMMERCIAL_ACCESS_TARGET=NOT_READY
SCOPED_RBAC=PARTIAL
SECURITY_RELEASE_GATE=HOLD
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
PAYMENT_INTEGRATION=NO
QB_RUNTIME_INTEGRATION=NO
STUDENT_APP_CHANGE=NO
```

## 2. لماذا Stage 20V هي الجزء الآمن التالي؟

Stage 20U جمّدت Storyboards وحدود Personas، لكن بقي تعارض مهم بين عقد الـMVP القديم والنموذج التجاري المستهدف:

- `docs/teacher-academy/mvp-launch-runbook.md` يفترض التسجيل الذاتي المباشر ويضع المدفوعات والمؤسسات خارج MVP.
- التصميم اللاحق للأكاديمية يفترض فصل `Plan/Contract/Entitlement/Enrollment` ودعم Individual + Organization Seats مستقبلًا.

لا يجوز بناء الاشتراكات فوق `self_enroll` مباشرة، ولا يجوز اعتبار وجود `self_enroll` عقدًا تجاريًا صالحًا.

Stage 20V تحل هذا الغموض تصميميًا فقط، دون تعديل أي Runtime أو Migration.

## 3. الفصل بين جيلين من عقد الوصول

### A. Legacy Academy MVP

الحالة الحالية وظيفيًا:

```text
Teacher Persona
→ Visible Program
→ self_enroll(programVersionId)
→ Enrollment
→ Learning
→ Assessment
→ Certificate
```

خصائصه:

- لا يوجد Plan تجاري.
- لا يوجد Contract.
- لا يوجد Entitlement مستقل.
- لا توجد Organization Seats.
- لا توجد دورة اشتراك أو grace/refund/cancellation.

يُصنف من الآن تصميميًا كالتالي:

`LEGACY_FREE_SELF_ENROLL_ACCESS`

هذا التصنيف لا يغير الإنتاج؛ هو تسمية حوكمة فقط لمنع استخدام المسار الحالي كأساس ضمني للاشتراكات المستقبلية.

### B. Target Commercial Academy

العقد المستهدف:

```text
Teacher Persona
→ Catalog Visibility
→ Plan / Contract
→ Entitlement
→ Enrollment
→ Learning
→ Assessment
→ Completion
→ Certificate
```

وللمؤسسات مستقبلًا:

```text
Organization Contract
→ Seat Pool
→ Seat Assignment
→ Teacher Entitlement
→ Enrollment
```

### قاعدة ملزمة

`Enrollment` ليس دليل شراء، و`Subscription` ليس Role، و`Role` ليس Entitlement.

كل كيان يجيب سؤالًا مختلفًا:

- Role: ماذا يستطيع المستخدم إدارته؟
- Plan: ما العرض التجاري؟
- Contract: ما الاتفاق الفعلي؟
- Entitlement: ما الذي يحق لهذه الـTeacher Persona الوصول إليه الآن؟
- Enrollment: في أي Program Version بدأ التعلم؟
- Certificate: ما الإنجاز الأكاديمي الذي تحقق؟

## 4. سياسة التوافق مع self_enroll

حتى اعتماد عقد تجاري جديد:

1. يبقى `self_enroll` مسارًا Legacy فقط، ولا يُعاد تفسيره كاشتراك.
2. لا يُنشئ وجود Enrollment أي حق تجاري جديد خارج Program Version نفسها.
3. لا يُستخدم Student subscription أو Student app_role لتبرير `self_enroll` داخل الأكاديمية.
4. لا تنشئ Organization seat عن طريق `self_enroll`.
5. لا تُربط أي بوابة دفع مستقبلية بالدالة مباشرة.
6. عند بناء Target runtime لاحقًا يجب أن يمر التسجيل الجديد عبر Entitlement صالح، حتى لو كان العرض مجانيًا.
7. العرض المجاني — إن اعتمد — يمثل `FREE_PLAN → ZERO_VALUE_CONTRACT/ENTITLEMENT` أو Entitlement صادرًا بسياسة واضحة، وليس تجاوزًا للعقد.

## 5. نموذج الاشتراكات دون افتراض أسعار

Stage 20V لا تعتمد سعرًا أو مدة أو عملة أو مزود دفع.

### Plan

حقول منطقية مستقبلية:

- `plan_code`
- `audience`: INDIVIDUAL | ORGANIZATION
- `access_scope`: PROGRAM | PROGRAM_FAMILY | CATALOG_SEGMENT
- `billing_mode`: FREE | ONE_TIME | RECURRING
- `duration_policy`
- `seat_policy`
- `certificate_policy_ref`
- `status`: DRAFT | ACTIVE | RETIRED

### Contract

يمثل اتفاقًا صادرًا من Plan Version محددة، ويجب ألا تتغير شروطه بأثر رجعي عند تعديل الخطة لاحقًا.

### Entitlement

الحالات المقترحة:

```text
PENDING
ACTIVE
SUSPENDED
EXPIRED
REVOKED
CONSUMED
```

القواعد:

- `ACTIVE` وحدها تسمح بإنشاء Enrollment جديد.
- انتهاء Entitlement لا يحذف Progress أو Enrollment التاريخي.
- تعليق Entitlement يمنع دخولًا جديدًا وفق السياسة، ولا يمنح صلاحية Admin.
- Revocation يحتاج سببًا وسجل تدقيق.
- لا ترث Teacher Persona Entitlement من Student Persona.

## 6. علاقة انتهاء الاشتراك بالتعلم والشهادة

القاعدة الآمنة المقترحة قبل اعتماد سياسة تجارية نهائية:

- انتهاء الاشتراك لا يمحو تقدمًا سابقًا.
- انتهاء الاشتراك لا يلغي شهادة إتمام صدرت بصورة صحيحة.
- الشهادة تصف إنجاز Program Version في وقت محدد، وليست إثباتًا على استمرار اشتراك حالي.
- إلغاء الشهادة يكون بحدث أكاديمي/نزاهة/إداري مستقل ومسبب، لا لمجرد انتهاء الاشتراك.
- صفحة التحقق يجب أن تميز مستقبلًا بين `VALID`, `REVOKED` وأي حالة أخرى معتمدة، دون كشف بيانات حساسة.

هذه قاعدة تصميمية موصى بها وليست Migration أو تغيير Runtime.

## 7. Organization Seats — عقد التصميم فقط

لا تنفيذ للمؤسسات الآن.

المفاهيم المجمدة:

```text
Organization
→ Contract
→ Seat Pool
→ Seat Assignment
→ Teacher Entitlement
```

Invariants:

1. Seat ليست Role.
2. مدير المؤسسة لا يحصل تلقائيًا على صلاحية إدارة محتوى الأكاديمية.
3. Seat assignment تمنح الوصول التعليمي فقط ضمن Scope العقد.
4. سحب Seat لا يمحو Progress التاريخي.
5. نقل Seat لا ينقل Progress أو Certificate من معلم إلى آخر.
6. أي صلاحية إدارية للمؤسسة يجب أن تكون Scoped capability مستقلة.
7. Student Persona لا يمكن أن تكون target لSeat الأكاديمية دون Teacher Persona مستقلة.

## 8. Persona Isolation — عقد تجاري صريح

| الأصل | Student Workspace | Teacher Academy |
|---|---|---|
| Profile | Student Profile | Teacher Profile |
| Role | Student/Admin roles الخاصة بالتطبيق | Academy Scoped Roles/Capabilities |
| Subscription | Student access | Academy Plan/Contract/Entitlement |
| Progress | Student learning progress | Teacher learning progress |
| Assessments | Student exams/practice | Academy assessments |
| Certificates | Student results إن وجدت | Academy completion certificates |

ممنوع:

- استخدام اشتراك الطالب لفتح برنامج معلم.
- استخدام Teacher Entitlement لفتح محتوى طلابي مدفوع.
- نسخ Role بين المساحتين.
- دمج سجل التقدم أو التقييم.
- عرض شهادة الأكاديمية باعتبارها نتيجة طالب.

## 9. الشهادات

التسمية الافتراضية تبقى:

**«شهادة إتمام برنامج تدريبي»**

ولا تستخدم كلمات مثل:

- «معتمدة»
- «اعتماد مهني»
- «رخصة»
- «ساعات معتمدة»

إلا بعد وجود اعتماد رسمي موثق يحدد الجهة، النطاق، المدة، والعبارة المسموح بها.

### الحد الأدنى لعقد الشهادة

- Certificate ID / verification code.
- Teacher Persona reference.
- Program Version ثابتة.
- Completion timestamp.
- Issuance timestamp.
- Status.
- Verification-safe display payload.
- Revocation metadata منفصل عند الحاجة.

## 10. القرارات التجارية التي لا يجوز افتراضها برمجيًا

الحالة الحالية: `NEEDS_OWNER_DECISION`.

### D1 — السعر والعملة

- هل البرامج كلها مجانية في البداية؟
- هل يوجد Free foundation + paid specialization؟
- هل التسعير لكل برنامج أم مدة وصول؟
- ما العملة/العملات؟

**القرار الحالي:** لا سعر ولا عملة في Runtime الجديد قبل الاعتماد.

### D2 — مدة الوصول

خيارات مستقبلية:

- دائم للـProgram Version.
- مدة محددة من التفعيل.
- مدة مرتبطة بالعقد المؤسسي.

**القرار الحالي:** غير معتمد.

### D3 — الإلغاء والاسترداد

يجب اعتماد:

- متى يصبح العقد غير قابل للاسترداد؟
- أثر بدء التعلم أو اجتياز التقييم.
- من يملك الموافقة على الاسترداد.
- كيف يعالج Entitlement بعد الاسترداد.

**القرار الحالي:** غير معتمد، لذلك لا Payment integration.

### D4 — Grace Period

- هل يستمر الوصول بعد انتهاء العقد لفترة سماح؟
- هل يسمح خلالها بالتقييم أو فقط بمراجعة المحتوى؟

**القرار الحالي:** غير معتمد.

### D5 — إعادة استخدام/نقل مقعد المؤسسة

يجب تحديد:

- هل المقعد قابل لإعادة التعيين؟
- متى؟
- ماذا يحدث بعد بدء Enrollment؟

**القرار الحالي:** غير معتمد.

### D6 — أثر المخالفات غير الأكاديمية على الشهادة

التوصية:

- تعليق الحساب أو انتهاء العقد لا يلغي شهادة صحيحة تلقائيًا.
- Revocation للشهادة يحتاج سببًا مستقلًا معتمدًا وسجل تدقيق.

**القرار:** يحتاج اعتماد سياسة نهائية قبل التنفيذ.

## 11. UX States الناتجة عن هذا العقد

الواجهة المستقبلية يجب أن تفرق بين:

- `PROGRAM_VISIBLE_NO_ENTITLEMENT`
- `PLAN_SELECTION_REQUIRED`
- `CONTRACT_PENDING`
- `ENTITLEMENT_ACTIVE_NOT_ENROLLED`
- `ENROLLED_ACTIVE`
- `ENTITLEMENT_SUSPENDED`
- `ENTITLEMENT_EXPIRED`
- `ENTITLEMENT_REVOKED`
- `PROGRAM_VERSION_RETIRED`
- `CERTIFICATE_VALID`
- `CERTIFICATE_REVOKED`

ولا تستخدم رسالة عامة من نوع «غير مشترك» لكل الحالات.

## 12. Non-Production Acceptance Vectors المستقبلية

عند فتح بوابة implementation غير الإنتاجي يمكن تنفيذ fixtures/validators فقط لهذه الحالات، دون Network/Supabase:

1. Student-only identity لا يملك Academy Entitlement.
2. Teacher-only identity لا يرث Student subscription.
3. Dual Persona تحمل عقدين مستقلين دون مزج.
4. Catalog visibility لا تعني Entitlement.
5. ACTIVE Entitlement يسمح بEnrollment واحد idempotent.
6. EXPIRED Entitlement يرفض Enrollment جديدًا.
7. SUSPENDED Entitlement يرفض الوصول حسب السياسة.
8. Revoked Entitlement لا يحذف progress.
9. Expiry لا يلغي Certificate صحيحة.
10. Seat transfer لا ينقل progress.
11. Organization Admin capability لا تمنح Content Admin.
12. Program Version retirement لا يعيد كتابة شهادة قديمة.
13. Free Plan يظل يمر بعقد Entitlement واضح ولا يستخدم bypass.
14. Student app_role لا يفتح Academy admin route.
15. Teacher capability لا تمنح وصولًا إلى بيانات طلاب التطبيق.

## 13. شروط الانتقال لأول implementation غير إنتاجي

لا ينتقل هذا المسار إلى code حتى يتحقق أحد الآتي رسميًا:

### Full target implementation

يلزم جميعًا:

- Question Bank formal gate PASS إذا كان الجزء يعتمد عليه.
- Import Contract V2 formal gate PASS إذا كان الجزء يعتمد على استيراد المحتوى.
- Scoped RBAC contract معتمد.
- Entitlement contract معتمد.
- Security release blocker مغلق.

### Isolated mock-only implementation

يمكن لاحقًا — وبقرار صريح — تنفيذ:

- pure TypeScript types.
- deterministic reducers/state machines.
- mock fixtures.
- component tests/A11y tests بلا Network.

لكن لا يتم ذلك تلقائيًا ما دامت بوابة البرمجة المحددة للمسار لم تُفتح رسميًا.

## 14. نطاق ممنوع في هذه المرحلة

- لا تعديل `apps/teacher-academy`.
- لا تعديل تطبيق الطالب.
- لا تعديل Supabase schema/RLS/RPC.
- لا Migration.
- لا كتابة Production.
- لا نشر.
- لا مزود دفع.
- لا ربط Question Bank runtime.
- لا إنشاء Organization data حقيقية.
- لا تغيير على الشهادات الحالية.

## 15. قرار Stage 20V

```text
STAGE_20V=DESIGN_ONLY
LEGACY_SELF_ENROLL=DOCUMENTED_COMPATIBILITY_PATH
TARGET_ENTITLEMENT_MODEL=DESIGNED_NOT_IMPLEMENTED
STUDENT_TEACHER_COMMERCIAL_BOUNDARY=FROZEN
ORG_SEATS=DESIGN_ONLY
CERTIFICATE_SUBSCRIPTION_COUPLING=PROHIBITED_BY_DEFAULT
COMMERCIAL_POLICY_DECISIONS=PENDING_OWNER_APPROVAL
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
```

الجزء الآمن التالي — إذا بقيت البوابات مغلقة — هو توثيق **Support / Appeals / Certificate Revocation / Organization-seat operational workflows** على مستوى الحالات والعقود فقط، دون تنفيذ Runtime.