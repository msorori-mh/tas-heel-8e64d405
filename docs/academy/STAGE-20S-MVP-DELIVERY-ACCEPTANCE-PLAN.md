# Stage 20S — MVP Delivery & Acceptance Plan

الحالة: **تحليل وتصميم غير إنتاجي فقط**.

المرجع عند البدء: `main@c6f8a2e0ef6b115fe05f715aec22cecb8c9c9268` بتاريخ 2026-09-21.

## 1. الغرض

تحويل تصميم «أكاديمية معلم الثانوية» إلى خطة تنفيذ قابلة للتتبع، مع ربط كل جزء ببوابته المطلوبة قبل السماح بأي برمجة لاحقة. هذه المرحلة لا تضيف Runtime أو Migration أو RLS/RPC أو Payment أو Question Bank integration.

## 2. حدود المنتج

### ضمن MVP

1. ملف مهني مستقل للمعلم.
2. كتالوج البرامج التدريبية.
3. مسار تأسيسي مشترك للمعلمين.
4. برامج تخصصية حسب المادة.
5. Program Versions ثابتة بعد النشر.
6. Individual entitlement.
7. Organization contract + seat entitlement.
8. Enrollment ناتج عن entitlement صالح.
9. Progress + completion rules.
10. Assessment حسب البرنامج.
11. «شهادة إتمام برنامج تدريبي» عند استيفاء الشروط.
12. سجل شهادات مستقل للمعلم.

### خارج MVP حاليًا

- Marketplace للمدربين.
- Live streaming مدمج.
- اعتماد مهني رسمي ما لم يوجد اعتماد موثق.
- مشاركة اشتراك الطالب مع المعلم.
- دفع إنتاجي قبل إغلاق بوابة الاشتراكات والاستحقاقات.
- تكامل إنتاجي مع Question Bank قبل formal cutover.

## 3. Personas وحدود الفصل

| Persona | مساحة العمل | مصدر الصلاحية | الاشتراك | الشهادات |
|---|---|---|---|---|
| Teacher Learner | Teacher Academy | Teacher persona + entitlement | Teacher-only | Teacher-only |
| Organization Manager | Organization workspace | Scoped academy grant | Organization contract | لا يملك شهادات المعلمين |
| Academy Content Manager | Academy admin/content | Scoped capability | لا يكتسب تعلمًا تلقائيًا | منفصل عن صلاحيات الإدارة |
| Academy Auditor/Support | Read/support scope | Scoped capability | لا يخلق entitlement | لا يغير الشهادات |
| Academy Admin | Academy control plane | Explicit admin capability | لا يرث اشتراك طالب | لا يرث شهادة طالب |
| Student | Student app | Student authorization | Student-only | Student-only |
| Dual Persona | مساحتان منفصلتان | كل Persona مستقلة | اشتراكان/استحقاقان مستقلان | سجلان مستقلان |

### قاعدة حاكمة

`Student app_role`, Student subscription, Student progress, Student certificate **ليست** مصادر تفويض للأكاديمية.

## 4. نموذج المجال المستهدف

```text
Teacher Persona
  → Plan / Organization Contract
  → Entitlement
  → Enrollment
  → Program Version
  → Learning Progress
  → Assessment Completion
  → Certificate Eligibility
  → Certificate
```

### Invariants

- لا Enrollment تجاري نهائي بدون entitlement صالح.
- انتهاء entitlement لا يحذف سجل التعلم أو الشهادة السابقة.
- Program Version المنشورة لا تتغير بأثر رجعي على متعلم بدأها.
- الشهادة تشير إلى Program Version محددة.
- Organization seat لا يتحول ضمنيًا إلى Student entitlement.
- نقل المقعد، grace period، refund، الأسعار والمدد تبقى سياسات تجارية غير مجمدة في هذه المرحلة.

## 5. محفظة البرامج للـMVP

### A. البرنامج التأسيسي المشترك

الوحدات المقترحة:

1. استخدام الأكاديمية والملف المهني.
2. التخطيط للحصة ومخرجات التعلم.
3. التقويم التشخيصي والتكويني والختامي.
4. معالجة التعثر والفروق الفردية.
5. الاستخدام المسؤول للأدوات الرقمية والذكاء الاصطناعي.
6. النزاهة الأكاديمية وحقوق المحتوى.

### B. البرامج التخصصية

لكل مادة ثانوية مدعومة Program مستقل، ويتضمن على الأقل:

1. خريطة المنهج ومخرجاته.
2. المفاهيم الصعبة والأخطاء الشائعة.
3. استراتيجيات تدريس عملية.
4. بناء الأسئلة والتقويم.
5. تحليل أخطاء الطلاب.
6. نماذج تحضير وشرح.
7. تقييم ختامي للبرنامج.

لا تُثبت مدة أو سعر أو خصم قبل قرار تجاري مستقل.

## 6. رحلة Teacher Learner

### T01 — دخول المعلم

- يدخل إلى Teacher workspace وليس Student home.
- عند Dual Persona يظهر اختيار واضح للمساحة دون خلط الصلاحيات.
- فشل Teacher entitlement لا يحوّله تلقائيًا إلى Student purchase flow.

### T02 — الكتالوج

يعرض:

- عنوان البرنامج.
- الجمهور المستهدف.
- المادة إن كان تخصصيًا.
- Program Version الحالية.
- حالة الوصول: `AVAILABLE / ENTITLED / ENROLLED / COMPLETED / LOCKED`.

### T03 — الحصول على الاستحقاق

مصادر الاستحقاق المقبولة مستقبلًا:

- Individual subscription/plan.
- Organization seat ضمن عقد فعال.
- Administrative grant استثنائي مدقق.

لا يعتمد على `academy.self_enroll` كآلية تجارية نهائية.

### T04 — التعلم

- Enrollment يثبت Program Version.
- progress مستقل عن تطبيق الطالب.
- انتهاء العقد لا يعدل نتيجة assessment سابقة.

### T05 — الشهادة

قبل الإصدار يجب تحقق:

1. Enrollment صحيح.
2. Program Version منشورة ومثبتة.
3. متطلبات الإكمال مستوفاة.
4. التقييم المطلوب ناجح عند وجوده.
5. لا توجد حالة suspension تمنع الإصدار وفق policy مستقبلية.
6. Certificate identifier فريد وقابل للتحقق.

الاسم الافتراضي: **شهادة إتمام برنامج تدريبي**.

## 7. رحلة المؤسسة

```text
Organization
  → Contract
  → Seat Pool
  → Seat Assignment
  → Teacher Entitlement
  → Enrollment
```

### حالات العقد المستهدفة

`DRAFT → ACTIVE → SUSPENDED → EXPIRED / TERMINATED`

### حالات المقعد

`AVAILABLE → ASSIGNED → RELEASED`

ولا يعني Release حذف تقدم المعلم أو الشهادات المكتسبة.

## 8. مصفوفة الصلاحيات المستهدفة

| Capability | Teacher | Org Manager | Content Manager | Auditor/Support | Academy Admin |
|---|---:|---:|---:|---:|---:|
| View own catalog | ✓ | حسب الحاجة | ✓ | ✓ read | ✓ |
| View own progress | ✓ | — | — | حسب policy | ✓ audited |
| Manage org seats | — | Scoped org | — | read only | ✓ |
| Edit draft program | — | — | Scoped program | — | ✓ |
| Publish program version | — | — | Scoped + approval | — | ✓ |
| Issue/revoke certificate | — | — | — | read only | Explicit audited |
| View all teachers | — | Scoped org only | — | Explicit scope | ✓ |

**ممنوع:** منح capability بسبب كون المستخدم Student أو بسبب Student subscription.

## 9. Release slices المستقبلية

### Slice A — Domain contract kit

لا يبدأ إلا بعد وجود بوابة مناسبة تسمح بتنفيذ غير إنتاجي.

المخرجات المستقبلية:

- Pure TypeScript domain types.
- State reducers/validators.
- Mock fixtures.
- Contract tests فقط.
- Zero network / Zero Supabase / Zero payment.

### Slice B — Isolated non-production UI

يتطلب:

- Scoped RBAC design PASS.
- Entitlement contract PASS.
- Teacher/Student separation tests PASS.

المخرجات المستقبلية:

- Teacher-only mocked catalog.
- Subscription/seat state screens بالـmock.
- Certificate eligibility view بالـmock.
- Accessibility/RTL/component tests.

### Slice C — Staging integration

لا يبدأ إلا بعد:

- Import V2 formal PASS.
- Question Bank formal gate المناسب حسب الوظيفة المطلوبة.
- Security release blocker CLOSED.
- Scoped RBAC + Entitlements implemented ومختبرين.

### Slice D — Production readiness

يتطلب موافقة مستقلة لاحقة، ولا يدخل ضمن Stage 20S.

## 10. Acceptance traceability

| ID | Requirement | Gate | Current status |
|---|---|---|---|
| A-01 | Teacher/Student persona separation | Persona | PASS baseline / contract tests pending |
| A-02 | Scoped academy authorization | RBAC | HOLD |
| A-03 | Contract→Entitlement→Enrollment | Commerce | HOLD |
| A-04 | Immutable Program Version for active learner | Curriculum | Design PASS |
| A-05 | Certificate tied to Program Version | Certificate | Design PASS |
| A-06 | QB-backed assessment when needed | Question Bank | HOLD formal cutover |
| A-07 | Imported training/content contract integration | Import | HOLD formal V2 |
| A-08 | No critical destructive security blocker | Security | HOLD |
| A-09 | Organization seat isolation | Commerce/RBAC | Design PASS; runtime pending |
| A-10 | No Student subscription inheritance | Persona/Commerce | Contract PASS; runtime tests pending |

## 11. Test vectors المطلوبة قبل أي Production path

1. Student-only user cannot obtain Academy capability.
2. Teacher-only user cannot read Student subscription internals.
3. Dual Persona switch keeps navigation and authorization separate.
4. Expired Teacher entitlement blocks new protected access without deleting completed history.
5. Organization Manager cannot inspect teachers outside organization scope.
6. Released seat does not delete progress/certificate history.
7. Draft Program Version cannot issue certificate.
8. Certificate references exact Program Version.
9. Certificate revocation is audited and does not rewrite learning history.
10. Student payment/subscription cannot satisfy Teacher entitlement check.
11. Admin capability does not imply learner enrollment.
12. Content Manager cannot widen own scope.
13. Support/Auditor cannot mutate contract, seat, enrollment or certificate.
14. A suspended/expired organization contract cannot create new entitlements.
15. Existing valid certificate remains verifiable after program version advances.

## 12. بوابات الانتقال

### السماح بـSlice A فقط

يتطلب قرارًا رسميًا بأن التنفيذ غير الإنتاجي المعزول مسموح، مع بقاء Zero network/DB.

### السماح بـSlice B

يتطلب إغلاق تصميم Scoped RBAC وEntitlement contracts وقبول Persona separation.

### السماح بـSlice C

يتطلب جميع ما يلي:

- Question Bank gate المناسب = PASS.
- Import V2 formal gate = PASS.
- Scoped RBAC = PASS.
- Subscriptions/Entitlements = PASS.
- Security release gate = PASS.

حتى ذلك الحين:

```text
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
PAYMENT_INTEGRATION=NO
QB_RUNTIME_INTEGRATION=NO
STUDENT_APP_CHANGE=NO
```

## 13. القرارات التجارية المؤجلة عمدًا

لا تُخمن داخل التنفيذ:

- الأسعار.
- مدة الاشتراك.
- الخصومات.
- فترة السماح.
- refund policy.
- قواعد نقل المقعد المؤسسي.
- حدود عدد المقاعد الافتراضية.
- أي ادعاء «اعتماد مهني» للشهادة.

هذه القيم تحتاج اعتمادًا تجاريًا/حوكميًا مستقلًا قبل التنفيذ الإنتاجي.
