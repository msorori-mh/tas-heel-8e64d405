# أكاديمية معلم الثانوية — موجات تنفيذ الـMVP ومصفوفة التتبع (Stage 13)

| الحقل | القيمة |
|---|---|
| المعرّف | `TEACHER_ACADEMY_MVP_IMPLEMENTATION_WAVES_AND_TRACEABILITY_13` |
| الحالة | `PASS_DESIGN_CONTINUATION_ONLY` |
| الأساس | Stage 09 Threat Model + Stage 11 UX Release Contract + Stage 12 Screen/Role Acceptance Matrix |
| النطاق | خطة تنفيذ، تتبع متطلبات، بوابات إصدار، فصل الصلاحيات فقط |
| Schema / Migration / Production write / Deploy | **ممنوع** |
| تكامل بنك أسئلة الطلاب | **DISABLED** حتى إثبات الإغلاق المستقل النهائي Runtime/Cutover |

## 1. قرار البوابة الحالي

المستودع الرئيسي يثبت تقدماً قوياً في مسار المحتوى: فصل أسئلة الكتاب الرسمية عن `Self Test`، واعتماد الإدخال المباشر للمحتويات السبعة، ثم توحيد استيراد المنهج/الوحدات/الدروس والمحتوى مع حراسة ترتيب الدروس. هذا يرفع استقرار **عقد الاستيراد وبنية المنهج**، لكنه لا يثبت وحده إغلاق المراجعة المستقلة النهائية لبنك الأسئلة.

```text
IMPORT_CONTRACT=CONTRACT_CLOSED_AND_IMPLEMENTATION_STRENGTHENED
CURRICULUM_CONTENT_STRUCTURE=PASS_STRONG
QUESTION_BANK_IMPORT_FOUNDATION=PASS_STRONG
QUESTION_BANK_FINAL_INDEPENDENT_RUNTIME_CLOSURE=NOT_PROVEN
ACADEMY_ROLES_CAPABILITIES=PASS_DESIGN_FROZEN
ACADEMY_COMMERCE_SUBSCRIPTIONS=PASS_DESIGN_FROZEN
ACADEMY_CERTIFICATES=PASS_DESIGN_FROZEN
ACADEMY_PROGRAMMING_GATE=CLOSED
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED
```

لذلك تستمر أعمال التصميم والتخطيط فقط. لا يبدأ Backend أو Schema للأكاديمية في هذه المرحلة.

## 2. المبدأ التنفيذي الملزم

الأكاديمية منتج مستقل من ناحية التجربة والصلاحيات، حتى عند مشاركة هوية الدخول:

- `auth.users` يمكن أن يكون معرف الهوية المشترك فقط.
- لا تُشتق أي صلاحية أكاديمية من `student app_role`.
- لا تعرض شاشات الأكاديمية PII أو تقدم أو خدمات الطالب.
- لا يستطيع Trainer/Manager/Support الوصول إلى أدوار أو بيانات الطالب بسبب امتلاكه دوراً في الأكاديمية.
- أي تكامل لاحق مع محتوى الطالب أو بنك الأسئلة يكون Read-only على إصدار منشور ومثبت الهوية.
- Commerce/Entitlements/Contracts/Certificates للأكاديمية مستقلة عن Wallet/Subscriptions/Certificates الخاصة بالطلاب.

## 3. موجات التنفيذ المعتمدة بعد فتح بوابة البرمجة

> هذه موجات **خطة** فقط الآن، وليست تفويضاً بإنشاء Schema أو Migration.

### Wave 0 — Identity & Isolation Foundation

الهدف: تثبيت الفصل الأمني قبل أي ميزة أعمال.

المخرجات المخطط لها:

- Academy profile مستقل.
- فصل واجهات `/academy/*` عن تطبيق الطالب.
- Capability grants scoped بحسب program/cohort/organization.
- منع أي fallback إلى student roles.
- Audit لكل grant حساس.
- اختبارات deny-first للعبور بين Academy وStudent domains.

بوابة الخروج:

```text
ACADEMY_IDENTITY_ISOLATION=PASS
STUDENT_DATA_CROSS_ACCESS=ZERO
ADMIN_BYPASS=ZERO
```

### Wave 1 — Programs, Versions & Catalog

الهدف: تشغيل الكتالوج التعليمي للأكاديمية دون تجارة أو تقييمات حساسة.

المخرجات المخطط لها:

- Programs وإصدارات ثابتة الهوية.
- Courses / Modules / Lessons داخل الإصدار.
- حالات Draft/Review/Published/Deprecated للأكاديمية فقط.
- Catalog عام/مقيد حسب policy.
- تثبيت الإصدار عند التسجيل؛ لا يتغير محتوى متعلم قائم بصمت.

بوابة الخروج:

```text
PROGRAM_VERSION_IMMUTABILITY=PASS
CATALOG_ROLE_VISIBILITY=PASS
DEPRECATED_VERSION_BEHAVIOR=PASS
```

### Wave 2 — Organizations, Contracts, Products & Entitlements

الهدف: دعم البيع الفردي والمؤسسي مع فصل كامل عن تجارة الطالب.

المخرجات المخطط لها:

- Organizations وعضويات زمنية.
- Individual products/orders.
- Institutional contracts/seats.
- Entitlements ناتجة عن شراء أو مقعد مؤسسي.
- Idempotent order/entitlement creation.
- لا Enrollment عند فشل الدفع أو انتهاء العقد/العضوية.

بوابة الخروج:

```text
ACADEMY_COMMERCE_ISOLATION=PASS
CONTRACT_SCOPE_ENFORCEMENT=PASS
ENTITLEMENT_IDEMPOTENCY=PASS
STUDENT_WALLET_DEPENDENCY=ZERO
```

### Wave 3 — Enrollment, Cohorts, Learning Progress & Offline MVP

الهدف: تشغيل رحلة المعلم المتعلم والمدرب.

المخرجات المخطط لها:

- Enrollment على `program_version` ثابت.
- Cohorts وتعيين Trainer حسب scope.
- Progress مع idempotent sync/outbox.
- Offline MVP: shell + catalog + text + progress outbox فقط.
- الأنشطة الحساسة online-only حتى إعادة التحقق من grants/entitlement.

بوابة الخروج:

```text
ENROLLMENT_ENTITLEMENT_BINDING=PASS
CROSS_COHORT_ACCESS=ZERO
OFFLINE_SENSITIVE_MUTATION=ZERO
PROGRESS_REPLAY_DUPLICATION=ZERO
```

### Wave 4 — Assessments, Evidence & Certification

الهدف: استكمال التعلم والشهادة دون الاعتماد التشغيلي على QB الطلاب.

المخرجات المخطط لها:

- Academy-native assessments أولاً.
- Submission/Rubric/Grade evidence scoped.
- Completion evidence مثبت على Program Version.
- Certificate issue/revoke/verify مستقل.
- الشهادة لا تصدر دون evidence مكتمل وentitlement صالح وفق السياسة.

بوابة الخروج:

```text
ACADEMY_ASSESSMENT_SCOPE=PASS
CERTIFICATE_EVIDENCE_CHAIN=PASS
CERTIFICATE_REVOCATION=PASS
STUDENT_CERTIFICATE_DEPENDENCY=ZERO
```

### Wave 5 — Optional Published QB Integration

هذه الموجة **مقفلة حالياً**.

لا تُفتح إلا إذا تحقق:

```text
QUESTION_BANK_FINAL_INDEPENDENT_RUNTIME_CLOSURE=PASS
QUESTION_BANK_CUTOVER=PASS
CRITICAL_SECURITY_BLOCKERS=0
```

وعند فتحها يكون التكامل:

- Read-only فقط على Published Revision.
- Revision pinning عند إنشاء تقييم أكاديمي يعتمد على QB.
- لا `qb_edit` ولا `qb_review` ولا `qb_publish` لأي دور Academy.
- لا وصول مباشر للجداول الحساسة من الواجهة.
- Server/RPC contract مقيد ومراجع أمنياً.

## 4. مصفوفة تتبع الشاشات إلى موجات التنفيذ

| الشاشة/القدرة | الدور الأساسي | Wave | الاعتماد | معيار الرفض الأساسي |
|---|---|---:|---|---|
| My Learning | Teacher Learner | 3 | Profile + Enrollment | لا entitlement/enrollment → لا محتوى |
| Program Catalog | Teacher Learner | 1 | Catalog policy | إصدار غير منشور → مخفي |
| Program Details | Teacher Learner | 1 | Version visibility | Deprecated → منع تسجيل جديد |
| Individual Checkout | Teacher Learner | 2 | Product availability | فشل الطلب → لا entitlement |
| Institutional Seat | Teacher Learner / Org Manager | 2 | Membership + Contract | عضوية/عقد/مقعد غير صالح → deny |
| Course Reader | Teacher Learner | 3 | Enrollment + pinned version | مصدر غير متاح → unavailable لا حذف تقدم |
| Progress | Teacher Learner | 3 | Owner + enrollment | replay/conflict → idempotent reconcile |
| My Cohorts | Trainer | 3 | Scoped grant | cohort خارج scope → مخفي/deny |
| Submission Queue | Trainer | 4 | `submission.grade` scoped | خارج cohort → deny |
| Organization Dashboard | Org Manager | 2 | org-scoped grant | مؤسسة أخرى → deny |
| Certificate Operations | Certificate Officer | 4 | scoped grant + evidence | لا evidence → لا إصدار |
| QB-backed Academy Assessment | لاحق | 5 | QB final runtime gate | gate غير مغلق → feature disabled |

## 5. تتبع الأدوار إلى القدرات

| الدور | قدرات MVP المقصودة | حدود إلزامية |
|---|---|---|
| Teacher Learner | catalog.read, enrollment.read, learning.consume, own.progress, own.certificate | لا student PII ولا `qb_*` |
| Trainer / Mentor | cohort.read, cohort.learner.read محدود، submission.grade حسب scope | لا إدارة مؤسسة عامة، لا QB publish |
| Academy Program Manager | program/version/content management داخل Academy | لا تعديل منهج الطالب المنشور |
| Organization Manager | contracts/seats/memberships لمؤسسته | لا مؤسسة أخرى |
| Certificate Officer | issue/revoke/verify ضمن program/cohort scope | لا إنشاء entitlement أو تغيير evidence |
| Academy Support | support capabilities محدودة ومدققة | لا admin bypass دائم |
| Emergency Operator | وصول مؤقت مسبب ومدقق | لا grant دائم |

## 6. الاشتراكات والباقات — Baseline للـMVP

لأغراض التصميم فقط، تعتمد الأكاديمية ثلاثة أنماط استحقاق:

1. **شراء دورة/برنامج فردي**: entitlement مباشر للمستخدم بعد إتمام الطلب.
2. **اشتراك فردي محدود المدة**: entitlement portfolio وفق policy المنتج؛ لا يغير ownership للتقدم التاريخي.
3. **عقد مؤسسي بالمقاعد**: entitlement عبر membership فعالة + seat من عقد فعال.

قواعد مشتركة:

- انتهاء entitlement يمنع تعلم جديد حسب السياسة لكنه لا يمحو السجل التاريخي.
- سحب مقعد مؤسسي لا يحذف التقدم أو الشهادة الصادرة سابقاً؛ تتغير حالة الوصول فقط.
- لا تستخدم أي باقة من باقات/محفظة الطالب.

## 7. الشهادات — Acceptance Contract

الشهادة يجب أن تحمل على الأقل في التصميم:

- المتعلم الأكاديمي.
- Program Version المحدد.
- Completion/Evidence reference.
- تاريخ الإصدار.
- حالة `ACTIVE/REVOKED`.
- رمز تحقق عام آمن لا يكشف بيانات غير لازمة.
- Audit trail لعملية الإصدار أو الإبطال.

ولا يجوز أن تتولد الشهادة من مجرد entitlement أو payment.

## 8. بوابات ما قبل بدء Wave 0 فعلياً

لا يبدأ التنفيذ البرمجي حتى تتحقق جميعها:

```text
QUESTION_BANK_STABILITY=PASS_FINAL_INDEPENDENT
IMPORT_CONTRACT=PASS
CURRICULUM_STRUCTURE=PASS
ACADEMY_ROLE_MODEL=PASS_FROZEN
ACADEMY_COMMERCE_MODEL=PASS_FROZEN
ACADEMY_CERTIFICATE_MODEL=PASS_FROZEN
ZERO_CRITICAL_SECURITY_BLOCKERS=PASS
```

إذا بقي QB النهائي غير مثبت، يوجد مسار بديل لا يفتح تلقائياً: **Formal QB-disabled MVP Freeze**. يحتاج قراراً موثقاً صريحاً قبل استخدامه كبوابة برمجة، ويظل Wave 5 مقفلاً بالكامل.

## 9. Definition of Done للتصميم قبل الكود

Stage 13 يعتبر مكتملًا عندما:

- كل شاشة Stage 12 مرتبطة بموجة تنفيذ واضحة.
- كل موجة لها dependency وdeny criteria وexit gate.
- Commerce/Contracts/Certificates لا تعتمد على جداول الطالب.
- لا توجد قدرة Academy مشتقة من student role.
- QB integration معطلة بشكل صريح في جميع الموجات 0–4.
- لا توجد أي Migration أو Production write أو Deploy ضمن هذه المرحلة.

```text
STAGE_13=PASS_DESIGN_CONTINUATION_ONLY
ACADEMY_PROGRAMMING_GATE=CLOSED
NEXT_SAFE_STAGE=TEACHER_ACADEMY_MVP_DATA_RETENTION_AUDIT_AND_SUPPORT_OPERATIONS_CONTRACT_14
```
