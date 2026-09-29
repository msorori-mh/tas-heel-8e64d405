# Stage 20U — UX Storyboards & Persona Boundary Contracts

الحالة: **تحليل وتصميم غير إنتاجي فقط**.

المرجع عند البدء: `main@8611663fff8b1056d12e3d26f64c929cea981bc9` بتاريخ 2026-09-23.

## 1. قرار البوابة

بوابة البرمجة الكاملة لـ«أكاديمية معلم الثانوية» تبقى مغلقة.

### Question Bank

- PR #58 ما يزال `Open + Draft` وغير مدمج.
- الحزمة نفسها Design-only، والـruntime الافتراضي الموثق فيها ما يزال `LEGACY`.
- لا يوجد formal cutover معتمد يسمح باعتبار Question Bank runtime اعتمادًا نهائيًا للأكاديمية.

**القرار:** `HOLD_FORMAL_CUTOVER`.

### Import Contract V2

- PR #96 ما يزال `Open + Draft/HOLD` وغير مدمج.
- التحسينات اللاحقة في مسارات النشر، ومنها إصلاحات التجارب والخرائط الذهنية، تقوي المسار التشغيلي لكنها لا تستبدل شروط الاعتماد الرسمية المعلنة في PR #96.
- ما تزال بوابة V2 الرسمية تتطلب إغلاق CF10/CF11 والعقود واختبارات PostgreSQL/E2E والـRTL كما هو موثق في PR #96.

**القرار:** `HOLD_FORMAL_APPROVAL`.

### Curriculum / Roles / Subscriptions

- بنية Teacher Academy موجودة ومستقلة عن Student workspace في الواجهة.
- Runtime الحالي ما يزال يحتوي `self_enroll(programVersionId)` الذي يستدعي `academy.self_enroll` مباشرة.
- نموذج `academy.capability_grants` الحالي يمنح capability على `(user_id, capability)` دون scope مؤسسي/برنامجي في المفتاح الفعال.
- لذلك لم يكتمل بعد نموذج `Plan/Contract → Entitlement → Enrollment` ولا Scoped RBAC المستهدف تجاريًا.

**القرار:** `PARTIAL_RUNTIME / TARGET_NOT_READY`.

### Security

- `public.admin_curriculum_force_delete(...)` ما تزال `SECURITY DEFINER`.
- الدالة تفحص Full Admin داخليًا، لكنها ممنوحة `EXECUTE` لدور `authenticated`.
- الدالة قادرة على حذف نشاط تعلم، محاولات، أسئلة، محتوى ونشر، وتقوم بتعطيل immutable triggers مؤقتًا أثناء purge.
- لذلك تبقى Release-governance blocker قبل أي توسع إنتاجي جديد للأكاديمية، إلى أن تُقيد/تُقاعد أو تتحول إلى break-glass مضبوط ومختبر.

**القرار:** `SECURITY_GATE=HOLD`.

### النتيجة

```text
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
QUESTION_BANK=HOLD_FORMAL_CUTOVER
IMPORT_CONTRACT_V2=HOLD_FORMAL_APPROVAL
SCOPED_RBAC=PARTIAL
CONTRACT_ENTITLEMENT_ENROLLMENT=NOT_READY
SECURITY_RELEASE_GATE=HOLD
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
PAYMENT_INTEGRATION=NO
QB_RUNTIME_INTEGRATION=NO
STUDENT_APP_CHANGE=NO
```

## 2. لماذا Stage 20U آمنة الآن؟

Stage 20T حددت أن الجزء التالي الآمن، إذا بقيت البوابات مغلقة، هو Storyboards وUX state contracts فقط.

Stage 20U تنفذ ذلك حرفيًا:

- لا تضيف application runtime.
- لا تضيف Network أو Supabase calls.
- لا تضيف schema أو migration أو RPC أو RLS.
- لا تحدد مزود دفع أو سعرًا أو مدة اشتراك.
- لا تمنح أي صلاحية جديدة.
- لا تغير Student app.

الهدف هو إزالة الغموض من تجربة المعلم قبل السماح بأول implementation غير إنتاجي لاحقًا.

## 3. القاعدة العليا للفصل بين Personas

الهوية التقنية الواحدة قد تحمل Student Persona وTeacher Persona، لكن كل Persona لها مساحة مستقلة وظيفيًا.

```text
Shared Identity
├── Student Persona
│   ├── Student Profile
│   ├── Student Roles
│   ├── Student Subscription/Access
│   ├── Student Progress
│   └── Student Certificates/Results if any
│
└── Teacher Persona
    ├── Teacher Profile
    ├── Academy Roles + Scoped Capabilities
    ├── Academy Contract/Entitlement
    ├── Academy Enrollment
    ├── Teacher Learning Progress
    └── Academy Certificates
```

### Invariants

1. Student `app_role` لا يمنح Academy capability.
2. Student subscription لا ينشئ Academy entitlement.
3. Student progress لا يدخل في Teacher learning progress.
4. Student assessment history لا يدخل في Academy assessments.
5. Academy certificate لا تُعرض كشهادة طالب.
6. Teacher role لا يمنح وصولًا إلى بيانات الطالب إلا بعقد وصلاحية مستقلة مصممة لذلك مستقبلًا.
7. Dual Persona لا تعني دمج الصلاحيات؛ تعني فقط أن الحساب يملك مدخلين واضحين لمساحتي عمل منفصلتين.

## 4. Storyboard A — الدخول إلى مساحة المعلم

### A1 — مستخدم بلا Teacher Persona

```text
Landing
→ دخول المعلم
→ Google Authentication
→ Teacher Persona Check
→ لا يوجد Teacher Profile
→ Create/Complete Teacher Profile
→ Academy Home
```

الحالات:

- `SIGNED_OUT`
- `AUTHENTICATING`
- `AUTHENTICATED_NO_TEACHER_PROFILE`
- `TEACHER_PROFILE_INCOMPLETE`
- `TEACHER_ACTIVE`
- `TEACHER_SUSPENDED`

### قواعد الواجهة

- لا يُقرأ Student role لتقرير أهلية Teacher Persona.
- إذا كان للمستخدم Student Persona فقط، يعامل كـ`AUTHENTICATED_NO_TEACHER_PROFILE` داخل مسار الأكاديمية.
- إذا كانت Teacher Persona معلقة، تظهر شاشة معلومة واضحة ولا يتم تحويل المستخدم إلى Student workspace تلقائيًا.
- لا تعرض شاشة التعليق أي أدوات Admin أو Content Manager.

## 5. Storyboard B — Dual Persona Switch

### B1 — حساب طالب + معلم

```text
Authenticated Identity
→ Workspace Chooser
   ├── مساحة الطالب
   └── أكاديمية المعلم
```

### العقد

- التبديل يغير workspace context فقط.
- كل workspace يعيد تقييم صلاحياته من مصدره الخاص.
- لا يتم نسخ role/capability/subscription/progress من workspace إلى الآخر.
- الرجوع من Academy إلى Student لا يحتفظ بأي Academy capability كصلاحية Student.

### حالات الرفض

- `STUDENT_ONLY`: يظهر مدخل الطالب، ومدخل المعلم يقود إلى إنشاء Teacher Persona وليس إلى وراثة Student role.
- `TEACHER_ONLY`: يظهر مدخل الأكاديمية، ويمكن إبقاء Student entry كمسار مستقل دون إنشاء Student Persona تلقائيًا.
- `DUAL_ACTIVE`: يظهر الاختيار الصريح.
- `TEACHER_SUSPENDED`: Student workspace يبقى مستقلًا إن كان صالحًا؛ تعليق Teacher Persona لا يعلق Student Persona تلقائيًا.

## 6. Storyboard C — Academy Home

### الهدف

صفحة البداية للمعلم يجب أن تجيب بسرعة عن أربعة أسئلة:

1. ماذا أستطيع أن أدرس الآن؟
2. أين توقفت؟
3. هل لدي برنامج يتطلب إجراء؟
4. ما الشهادات التي حصلت عليها؟

### المناطق

```text
Academy Home
├── Continue Learning
├── My Active Programs
├── Recommended / Available Programs
├── Access Alerts
└── Recent Certificates
```

### الضوابط

- `Available Programs` لا يعني أن المستخدم يملك Entitlement.
- `My Active Programs` لا تظهر إلا Enrollment خاصًا بالـTeacher Persona الحالية.
- لا تظهر أي Student courses أو Student completion metrics.
- Content/Admin shortcuts تظهر فقط عند capability صريحة في Academy scope، وليس بسبب Full Admin في Student UI إلا إذا كان عقد التحكم في الأكاديمية يمنحه ذلك صراحة مستقبلًا.

## 7. Storyboard D — Training Catalog

### حالات بطاقة البرنامج

```text
CATALOG_VISIBLE
ACCESS_UNKNOWN
ACCESS_NOT_GRANTED
ACCESS_PENDING
ACCESS_GRANTED
ENROLLED
COMPLETED
UNAVAILABLE
```

`ACCESS_*` هنا عقد UX؛ لا يُفترض أن Runtime الحالي يطبقه بعد.

### CTA contract

| الحالة | الإجراء الظاهر |
|---|---|
| `CATALOG_VISIBLE + ACCESS_NOT_GRANTED` | عرض تفاصيل الوصول/الاشتراك فقط |
| `ACCESS_PENDING` | عرض حالة الطلب دون Enrollment |
| `ACCESS_GRANTED` | السماح ببدء/استكمال التسجيل مستقبلًا |
| `ENROLLED` | متابعة التعلم |
| `COMPLETED` | مراجعة البرنامج / الشهادة إن كانت مستحقة |
| `UNAVAILABLE` | سبب عدم الإتاحة دون تجاوز |

لا يُستخدم `self_enroll` كتصميم تجاري نهائي في هذه Storyboard.

## 8. Storyboard E — Program Details

### محتوى الشاشة

- اسم البرنامج.
- Program Version المنشورة التي سيُثبت عليها Enrollment.
- الجمهور المستهدف.
- Learning outcomes.
- الوحدات والوقت التقديري التعليمي.
- متطلبات الإكمال.
- نوع التقييم النهائي إن وجد.
- نوع الشهادة الممكنة.
- Access/Entitlement status منفصل عن وصف البرنامج.

### لا نعرض

- سعرًا غير معتمد.
- مدة اشتراك غير معتمدة.
- خصمًا أو refund policy غير معتمدة.
- عبارة «معتمد مهنيًا» دون وثيقة اعتماد رسمية.

## 9. Storyboard F — Access / Subscription / Entitlement

هذا المسار تصميمي فقط ولا يحدد تنفيذ Commerce.

### Individual

```text
Teacher
→ Select Program/Plan
→ Contract/Order intent
→ Entitlement Pending
→ Entitlement Active
→ Enrollment Allowed
```

### Organization Seats

```text
Organization Contract
→ Seat Pool
→ Organization Manager assigns seat
→ Teacher Entitlement Active
→ Enrollment Allowed
```

### Invariants

- الدفع — إن أضيف لاحقًا — لا يكتب Enrollment مباشرة.
- Contract لا يساوي Entitlement.
- Entitlement لا يساوي Enrollment.
- Enrollment يثبت Program Version.
- Organization Manager لا يحصل على محتوى أو progress لمعلم خارج scope مؤسسته.
- Seat assignment لا يمنح Content Manager/Admin capability.

### قرارات تبقى مفتوحة

- السعر.
- مدة العقد/الاشتراك.
- التجديد.
- grace period.
- refund.
- نقل المقعد بين المعلمين.
- أثر إلغاء entitlement على Enrollment النشط.

لا تُحسم هذه القرارات في Stage 20U.

## 10. Storyboard G — Enrollment Boundary

### Future target

```text
Teacher Persona Active
AND Entitlement Active
AND Program Version Published
AND Program Access Rules Pass
→ Create Enrollment
```

### حالات الرفض

- `NO_TEACHER_PERSONA`
- `TEACHER_SUSPENDED`
- `NO_ENTITLEMENT`
- `ENTITLEMENT_PENDING`
- `ENTITLEMENT_SUSPENDED`
- `PROGRAM_NOT_PUBLISHED`
- `PROGRAM_VERSION_MISMATCH`
- `SCOPE_DENIED`

رفض Enrollment لا يحول تلقائيًا إلى Student subscription أو Student role fallback.

## 11. Storyboard H — Learning Workspace

```text
My Program
→ Program Overview
→ Module
→ Learning Unit
→ Practice / Reflection
→ Unit Completion
→ Next Unit
```

### واجهة الوحدة

- المخرجات المستهدفة.
- محتوى الوحدة.
- النشاط/التطبيق.
- حالة الإكمال.
- العودة لمسار البرنامج.

### الثبات

- Enrollment يظل مربوطًا بـProgram Version التي بدأ بها المعلم.
- نشر Version أحدث لا يبدل Version النشطة للمعلم تلقائيًا.
- Offline behavior — إن توسع مستقبلًا — يبقى Academy-owned ولا يعيد استخدام Student offline authorization كبديل لصلاحيات الأكاديمية.

## 12. Storyboard I — Progress

### مستويات العرض

```text
Program Progress
├── Module Progress
├── Unit Completion
├── Required Activities
└── Assessment Readiness
```

### حالات readiness

- `NOT_STARTED`
- `IN_PROGRESS`
- `LEARNING_COMPLETE_ASSESSMENT_PENDING`
- `ASSESSMENT_READY`
- `COMPLETION_PENDING`
- `COMPLETED`

النسب والأرقام هنا تقدم المعلم فقط.

## 13. Storyboard J — Assessment

### قبل التقييم

- يوضح سبب الجاهزية أو عدمها.
- لا يسمح Student Question Bank role بفتح Teacher assessment.
- أي تكامل مستقبلي مع Question Bank يتطلب Formal QB gate.

### بعد التقييم

الحالات التصميمية:

```text
NOT_ATTEMPTED
IN_PROGRESS
SUBMITTED
PASSED
NOT_PASSED
REVIEW_REQUIRED
```

لا يثبت Stage 20U حد نجاح رقميًا.

### الخصوصية

- نتيجة المعلم لا تدخل Student analytics.
- Content Manager لا يرى نتائج فردية إلا إذا كان role/scope المستقبلي يسمح بذلك صراحة.
- Organization reporting يجب أن يحدد لاحقًا مستوى التجميع/التفصيل المسموح قبل التنفيذ.

## 14. Storyboard K — Certificates

### القائمة

```text
Certificates
├── Issued
├── Pending Eligibility
└── Verification Issue
```

### تفاصيل الشهادة

- Certificate ID.
- اسم المعلم.
- اسم البرنامج.
- Program Version.
- تاريخ الإصدار.
- حالة تحقق واضحة.

التسمية الافتراضية:

**شهادة إتمام برنامج تدريبي**

### لا يُحسم بعد

- سياسة revocation.
- أثر انتهاء entitlement بعد إصدار الشهادة.
- جهة الاعتماد المهني.
- public verification URL contract.

## 15. Storyboard L — Organization Seats Dashboard

### Organization Manager

يرى فقط:

- اسم المؤسسة/النطاق الذي يديره.
- عدد المقاعد وفق العقد المستقبلي.
- المقاعد غير المسندة.
- المقاعد المسندة داخل نفس scope.
- حالة entitlement المرتبطة بالمقعد.

لا يرى تلقائيًا:

- Student profiles.
- مستخدمي مؤسسات أخرى.
- Academy Admin controls.
- محتوى التحرير.
- تفاصيل تقييم معلم فردية دون Policy معتمدة.

## 16. Storyboard M — Academy Staff / Scoped RBAC

### Target scope model

```text
Capability Grant
├── subject / program / organization / global scope
├── capability
├── grantee
├── grant authority
├── valid state
└── audit trail
```

### الأدوار التصميمية

- `TEACHER_LEARNER`
- `ACADEMY_CONTENT_MANAGER`
- `ACADEMY_REVIEWER`
- `ORGANIZATION_MANAGER`
- `ACADEMY_ADMIN`

هذه Labels تصميمية، وليست إعلانًا عن Runtime roles جاهزة.

### قاعدة الرفض

إذا لم يتطابق capability + scope مع العملية، يكون القرار `DENY` حتى لو كان المستخدم يمتلك Student admin/editor role.

## 17. State Contract موحد للواجهات

كل شاشة Academy مستقبلية يجب أن تميز بين:

```text
LOADING
READY
EMPTY
ACTION_REQUIRED
ACCESS_PENDING
ACCESS_DENIED
SUSPENDED
RECOVERABLE_ERROR
FATAL_CONTRACT_ERROR
```

### قواعد الرسائل

- لا تحول `ACCESS_DENIED` إلى شاشة فارغة.
- لا تحول فشل backend إلى `NO_DATA`.
- لا تعرض CTA يؤدي إلى عملية لا يسمح بها state الحالي.
- لا تسرب أسماء roles أو جداول داخلية للمستخدم النهائي.
- تعرض سببًا مفهومًا وخطوة تالية آمنة عندما تكون موجودة.

## 18. Responsive / Accessibility Contract

قبل أي implementation إنتاجي، الـmock/component stage يجب أن يثبت:

- RTL صحيح على الهاتف والتابلت والكمبيوتر.
- focus order منطقي بلوحة المفاتيح.
- labels قابلة للقراءة لقارئات الشاشة.
- حالات access ليست معتمدة على اللون وحده.
- أزرار الـCTA لها labels صريحة.
- تبديل Student/Teacher workspace واضح ولا يمكن أن يحدث بالخطأ نتيجة زر رجوع أو refresh.
- لا horizontal overflow في بطاقات البرامج والشهادات والمقاعد.

## 19. أول implementation غير إنتاجي مسموح مستقبلًا

لا يبدأ إلا عند تحقق بوابة مناسبة رسميًا.

النطاق المسموح عندها:

1. Pure TypeScript domain types للحالات المجمدة فقط.
2. Mock fixtures بدون أي بيانات إنتاج.
3. Pure reducers/validators للحالات والانتقالات.
4. Mock UI components/storyboards.
5. Component + A11y + RTL tests.

### محظور في أول slice

- Supabase client calls.
- Network calls.
- Payment calls.
- Production auth coupling.
- Migration/RLS/RPC/schema.
- QB runtime integration.
- Student app authorization reuse.

## 20. Evidence required لفتح البوابة البرمجية الكاملة

### QB gate

- Formal decision بإغلاق/دمج مسار cutover المناسب.
- Runtime default لم يعد LEGACY وفق قرار موثق.
- Backfill/cutover/rollback evidence معتمد.

### Import gate

- PR #96 أو بديله الرسمي يصل إلى PASS/merged state.
- CF10/CF11 V2 evidence مكتمل.
- PostgreSQL V1+V2 regressions PASS.
- E2E/RTL/build evidence مكتمل.

### Roles / Subscription gate

- Scoped RBAC contract معتمد.
- Contract/Entitlement/Enrollment lifecycle معتمد.
- قرار صريح بشأن `self_enroll` الانتقالي: تقاعد أو حصر أو استبدال.
- سياسات individual/org seats الأساسية معتمدة دون افتراضات ضمنية.

### Security gate

أحد المسارين فقط:

1. **Retirement:** إزالة/تعطيل prelaunch force-delete path بعد اكتمال الحاجة إليه.
2. **Constrained break-glass:** صلاحية ضيقة، مسار استدعاء مضبوط، audit، denial tests، وإثبات عدم كون `authenticated` grant مسارًا عامًا فعالًا.

## 21. أثر أحدث main

أحدث `main@8611663fff8b1056d12e3d26f64c929cea981bc9` يضيف تحليلات عامة ومتدرجة لمتابعة اكتمال المحتوى.

هذا مفيد لجودة إدارة محتوى تطبيق الطالب، لكنه لا يغلق أيًا من بوابات الأكاديمية الأربع أعلاه ولا يغير قرار Stage 20U.

## 22. Final Decision

```text
STAGE_20U=DESIGN_ONLY_STARTED
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
TEACHER_STUDENT_PERSONA_BOUNDARY=FROZEN_FOR_UX
UX_STORYBOARDS=FROZEN_FOR_REVIEW
SCOPED_RBAC_RUNTIME=PARTIAL
ENTITLEMENT_RUNTIME=NOT_READY
SECURITY_GATE=HOLD
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
```

Stage 20U لا تمنح إذنًا لأي كتابة إنتاجية، ولا Migration، ولا نشر، ولا تكامل دفع أو Question Bank runtime.