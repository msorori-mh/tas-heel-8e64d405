# Stage 20Q — Canonical Domain Contracts & Non-Production Test Vectors

الحالة: **تحليل/تصميم غير إنتاجي فقط**.

المرجع: `main@7520a6a22ec9fcd4b18f6d4b12ad221fd30365d4`.

## 1) قرار البوابة الحالي

بوابة البرمجة الكاملة لـ«أكاديمية معلم الثانوية» تبقى **مغلقة**.

الأسباب التي لا تزال قائمة على المرجع الحالي:

- بنك الأسئلة: PR #58 ما يزال Draft/Open، ويثبت صراحة أن runtime الافتراضي يبقى `LEGACY` دون Cutover رسمي.
- عقد الاستيراد: PR #96 ما يزال Draft/HOLD، ولا يزال CF10/CF11 وPostgreSQL/E2E جزءًا من شروط الاعتماد.
- الأدوار: `academy.capability_grants` الحالية تمنح capability على مستوى المستخدم، وليست Scoped RBAC مكتملة بالمؤسسة/البرنامج/الدفعة.
- الاشتراكات والاستحقاقات: `academy.self_enroll(program_version_id)` ما يزال مسارًا تشغيليًا مباشرًا، ولا توجد بعد دورة Runtime مكتملة من `Contract → Entitlement → Enrollment`.
- الأمان: `admin_curriculum_force_delete` ما تزال SECURITY DEFINER وممنوحة EXECUTE لدور `authenticated` رغم تحقق Full Admin داخل الدالة، وتملك حذف بيانات تعلم/أسئلة/نشر وتعطيل immutable triggers مؤقتًا؛ لذلك تبقى Release-governance blocker.

لذلك هذه المرحلة لا تضيف Domain runtime ولا schema ولا RPC ولا migration، وإنما تثبّت العقد المنطقي الذي يجب أن يسبق أي تنفيذ لاحق.

## 2) هدف Stage 20Q

تحويل الرؤية السابقة إلى **Canonical Domain Contracts** موحدة، حتى لا يبدأ التنفيذ لاحقًا بنماذج متضاربة بين الواجهة، قاعدة البيانات، الاختبارات والاشتراكات.

المخرجات هنا تحدد:

1. الكيانات المنطقية الأساسية.
2. الحقول الإلزامية على مستوى العقد، دون فرض schema إنتاجي.
3. invariants غير القابلة للكسر.
4. state transitions.
5. error contract موحد للواجهة.
6. test vectors غير إنتاجية مستقبلية.
7. حدود الفصل بين الطالب والمعلم.

## 3) عقد الهوية والشخصية Persona Contract

### الأنواع

- `STUDENT_PERSONA`
- `TEACHER_PERSONA`

يمكن لنفس `auth_user_id` امتلاك الشخصيتين، لكنهما تبقيان نطاقين مستقلين وظيفيًا.

### Teacher Persona — الحد الأدنى للعقد

```text
teacher_persona_id
owner_auth_user_id
status: ACTIVE | SUSPENDED | ARCHIVED
professional_profile_ref
created_at
updated_at
```

### invariants

- `Student profile` ليس Teacher profile.
- `public.profiles.app_role` لا يُستخدم كمصدر تفويض للأكاديمية.
- Student subscription لا تمنح Teacher entitlement.
- Teacher certificate لا تظهر في Student certificate space.
- تعليق Student persona لا يعلّق Teacher persona تلقائيًا، والعكس صحيح، إلا بقرار أمني أعلى مستقل ومعلن.
- مشاركة الجلسة التقنية لا تعني مشاركة الدور أو الاشتراك أو الصلاحية.

## 4) عقد Scoped RBAC

### Canonical Grant

```text
academy_grant_id
actor_user_id
capability
scope_type: ACADEMY_GLOBAL | ORGANIZATION | PROGRAM | COHORT
scope_id: nullable only when scope_type = ACADEMY_GLOBAL
granted_by
valid_from
valid_until
revoked_at
revoke_reason
```

### قاعدة التفويض

السماح يتطلب تطابقًا صريحًا بين:

`actor + capability + scope_type + scope_id + active time window`

ولا يكفي وجود capability عامة على المستخدم.

### الأدوار المرجعية

- `TEACHER_LEARNER`: تعلم شخصي فقط.
- `ACADEMY_SUPER_ADMIN`: إدارة الأكاديمية عالميًا فقط.
- `PROGRAM_MANAGER`: إدارة برنامج/برامج ضمن scope.
- `ORGANIZATION_MANAGER`: إدارة مؤسسة محددة.
- `CONTENT_MANAGER`: محتوى ضمن scope محدد.
- `ASSESSMENT_MANAGER`: تقييم ضمن scope محدد.
- `AUDITOR`: قراءة وتدقيق دون تعديل.
- `SUPPORT_READONLY`: دعم مقيد بأقل بيانات لازمة.

### حالات رفض إلزامية

- Student-only identity يملك صفر Academy grants.
- Teacher learner لا يمنح نفسه grant أو entitlement.
- Program manager لا يصل إلى مؤسسة خارج scope.
- Organization manager لا يعدل Global catalog.
- Content manager لا يصدر شهادة ولا يغير عقدًا تجاريًا.
- Auditor لا ينفذ write بأي مسار.

## 5) عقد Plan / Offer

هذا كيان تجاري وصفي فقط ولا يمنح الوصول بذاته.

```text
plan_id
plan_code
name
beneficiary_type: INDIVIDUAL_TEACHER | ORGANIZATION_SEATS
status: DRAFT | ACTIVE | RETIRED
catalog_rules
commercial_terms_ref
```

### invariants

- `Plan` لا يساوي Entitlement.
- تغيير السعر أو المدة لاحقًا لا يعيد كتابة العقود السابقة.
- القيم التجارية غير المعتمدة تبقى Owner Decisions ولا تُخترع داخل الكود.

## 6) عقد Commercial Contract / Order

```text
contract_id
plan_id
buyer_type: INDIVIDUAL | ORGANIZATION
buyer_ref
status: DRAFT | PENDING | ACTIVE | SUSPENDED | EXPIRED | CANCELLED | REFUNDED
starts_at
ends_at
seat_limit
commercial_snapshot_ref
created_by
activated_by
```

### invariants

- العقد يحتفظ بـsnapshot للشروط التي تم الشراء/الاعتماد عليها.
- أي تعديل على Plan بعد التفعيل لا يغير العقد السابق.
- لا Enrollment مباشر من Contract دون Entitlement.
- Organization contract لا يمنح جميع المستخدمين الوصول تلقائيًا؛ يجب تخصيص مقعد/Entitlement لكل مستفيد.

## 7) عقد Entitlement

```text
entitlement_id
beneficiary_teacher_persona_id
source_contract_id
scope_type: ACADEMY | PROGRAM | PROGRAM_SET
scope_ref
status: PENDING | ACTIVE | SUSPENDED | EXPIRED | REVOKED
valid_from
valid_until
assigned_by
revoked_by
revoke_reason
```

### قواعد الوصول

- `ACTIVE` فقط يسمح بإنشاء Enrollment جديد في برنامج مقيد.
- `SUSPENDED` يحتفظ بالتاريخ ولا يمحو التقدم.
- `EXPIRED` لا يغير Completion السابق.
- `REVOKED` يحتاج سببًا وفاعلًا وتاريخًا.
- نقل المقعد لا يعيد تعيين سجل تعلم المعلم السابق.
- Student entitlement لا يمكن استخدامه مكان Teacher entitlement.

## 8) عقد Enrollment

```text
enrollment_id
teacher_persona_id
program_version_id
entitlement_id
status: ACTIVE | COMPLETED | SUSPENDED | WITHDRAWN
started_at
completed_at
completion_snapshot_ref
```

### invariants

- كل Enrollment مربوط بـProgram Version ثابت.
- لا يعتمد Enrollment على `self_enroll` بوصفه مصدر تفويض تجاري مستقلًا.
- Program Version المنشور لا يعاد تشكيله بأثر رجعي؛ الإصدار الجديد يحصل على Version جديد.
- Suspension لا تمحو progress.
- Completion تاريخي immutable من منظور المنتج؛ أي تصحيح إداري يسجل كأثر تدقيق مستقل.

## 9) عقد Program Version

```text
program_version_id
program_id
version_no
status: DRAFT | PUBLISHED | RETIRED
learning_requirements
assessment_requirements
certificate_policy_ref
published_at
```

### invariants

- النشر يجمد متطلبات الإكمال لذلك الإصدار.
- المتعلم الذي بدأ إصدارًا لا ينتقل تلقائيًا إلى إصدار جديد.
- التقييم، المحتوى الإلزامي، ونسبة النجاح يجب أن تكون معرفة داخل الإصدار أو policy snapshot مرتبطة به.

## 10) عقد Certificate

```text
certificate_id
enrollment_id
teacher_persona_id
program_version_id
issued_at
status: VALID | REVOKED
verification_code
revoked_at
revoked_by
revoke_reason
```

### شروط الإصدار

يلزم جميع ما يلي:

- Teacher persona صحيح ونشط وقت الاستحقاق وفق السياسة.
- Enrollment صحيح ومربوط بـProgram Version ثابت.
- Completion requirements مستوفاة.
- Assessment threshold مستوفى.
- لا administrative hold يمنع الإصدار.
- لا تُصدر شهادة اعتمادًا على Student role/subscription.

### عقد التحقق العام

يعرض فقط:

- اسم صاحب الشهادة.
- اسم البرنامج.
- مرجع/إصدار البرنامج.
- تاريخ الإصدار.
- حالة الشهادة: `VALID | REVOKED`.

ولا يعرض العقد أو الدفع أو بيانات الملف المهني الحساسة.

## 11) State Transition Contracts

### Contract

```text
DRAFT -> PENDING
PENDING -> ACTIVE | CANCELLED
ACTIVE -> SUSPENDED | EXPIRED | CANCELLED | REFUNDED
SUSPENDED -> ACTIVE | CANCELLED | EXPIRED
```

أي transition غير مذكور = `DENY` ما لم تضف سياسة معتمدة لاحقًا.

### Entitlement

```text
PENDING -> ACTIVE | REVOKED
ACTIVE -> SUSPENDED | EXPIRED | REVOKED
SUSPENDED -> ACTIVE | EXPIRED | REVOKED
EXPIRED -> terminal
REVOKED -> terminal
```

### Enrollment

```text
ACTIVE -> COMPLETED | SUSPENDED | WITHDRAWN
SUSPENDED -> ACTIVE | WITHDRAWN
COMPLETED -> terminal for learning history
WITHDRAWN -> terminal
```

### Certificate

```text
VALID -> REVOKED
REVOKED -> terminal
```

إعادة الإصدار — إن اعتمدت مستقبلاً — يجب أن تنشئ شهادة جديدة لا أن تعيد كتابة السجل القديم.

## 12) Canonical Error Contract

هذه الأكواد مقترحة كعقد UX/Domain مستقبلي، وليست Runtime implementation في هذه المرحلة:

```text
ACADEMY_PERSONA_REQUIRED
ACADEMY_PERSONA_SUSPENDED
ACADEMY_CAPABILITY_DENIED
ACADEMY_SCOPE_DENIED
ACADEMY_CONTRACT_INACTIVE
ACADEMY_ENTITLEMENT_REQUIRED
ACADEMY_ENTITLEMENT_INACTIVE
ACADEMY_ENTITLEMENT_SCOPE_MISMATCH
ACADEMY_PROGRAM_VERSION_NOT_ENROLLABLE
ACADEMY_ENROLLMENT_ALREADY_EXISTS
ACADEMY_ENROLLMENT_NOT_ACTIVE
ACADEMY_COMPLETION_REQUIREMENTS_NOT_MET
ACADEMY_ASSESSMENT_THRESHOLD_NOT_MET
ACADEMY_CERTIFICATE_HOLD
ACADEMY_CERTIFICATE_REVOKED
ACADEMY_CROSS_PERSONA_DENIED
```

### UX rule

الواجهة تعرض رسالة مفهومة للمستخدم، لكن لا تكشف تفاصيل authorization الداخلية أو IDs حساسة.

## 13) Non-Production Test Vectors

هذه حالات قبول يجب تحويلها لاحقًا إلى Fixtures/validators فقط بعد فتح بوابة التنفيذ غير الإنتاجي المناسبة.

### Persona

1. Student-only user يفتح academy route المحمي → `DENY`.
2. Teacher-only user لا يرى student subscription data → `PASS isolation`.
3. Dual-persona user يبدل الواجهة مع بقاء كل صلاحيات كل persona مستقلة → `PASS`.

### RBAC

4. Program manager داخل program scope → `ALLOW`.
5. Program manager على برنامج آخر → `DENY`.
6. Organization manager على مؤسسة أخرى → `DENY`.
7. Auditor يحاول write → `DENY`.
8. Teacher learner يحاول grant self → `DENY`.

### Commerce / Entitlement

9. ACTIVE contract بلا entitlement مخصص للمعلم → Enrollment `DENY`.
10. ACTIVE entitlement مطابق للبرنامج → Enrollment `ALLOW`.
11. SUSPENDED entitlement → Enrollment جديد `DENY`.
12. EXPIRED entitlement مع Enrollment مكتمل سابقًا → history يبقى، Enrollment جديد `DENY`.
13. نقل مقعد مؤسسي لمعلم آخر → سجل المعلم الأول لا يتغير.

### Learning / Certificate

14. Completion ناقص → certificate `DENY`.
15. Completion مكتمل لكن assessment أقل من threshold → `DENY`.
16. Completion + assessment مكتملان → certificate `ALLOW` إذا لا hold.
17. Certificate revoked → public verify يعرض `REVOKED` ولا يحذف السجل.
18. Student subscription موجود فقط → Teacher certificate/enrollment `DENY`.

### Security boundaries

19. Student/teacher/content-manager يحاول deep purge capability → `DENY`.
20. Academy admin بدون break-glass policy يحاول deep purge → `DENY`.

## 14) ما لا تنفذه هذه المرحلة

- لا إنشاء جداول.
- لا تعديل `academy.capability_grants`.
- لا تعديل `self_enroll`.
- لا Migration.
- لا RLS/RPC changes.
- لا Payment integration.
- لا QB runtime integration أو cutover.
- لا Production write.
- لا Deploy.
- لا تغيير لتطبيق الطالب.

## 15) Owner Decisions المؤجلة عمدًا

تبقى هذه القرارات خارج أي تنفيذ حتى اعتمادها:

- الأسعار.
- مدد الاشتراك.
- فترة السماح بعد الانتهاء.
- سياسة الاسترداد.
- سياسة نقل المقاعد المؤسسية.
- أثر Refund/Revocation بعد Completion على الشهادة.
- هل الجلسات الحية ضمن الخطة أم Add-on.
- هل انتهاء الاشتراك الطبيعي يؤثر على صلاحية شهادة سبق إصدارها.

لا تؤثر هذه القرارات على صحة عقود الفصل والـRBAC أعلاه، لكنها تؤثر على Commerce runtime النهائي.

## 16) بوابة الانتقال التالية

لا يبدأ أي Domain implementation من هذا المستند وحده.

أول تنفيذ غير إنتاجي لاحق يجب أن ينتظر تحقق بوابة مناسبة رسميًا حسب Stage 20P، وعندها يبدأ فقط بـ:

1. pure domain types/interfaces.
2. pure validators/state reducers.
3. mock fixtures تغطي test vectors أعلاه.
4. component/A11y tests لحالات السماح والرفض.
5. صفر Network/Supabase/Payment/QB runtime calls.

بعد ذلك فقط، وببوابة مستقلة، يمكن الانتقال إلى isolated staging design/implementation.

## 17) الخلاصة

```text
STAGE_20Q=DESIGN_ONLY
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
QUESTION_BANK_CUTOVER=HOLD
IMPORT_CONTRACT=HOLD_FORMAL
SCOPED_RBAC=CONTRACT_FROZEN_RUNTIME_PARTIAL
ENTITLEMENTS=CONTRACT_FROZEN_RUNTIME_NOT_READY
SECURITY_RELEASE_GATE=HOLD
STUDENT_TEACHER_BOUNDARY=MANDATORY
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
```
