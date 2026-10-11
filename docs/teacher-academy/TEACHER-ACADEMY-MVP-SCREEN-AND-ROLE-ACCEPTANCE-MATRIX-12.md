# أكاديمية معلم الثانوية — مصفوفة قبول الشاشات والأدوار للـMVP (Stage 12)

| الحقل | القيمة |
|---|---|
| المعرّف | `TEACHER_ACADEMY_MVP_SCREEN_AND_ROLE_ACCEPTANCE_MATRIX_12` |
| الحالة | `PASS_DESIGN_CONTINUATION_ONLY` |
| الأساس | `TEACHER-ACADEMY-MVP-UX-RELEASE-CONTRACT-11` + `TEACHER-ACADEMY-THREAT-MODEL-09` |
| النطاق | UX / Role Visibility / Failure States / Release Acceptance فقط |
| Schema / Migration / Production write / Deploy | **ممنوع** |
| QB runtime integration | **DISABLED** حتى إغلاق المراجعة/الـcutover المستقل |

## 1. قرار البوابة

لا تفتح هذه المرحلة بوابة البرمجة الكاملة. الوضع الحالي:

```text
IMPORT_CONTRACT=CONTRACT_CLOSED
QUESTION_BANK_IMPORT_FOUNDATION=PASS_STRONG
QUESTION_BANK_FINAL_INDEPENDENT_RUNTIME_CLOSURE=NOT_PROVEN
ACADEMY_CANONICAL_ARCHITECTURE=PASS_DESIGN_FROZEN
ACADEMY_ROLES_CAPABILITIES=PASS_DESIGN_FROZEN
ACADEMY_COMMERCE_BOUNDARY=PASS_DESIGN_FROZEN
ACADEMY_CERTIFICATE_BOUNDARY=PASS_DESIGN_FROZEN
THREAT_MODEL_STAGE_09=PASS_DESIGN
ACADEMY_PROGRAMMING_GATE=CLOSED_PENDING_QB_FINAL_INDEPENDENT_REVIEW_OR_FORMAL_QB_DISABLED_MVP_FREEZE
```

لذلك يسمح فقط بتجميد تجربة الاستخدام ومعايير القبول دون إنشاء جداول أو endpoints أو migrations.

## 2. Personas وحدود الصلاحية

| Persona | ما يملكه | ما لا يملكه |
|---|---|---|
| Teacher Learner | ملف أكاديمية، استحقاقاته، تسجيلاته، تقدمه، تقييماته، شهاداته | أي PII طلاب، تحرير منهج الطالب، صلاحيات QB |
| Trainer / Mentor | الدفعات الممنوحة له، متابعة متعلمي الأكاديمية ضمن النطاق، التقييم/التصحيح إذا مُنح capability | إدارة مؤسسة كاملة، إصدار شهادة خارج scope، أي `qb_*` |
| Academy Program Manager | إدارة محتوى برامج الأكاديمية وإصداراتها ضمن scope | تعديل محتوى الطالب المنشور، student roles |
| Organization Manager | المقاعد والعقود والعضويات الخاصة بمؤسسته فقط | بيانات مؤسسة أخرى، صلاحيات منصة عامة |
| Certificate Officer | مراجعة وإصدار/إبطال الشهادات ضمن program/cohort scope | إنشاء entitlement أو تعديل evidence التعليمي |
| Academy Support | دعم تشغيلي محدود وفق grants | Admin bypass دائم، قراءة PII الطالب |
| Emergency Operator | وصول مؤقت مسبب ومدقق عند حالة طارئة معتمدة | grant دائم أو تجاوز غير مسجل |

> `auth.users` هوية مشتركة فقط. لا تُشتق أي صلاحية Academy من `student app_role`.

## 3. مصفوفة الشاشات — Teacher Learner

| الشاشة | تظهر للمعلم | شرط الدخول | حالة الفشل المطلوبة | معيار القبول |
|---|---:|---|---|---|
| الصفحة الرئيسية / My Learning | نعم | تسجيل دخول + Academy profile | profile غير مكتمل → دعوة لإكماله دون منح صلاحيات إضافية | لا بيانات طالب، لا عناصر Admin |
| كتالوج البرامج | نعم | `program.read` أو public Academy catalog policy | لا برامج متاحة → Empty state واضحة | يعرض فقط الإصدارات القابلة للتسجيل/العرض |
| تفاصيل البرنامج | نعم | صلاحية قراءة الإصدار | الإصدار deprecated → تحذير + منع تسجيل جديد | السعر/الساعات/المتطلبات/الشهادة واضحة |
| Checkout / طلب شراء | عند شراء فردي | المنتج متاح | فشل الدفع/الطلب → لا entitlement ولا enrollment | العملية idempotent ومفهومة UXياً |
| استحقاق مؤسسي | عند وجود عضوية فعالة | membership + contract seat | عضوية منتهية/لا مقعد → منع التسجيل مع سبب واضح | لا كشف تفاصيل عقد حساسة خارج ما يلزم المتعلم |
| My Enrollments | نعم | entitlement/enrollment صالح أو تاريخي | entitlement مسحوب → حفظ السجل التاريخي ومنع تعلم جديد حسب السياسة | لا حذف للتقدم السابق |
| Course / Module / Lesson Reader | نعم | enrollment على `academy_program_version` ثابت | مصدر غير متاح → `UNAVAILABLE/DEPRECATED` لا حذف التقدم | النسخة المسجلة لا تتغير بصمت |
| Progress | نعم | نفس المستخدم | conflict/replay → رسالة آمنة وإعادة مزامنة | outbox لا يضاعف التقدم |
| Required Activities | نعم | enrollment + capability | نشاط online-only أثناء offline → منع آمن | لا قبول mutation حساس offline بلا revalidation |
| Certificates | نعم | شهادة صادرة تخص المستخدم | شهادة revoked → تظهر الحالة بوضوح | السجل التاريخي محفوظ |
| Account / Academy Profile | نعم | owner | محاولة تعديل حقل حوكمي غير مسموح → رفض | لا يكتب على student profile |

## 4. مصفوفة الشاشات — Trainer / Mentor

| الشاشة | شرط الظهور | Capabilities | حالات الرفض الإلزامية |
|---|---|---|---|
| My Cohorts | grant على `cohort_id` | `program.read` | cohort خارج النطاق لا يظهر |
| Cohort Learners | membership في نطاق Academy فقط | scoped learner read | لا وصول إلى PII تطبيق الطالب |
| Submission Queue | `submission.grade` | grade within cohort | submission خارج cohort → deny |
| Rubric Grading | `submission.grade` | create grade/audit event | grant منتهي → online revalidation ثم deny |
| Learner Progress Summary | grant cohort | aggregate Academy learning data | لا student SIS/profile joins |

لا تعرض للمدرب أي شاشة لإدارة أو نشر أسئلة بنك الطلاب. `ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED`.

## 5. مصفوفة الشاشات — Organization Workspace

| الشاشة | الشرط | المسموح | الممنوع |
|---|---|---|---|
| Organization Dashboard | عضوية فعالة + `organization_id` scope | ملخص المقاعد/البرامج الخاصة بالمؤسسة | cross-org aggregation غير مخول |
| Memberships | org grant | أعضاء المؤسسة ضمن scope | كشف حسابات خارج المؤسسة |
| Contracts | org grant مناسب | حالة العقد/الفترة/المنتج | تعديل شروط قانونية دون capability صريحة |
| Seat Allocation | `org.manage_seats` | allocate/revoke وفق العقد | oversubscription أو seat من عقد آخر |
| Organization Learning Report | org reporting capability | تقدم Academy لمستفيدي العقد | PII الطالب أو بيانات خارج العقد |

كل طلب يحدد `organization_id` يجب أن يتحقق منه server-side؛ إخفاء الشاشة في الواجهة ليس ضابط أمان بحد ذاته.

## 6. مصفوفة الشاشات — Academy Administration

تكون منفصلة عن Navigation المتعلم.

| مساحة العمل | Capability المطلوبة | Scope |
|---|---|---|
| Program Authoring | program content capability مستقبلية صريحة | `program_version_id` |
| Cohort Management | cohort management capability | `cohort_id` |
| Grading Oversight | `submission.grade`/review capability | `cohort_id` |
| Certificate Issuance | `certificate.issue` | `program_version_id` أو `cohort_id` |
| Organization Seats | `org.manage_seats` | `organization_id` |
| Emergency Access | `emergency.access` | سبب + مدة ≤60 دقيقة + audit |

لا يوجد `ta_admin` أو `platform_admin` كـbypass شامل. كل شاشة حساسة تعتمد على grant scoped قابل للتحقق على الخادم.

## 7. حالات Entitlement التي يجب أن تكون واضحة في UX

| الحالة | سلوك الواجهة |
|---|---|
| Active individual entitlement | السماح بالتسجيل/التعلم وفق السياسة |
| Active organization seat | السماح فقط مع membership الفعالة والعقد الصحيح |
| Pending payment/order | لا enrollment قبل تحقق الاستحقاق |
| Expired entitlement | منع الوصول الجديد مع إبقاء التاريخ/السجل |
| Revoked entitlement | منع الوصول حسب السياسة دون cascade delete للتقدم أو الشهادة |
| Contract expired | لا مقاعد جديدة؛ السجلات التاريخية محفوظة |
| Membership expired | إعادة تحقق ومنع مزايا المؤسسة غير الصالحة |
| Administrative grant | يظهر مصدر الاستحقاق في audit؛ لا يصبح صلاحية إدارة |

## 8. شهادة المعلم — UX ومعايير التحقق

يجب أن تحتوي شاشة الشهادة على:

- اسم البرنامج وإصدار `academy_program_version` المثبت.
- اسم المستفيد كما اعتمد عند الإصدار.
- تاريخ الإصدار والحالة: Active / Revoked / Superseded عند الحاجة.
- رقم/رمز تحقق غير كاشف لبيانات حساسة.
- رابط/QR تحقق عام محدود يعيد فقط بيانات التحقق اللازمة.

حالات الفشل:

- entitlement وحده لا يصدر شهادة.
- completion evidence ناقص → `certificate.issue` مرفوض.
- officer خارج scope → رفض.
- revoked certificate → لا تعرض كصالحة مع بقاء سجل الحدث.

## 9. الفصل الإجباري عن تطبيق الطلاب

معايير قبول غير قابلة للتفاوض:

1. لا شاشة Academy تعتمد على `student app_role` لتحديد صلاحية.
2. لا Teacher profile يُخزن داخل student `profiles` كمصدر صلاحيات.
3. لا Teacher/Trainer يرى قائمة طلاب التطبيق أو PII الخاصة بهم.
4. لا Academy commerce يستخدم student wallet/subscription.
5. لا Academy certificate يعاد استخدامه كسجل شهادة طالب.
6. لا دور Academy يمنح `qb_edit`, `qb_review`, `qb_publish`.
7. أي محتوى طالب مستقبلي تستخدمه Academy يكون Published/Versioned read-only reference، بلا cascade إلى progress/certificates.

## 10. Offline Acceptance للـMVP

مسموح:

- shell cache؛
- catalog metadata سبق عرضها؛
- text lesson cache مصرح به؛
- progress outbox محدود مع idempotency/conflict handling.

غير مسموح في MVP:

- high-stakes assessment final submission offline؛
- protected video download؛
- certificate issuance offline؛
- entitlement/seat mutation offline؛
- استخدام grant قديم لتنفيذ mutation دون online revalidation.

## 11. سيناريوهات قبول سلبية إلزامية قبل أي Release

يجب أن تفشل جميع الحالات التالية:

1. طالب يدخل URL لواجهة Academy الإدارية.
2. Teacher بلا grant يفتح Organization Workspace.
3. Organization Manager لمؤسسة A يطلب موارد مؤسسة B.
4. Trainer يصحح submission خارج cohort.
5. Certificate Officer يصدر شهادة خارج scope.
6. Academy Support يقرأ student PII.
7. انتهاء membership ثم محاولة استخدام seat entitlement مؤسسي.
8. replay لطلب تخصيص مقعد/شراء/إصدار شهادة.
9. حذف/تقاعد مصدر محتوى يؤدي إلى حذف Academy progress.
10. Offline client ينفذ mutation حساس بعد انتهاء grant.
11. أي شاشة أو endpoint Academy يعرض answer key من QB قبل reveal.
12. إكمال دورة يؤدي تلقائياً إلى grant لنشر/تحرير QB.

## 12. Release Acceptance Checklist — Design Freeze

قبل الانتقال إلى تنفيذ غير إنتاجي يجب أن تكون الأدلة التالية متاحة:

- [x] Product boundary مستقل عن تطبيق الطالب.
- [x] Navigation MVP مجمد.
- [x] Screen visibility حسب persona موثقة.
- [x] Capability scopes موثقة.
- [x] Organization failure states موثقة.
- [x] Entitlement failure states موثقة.
- [x] Certificate verification UX موثق.
- [x] Offline MVP boundary موثق.
- [x] Negative acceptance scenarios موثقة.
- [x] Threat Model Stage 09 يحدد controls لكل Critical threat.
- [ ] Final independent QB runtime/cutover closure موثق، **أو** قرار رسمي مجمد بأن MVP ينطلق مع `ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED` دون dependency تشغيلي على QB.
- [ ] أي انتقال إلى Schema/implementation يحصل في مرحلة منفصلة وبأمر صريح وفق بواباته؛ لا شيء في هذه الوثيقة يجيز Migration/Production.

## 13. القرار والمرحلة التالية

```text
SCREEN_AND_ROLE_ACCEPTANCE_STAGE_12=PASS_DESIGN
ACADEMY_PROGRAMMING_GATE=CLOSED
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED
PRODUCTION_WRITE=NO
MIGRATION=NO
DEPLOY=NO
```

إذا بقيت بوابة QB غير مغلقة، فالمرحلة الآمنة التالية هي `TEACHER_ACADEMY_RELEASE_AND_IMPLEMENTATION_PLAN_FREEZE_13`: تقسيم MVP إلى increments غير إنتاجية، تعريف Definition of Done، ترتيب الاعتماديات، خطة الاختبار، وخطة rollback/release بدون إنشاء Schema أو Migration. إذا أغلق QB نهائياً أو جُمّد رسميًا خارج MVP، يعاد تقييم فتح بوابة source-only implementation بصورة منفصلة.
