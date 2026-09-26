# Stage 20W — Support, Appeals, Certificate Revocation & Organization-seat Operations

الحالة: **تحليل وتصميم غير إنتاجي فقط**.

المرجع عند البدء: `main@b737923b59078f1d8508b48caa6c685eef222d05` بتاريخ 2026-09-26.

## Gate review

| Gate | Status | Evidence |
|---|---|---|
| Question Bank | HOLD | PR #58 ما يزال Open + Draft، والحزمة Design-only والـruntime الافتراضي LEGACY دون formal cutover |
| Import Contract V2 | HOLD | PR #96 ما يزال Open + Draft/HOLD مع CF10/CF11 وPostgreSQL regression وE2E/RTL قبل الاعتماد |
| Curriculum base | PARTIAL PASS | بنية البرامج والإصدارات والدروس والتقييم والشهادات موجودة |
| Scoped RBAC | PARTIAL | `academy.capability_grants` الحالية على `user_id + capability` دون scope مؤسسي/برنامجي كامل |
| Subscription / Entitlement | NOT READY | Runtime الحالي ما يزال يستخدم `academy.self_enroll` مباشرة، ولا توجد دورة `Plan → Contract → Entitlement → Enrollment` مكتملة |
| Security release gate | HOLD | `admin_curriculum_force_delete` ما تزال SECURITY DEFINER وممنوحة لـauthenticated رغم Full Admin check الداخلي، مع حذف عميق وتعليق مؤقت لبعض immutable triggers |

```text
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
STUDENT_APP_CHANGE=NO
```

## Purpose

تثبيت عقود الحالات الاستثنائية قبل أي Runtime جديد:

- Support.
- Assessment review and appeals.
- Certificate revocation and appeals.
- Organization seat operations.
- Persona isolation.
- Audit and separation of duties.

لا تشمل هذه المرحلة أي تعديل للتطبيق أو قاعدة البيانات أو النشر.

## Persona isolation

Shared Identity يمكن أن تحمل Student Persona وTeacher Persona، لكن كل مساحة تبقى مستقلة.

قواعد ثابتة:

1. Student roles لا تمنح Academy capabilities.
2. Student subscription لا تنشئ Academy entitlement.
3. Student progress/results لا تدخل Teacher Academy progress أو certificates.
4. Academy support لا يصبح مسارًا للوصول إلى Student records.
5. Organization Manager لا يرى Student Persona.
6. Dual Persona تعني تبديل workspace فقط، لا دمج الصلاحيات.

## Support case contract

أنواع الطلبات:

```text
ACCESS
PROFILE
ENROLLMENT
LEARNING_CONTENT
ASSESSMENT
CERTIFICATE
ORGANIZATION_SEAT
TECHNICAL
PRIVACY
OTHER
```

الحالات:

```text
OPEN
TRIAGED
WAITING_FOR_TEACHER
WAITING_FOR_INTERNAL_REVIEW
RESOLVED
CLOSED
REOPENED
```

الحد الأدنى المنطقي:

- case_id
- teacher_persona_id
- category
- academy_scope_ref
- optional program/enrollment/certificate/organization refs
- severity
- status
- assigned_scope
- decision_summary
- audit_events

الدعم لا يغير نتيجة تقييم أو شهادة مباشرة؛ القرارات الأكاديمية تمر Workflow منفصلًا بصلاحية مستقلة.

## Assessment review / appeal

```text
SUBMITTED
→ TRIAGED
→ ELIGIBLE | INELIGIBLE
→ UNDER_REVIEW
→ DECISION_UPHOLD | DECISION_ADJUST | DECISION_RETRY_ALLOWED
→ CLOSED
```

قواعد:

- Attempt الأصلي لا يعاد كتابته تاريخيًا.
- Adjustment يكون حدثًا مستقلاً ومسببًا.
- Retry ينشئ Attempt جديدًا.
- Reviewer وصاحب القرار النهائي يفصلان عند الإمكان.
- Student Question Bank permissions لا تستخدم لإدارة Teacher Academy appeals.

## Certificate lifecycle

```text
PENDING_ELIGIBILITY
ISSUED
UNDER_REVIEW
REVOKED
SUPERSEDED
```

انتهاء Entitlement لا يلغي شهادة صحيحة تلقائيًا.

سحب الشهادة ليس Delete، بل قرار موثق يحفظ:

- reason code
- reason summary
- evidence refs
- requested_by
- reviewed_by
- decided_by
- decided_at
- appeal deadline
- audit reference

أسباب لا تسحب الشهادة تلقائيًا:

- انتهاء الاشتراك.
- انتهاء عقد المؤسسة.
- تعليق الحساب لأسباب تجارية فقط.
- نقل المقعد.
- نشر Program Version أحدث.

## Certificate appeal

```text
REVOKED
→ APPEAL_SUBMITTED
→ APPEAL_ELIGIBILITY_CHECK
→ SECOND_LEVEL_REVIEW
→ REVOCATION_UPHELD | CERTIFICATE_REINSTATED
→ CLOSED
```

المراجعة الثانية يجب ألا تكون بواسطة نفس صاحب قرار السحب. إعادة الشهادة لا تمحو سجل السحب السابق. Public verification تعرض الحالة الحالية بأقل بيانات لازمة ولا تعرض تفاصيل المخالفة.

## Organization seats

```text
Organization Contract
→ Seat Pool
→ Seat Assignment
→ Teacher Entitlement
→ Enrollment
```

حالات المقعد:

```text
AVAILABLE
RESERVED
ASSIGNED
CONSUMED
RELEASE_PENDING
RELEASED
```

قواعد:

1. Seat ليست Role.
2. Seat assignment لا تمنح Content/Admin capabilities.
3. نقل Seat لا ينقل progress أو certificate.
4. تغيير Organization Manager لا يغير entitlements تلقائيًا.
5. Teacher Entitlement الناتج عن seat يبقى Academy-only.
6. بعد وجود learning activity لا يعاد المقعد تلقائيًا؛ يدخل review path.

## Recommended seat reuse policy

هذه توصية تصميمية فقط:

- قبل Enrollment: يمكن إعادة المقعد إلى AVAILABLE وفق policy.
- بعد Enrollment بلا learning activity: يمكن السماح بإلغاء مسبب ضمن نافذة تعتمد لاحقًا.
- بعد learning activity أو assessment attempt: `RELEASE_PENDING`.
- Completion أو certificate لا تنقل الإنجاز إلى مستخدم جديد حتى لو عاد seat count تجاريًا في دورة أخرى.

## Target scoped capabilities

```text
ACADEMY_SUPPORT_VIEW
ACADEMY_SUPPORT_MANAGE
ACADEMY_ASSESSMENT_REVIEW
ACADEMY_ASSESSMENT_DECIDE
ACADEMY_CERTIFICATE_VIEW
ACADEMY_CERTIFICATE_REVOKE
ACADEMY_CERTIFICATE_APPEAL_REVIEW
ACADEMY_ORG_SEATS_VIEW
ACADEMY_ORG_SEATS_ASSIGN
ACADEMY_ORG_SEATS_RELEASE
```

كل grant مستقبلي يجب أن يحدد grantee + capability + scope + validity + grant/revoke audit. Default = DENY عند غياب المطابقة.

## Separation of duties

| Operation | Initial actor | Final authority |
|---|---|---|
| Support triage | Support operator | لا قرار أكاديمي |
| Assessment review | Reviewer | Assessment decision authority |
| Certificate revocation request | Authorized reviewer/admin | Separate revocation authority عند الإمكان |
| Certificate appeal | Second-level reviewer | Appeal authority |
| Seat assignment | Scoped organization manager | لا Content authority |
| Seat release after activity | Organization request | Academy/contract authority |

## Privacy defaults

- Organization Manager يرى أقل بيانات لازمة لإدارة المقاعد.
- لا يرى إجابات التقييم الفردية افتراضيًا.
- يمكن عرض completion summary فقط إذا سمحت السياسة والعقد.
- Academy support لا يكشف Student Persona data.
- Public certificate verification لا يكشف أسباب السحب التفصيلية.

## Future non-production acceptance vectors

1. Student-only identity ترفض Academy admin/support operations.
2. Dual Persona تحافظ على فصل context.
3. Support operator لا يستطيع revoke certificate.
4. Reviewer لا يعدل attempt الأصلي.
5. Retry ينشئ attempt جديدًا.
6. Entitlement expiry لا يبطل certificate صحيحة.
7. Revocation يحافظ على audit history.
8. Appeal reviewer يختلف عن revocation decider وفق policy.
9. Organization manager لا يمنح نفسه Academy admin.
10. Seat transfer لا ينقل progress.
11. Consumed seat بعد نشاط يدخل review path.
12. Public verification لا يكشف بيانات خاصة.

## Owner decisions before runtime

- D1: نافذة الاستئناف.
- D2: جهة صلاحية سحب الشهادة.
- D3: مستوى المراجعة الثاني وفصل الواجبات.
- D4: إعادة استخدام المقعد بعد بدء Enrollment.
- D5: مستوى تقدم المعلم المرئي للمؤسسة.
- D6: مدة الاحتفاظ بسجلات الدعم والاستئناف.

## Transition rule

Full runtime لا يبدأ حتى إغلاق بوابات Question Bank/Import عند الاعتماد عليها، واعتماد Scoped RBAC وEntitlement lifecycle، وإغلاق security blocker.

إذا بقيت البوابات مغلقة، الجزء الآمن التالي هو فقط: Data retention/privacy policy، Admin/support UX، decision ledger، audit vocabulary، SLA/escalation، certificate verification contract، وحدود organization reporting.

## Safety lock

- no `apps/teacher-academy` changes
- no Student app changes
- no Schema/RLS/RPC/Migration
- no production write
- no deploy
- no payment integration
- no Question Bank runtime integration

```text
STAGE_20W=DESIGN_ONLY
SUPPORT_CONTRACT=DESIGNED
ASSESSMENT_APPEAL_CONTRACT=DESIGNED
CERTIFICATE_REVOCATION_CONTRACT=DESIGNED
ORGANIZATION_SEAT_OPERATIONS=DESIGNED
PERSONA_ISOLATION=REQUIRED
OWNER_POLICY_DECISIONS=D1_D6_PENDING
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
```
