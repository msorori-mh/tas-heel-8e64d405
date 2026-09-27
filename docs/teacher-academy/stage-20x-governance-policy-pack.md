# Stage 20X — Governance Policy Pack: Retention, Support SLA, Audit & Certificate Verification

الحالة: **تحليل وتصميم غير إنتاجي فقط**.

تم إنشاء هذه المرحلة من `main` بتاريخ 2026-09-27 بعد إعادة فحص بوابات بدء «أكاديمية معلم الثانوية».

## 1) Gate review

| Gate | Status | Evidence / reading |
|---|---|---|
| Question Bank | HOLD | QB-02 foundation موجودة، لكن PR #58 ما يزال Open + Draft، والحزمة Design-only والـruntime الافتراضي LEGACY دون formal cutover |
| Import Contract V2 | HOLD | PR #96 ما يزال Open + Draft/HOLD، مع CF10/CF11 وPostgreSQL regression وE2E/RTL قبل الاعتماد |
| Curriculum structure | PARTIAL PASS | بنية البرامج والإصدارات والدروس والتقييم والشهادات موجودة وقابلة للتصميم حولها |
| Scoped RBAC | PARTIAL | `academy.capability_grants` الحالية ما تزال grant عامًّا على المستخدم/القدرة دون scope مؤسسي/برنامجي كامل |
| Subscription / Entitlement | NOT READY | `academy.self_enroll` ما يزال مسار التسجيل التشغيلي المباشر، ولا توجد دورة `Plan → Contract → Entitlement → Enrollment` مكتملة |
| Security release gate | HOLD | أحدث مسار migrations ما يزال يمنح `EXECUTE` على `admin_curriculum_force_delete` إلى `authenticated` رغم فحص Full Admin الداخلي |

```text
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
STAGE_20X=DESIGN_ONLY
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
STUDENT_APP_CHANGE=NO
```

## 2) Scope

هذه المرحلة تجمّد العقود والسياسات التالية فقط:

- Data retention / deletion policy.
- Support SLA and escalation model.
- Audit vocabulary and decision ledger.
- Certificate public verification contract.
- Organization reporting boundaries.
- Admin/support UX states.
- Persona isolation rules.

لا تشمل أي Runtime أو Schema/RLS/RPC أو Migration أو نشر أو تكامل دفع أو تعديل لتطبيق الطلاب.

## 3) Persona isolation — non-negotiable

Shared Identity يمكن أن تحمل Student Persona وTeacher Persona، لكن لا توجد وراثة بين المساحتين.

1. Student roles لا تمنح Academy capabilities.
2. Student subscription لا تنشئ Academy entitlement.
3. Student progress/results لا تدخل Academy progress أو certificates.
4. Teacher support لا يصبح مسارًا لرؤية Student records.
5. Organization reporting لا يشمل Student Persona.
6. Dual Persona = تبديل workspace/context فقط.
7. كل audit event يحمل persona + scope صريحين.

## 4) Data classification

```text
PUBLIC
ACADEMY_ACCOUNT
ACADEMY_LEARNING
ACADEMY_ASSESSMENT
ACADEMY_CERTIFICATE
ACADEMY_SUPPORT
ACADEMY_ORGANIZATION
ACADEMY_AUDIT
SECURITY_SENSITIVE
```

القاعدة: البيانات تجمع وتعرض وتحتفظ بها بأقل قدر يلزم لتحقيق الغرض الأكاديمي أو التشغيلي.

## 5) Retention policy contract

لا تثبت هذه المرحلة مددًا قانونية نهائية؛ بل تثبت المبدأ والحد الأدنى للعلاقة بين الأنواع.

| Data family | Retention rule |
|---|---|
| Account/profile | حتى انتهاء الحاجة التشغيلية + نافذة حذف تعتمد لاحقًا |
| Learning progress | يحتفظ به بقدر يلزم لإثبات الإنجاز والشهادة |
| Assessment attempts | Immutable history؛ لا يعاد كتابة المحاولة الأصلية |
| Certificate records | يحتفظ بسجل الحالة طوال عمر التحقق العام وما بعد السحب |
| Appeals / academic decisions | يحتفظ بها أطول من نافذة الاعتراض نفسها لضمان المراجعة والتدقيق |
| Support tickets | مدة تشغيلية محددة ثم archive/delete وفق السياسة |
| Organization seat history | يحتفظ بتغييرات assignment/release لأغراض التدقيق التجاري |
| Audit/security events | أطول من السجلات التشغيلية الحساسة، مع وصول مقيد |

المبدأ: `Delete` لا يستخدم لمسح أثر قرار أكاديمي أو مالي أو أمني يجب أن يبقى قابلًا للتدقيق؛ يستخدم state transition + retention policy.

## 6) Support SLA model

التصنيف المقترح:

```text
S0_SECURITY
S1_ACCESS_BLOCKED
S2_ASSESSMENT_CERTIFICATE
S3_LEARNING_CONTENT
S4_GENERAL
```

- S0: لا يعالج كـSupport عادي؛ يصعّد لمسار أمني منفصل.
- S1: تعطل دخول/entitlement يمنع المستخدم من التعلم.
- S2: نتيجة تقييم/اعتراض/شهادة.
- S3: مشكلة محتوى أو تعلم لا تمنع الحساب كليًا.
- S4: استفسار عام.

لا تعتمد أرقام زمنية نهائية قبل اعتماد ساعات الخدمة وطاقم الدعم، لكن يجب أن يملك كل مستوى:
- first-response target
- owner
- escalation threshold
- max handoffs
- closure rule
- reopen rule

## 7) Escalation boundaries

```text
Support
→ Specialist
→ Academic Review / Contract Authority / Security
→ Final Decision Authority
```

الدعم لا يملك:
- تعديل نتيجة Attempt مباشرة.
- إصدار/سحب شهادة منفردًا.
- منح Academy admin capability.
- تجاوز Entitlement.
- رؤية Student Persona.

## 8) Audit vocabulary

كل حدث حساس مستقبلي يجب أن يحمل:

```text
event_id
occurred_at
actor_user_id
actor_persona
actor_scope
action
target_type
target_id
reason_code
reason_summary
request_id
decision_id?
previous_state?
new_state?
evidence_refs?
```

أفعال موحدة:

```text
GRANT
REVOKE
ASSIGN
RELEASE
ENROLL
COMPLETE
SUBMIT
REVIEW
DECIDE
ISSUE
REVOKE_CERTIFICATE
REINSTATE_CERTIFICATE
APPEAL
CLOSE
REOPEN
EXPORT
VERIFY
```

## 9) Decision ledger

أي قرار يغير حقًا أو نتيجة أو شهادة أو مقعدًا لا يعتمد على log نصي فقط، بل Decision record مستقل قابل للإسناد والمراجعة.

```text
decision_id
decision_type
subject_ref
requested_by
reviewed_by?
decided_by
decision
reason_code
reason_summary
evidence_refs
effective_at
appeal_deadline?
supersedes_decision_id?
```

## 10) Certificate public verification contract

Public verification يعرض أقل قدر ممكن:

- certificate reference / verification code
- holder display name وفق policy
- program title + version label
- issued date
- current status: VALID / REVOKED / SUPERSEDED
- verification timestamp

لا يعرض:
- assessment answers
- support history
- revocation evidence/details
- organization private data
- Student Persona data
- internal user IDs

التحقق العام read-only ولا ينشئ session أو entitlement أو capability.

## 11) Certificate state contract

```text
PENDING_ELIGIBILITY
ISSUED
UNDER_REVIEW
REVOKED
REINSTATED
SUPERSEDED
```

- انتهاء الاشتراك لا يلغي شهادة سليمة تلقائيًا.
- سحب الشهادة Decision وليس Delete.
- reinstatement لا يمحو سجل revocation السابق.
- public verification يعرض الحالة الحالية فقط، بينما audit يحتفظ بالتاريخ.

## 12) Organization reporting boundaries

Organization Manager يرى فقط ما يلزم لإدارة العقد والمقاعد:

مسموح افتراضيًا:
- purchased seats
- available / reserved / assigned / consumed counts
- teacher identity needed for seat assignment
- entitlement status
- program enrollment/completion summary عندما يسمح العقد

غير مسموح افتراضيًا:
- answers
- detailed attempt payloads
- appeal evidence
- private support conversations
- Student Persona
- unrelated Academy programs

أي توسع في التقارير يحتاج contract scope صريحًا.

## 13) Admin/support UX states

واجهات الإدارة المستقبلية يجب أن تفصل:

- Support Queue
- Appeals Queue
- Certificate Review
- Organization Seats
- Audit / Decisions

ولا تستخدم شاشة Admin واحدة بصلاحية شاملة.

كل شاشة تعرض:
- active scope
- permitted actions
- immutable history
- reason requirement
- destructive/high-impact confirmation
- no cross-persona shortcut

## 14) Future non-production acceptance vectors

1. Student-only account cannot access Academy support/admin actions.
2. Dual Persona does not merge subscriptions or permissions.
3. Support agent cannot alter an assessment result.
4. Assessment adjustment preserves original attempt.
5. Certificate revocation creates a decision record.
6. Reinstatement preserves revocation audit history.
7. Public verifier exposes no appeal/support details.
8. Organization Manager cannot see answers.
9. Seat transfer does not transfer progress/certificate.
10. Audit events always include persona and scope.
11. Export action is auditable.
12. Security-severity case escalates outside ordinary support.

## 15) Pending owner decisions before runtime

استمرارًا لـStage 20W، تبقى القرارات التالية قبل أي Runtime:

- D1: نافذة الاستئناف.
- D2: جهة صلاحية سحب الشهادة.
- D3: مستوى المراجعة الثاني وفصل الواجبات.
- D4: إعادة استخدام المقعد بعد بدء Enrollment.
- D5: مستوى تقدم المعلم المرئي للمؤسسة.
- D6: مدة الاحتفاظ بسجلات الدعم والاستئناف.
- D7: ساعات الخدمة وأهداف SLA الفعلية.
- D8: البيانات العلنية الدقيقة في Certificate Verification.
- D9: مدة الاحتفاظ بسجل Audit/Security.
- D10: حدود تقارير المؤسسات التفصيلية.

## 16) Transition rule

لا يبدأ Full Runtime حتى:
1. إغلاق بوابة Question Bank المناسبة رسميًا عند الاعتماد عليها.
2. اعتماد Import Contract V2.
3. اعتماد Scoped RBAC.
4. اعتماد Plan/Contract/Entitlement lifecycle.
5. إغلاق المانع الأمني الحرج.
6. تثبيت D1–D10 بما يلزم للـruntime المستهدف.

إذا بقيت البوابات مغلقة، الجزء الآمن التالي هو فقط تصميم:
- Admin information architecture.
- Role/capability matrix.
- subscription/entitlement edge cases.
- certificate template/legal wording.
- organization contract UX.
- non-production test vectors.

## 17) Safety lock

- no `apps/teacher-academy` changes
- no Student app changes
- no Schema/RLS/RPC/Migration
- no production write
- no deploy
- no payment integration
- no Question Bank runtime integration
