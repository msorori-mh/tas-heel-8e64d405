# STAGE 20J — Acceptance Journeys & Mock Contract Scenarios

## الحالة

مرحلة تحليل وتصميم غير إنتاجية فقط لـ«أكاديمية معلم الثانوية» مبنية على `main@5426ea759bde231eb8165c63782bdcd4d27f02dc`.

- Production write: **NO**
- Migration apply: **NO**
- Deploy: **NO**
- Payment integration: **NO**
- Question Bank runtime cutover: **NO**
- Supabase schema/RLS/RPC change: **NO**
- Student role or profile reuse for Academy authorization: **NO**

## 1. إعادة تقييم بوابات البدء

### بنك الأسئلة — HOLD

PR #58 ما يزال Draft ويفترض `LEGACY` كـruntime افتراضي. لا يعتبر تحسن مراجعات الأسئلة أو النماذج الوزارية بديلاً عن QB runtime cutover المعتمد.

### عقد الاستيراد — PASS_OPERATIONAL_STRONG / HOLD_FORMAL

المسار التشغيلي أصبح أقوى بعد إصلاح pagination لسجل الدروس واختبارات PG17 السابقة، لكن PR #96 ما يزال Draft/HOLD رسميًا. لذلك لا يبدأ اعتماد Backend جديد للأكاديمية على عقد V2 باعتباره نهائيًا.

### بنية المناهج — PASS_BASELINE / RELEASE-GOVERNANCE HOLD

بنية الصف/المسار/الفصل/المادة/الوحدة/الدرس ومكونات Golden Lesson مناسبة للتحليل والتصميم. لكن `admin_curriculum_force_delete` ما تزال قدرة Full-Admin شديدة التدمير؛ يمكنها حذف تقدم ومحاولات وأسئلة وبيانات نشر وتعطيل immutable triggers داخل المعاملة. تبقى مانع Release Governance حتى تقاعدها أو تقييدها رسميًا.

### الأدوار — TARGET_FROZEN / RUNTIME_PARTIAL

النموذج الحالي لـ`academy.capability_grants` ما يزال عالميًا على `(user_id, capability)`، بينما النموذج المستهدف هو:

`actor -> organization -> program -> cohort -> capability`

ولا يجوز أن يمنح Student `app_role` أو Student profile أي Academy capability.

### الاشتراكات والاستحقاقات — TARGET_FROZEN / RUNTIME_NOT_READY

`academy.self_enroll(program_version_id)` ما يزال موجودًا في Runtime؛ لذلك طبقة `order/contract -> entitlement -> enrollment` ليست المرجع التشغيلي بعد.

### الأمان — GATE CLOSED

لا يمكن إعلان `ZERO_CRITICAL_SECURITY_BLOCKERS` قبل إغلاق force-delete governance، Scoped RBAC، وEntitlement enforcement.

**النتيجة:** `ACADEMY_FULL_PROGRAMMING_GATE = CLOSED`.

## 2. هدف Stage 20J

تحويل قرارات Stage 20I إلى سيناريوهات قبول مفصلة يمكن تحويلها لاحقًا إلى Fixtures واختبارات محلية، دون Backend أو DB أو دفع أو QB runtime.

## 3. رحلة المعلم الفردي

### J-IND-01 — استعراض البرنامج دون استحقاق

**Given:** معلم موثق، Teacher profile مكتمل، لا Entitlement.

**Expected:**
- يرى كتالوج البرامج المسموح إظهاره.
- لا يظهر المحتوى المدفوع باعتباره متاحًا.
- زر البدء لا ينشئ Enrollment.
- لا يقرأ أي Student subscription/wallet state.

### J-IND-02 — Entitlement Pending

**Expected:**
- تظهر حالة انتظار واضحة.
- لا ينشأ Enrollment فعّال.
- لا تعتبر الشهادة أو التقدم أو التقييم متاحًا.

### J-IND-03 — Entitlement Active

**Expected:**
- الوصول يقتصر على `program_version_id` المشمول.
- ينشأ Enrollment فقط بعد تحقق Entitlement.
- لا يمنح الوصول إلى برنامج آخر أو إصدار آخر.

### J-IND-04 — Suspended / Expired / Revoked

**Expected:**
- `SUSPENDED`: منع نشاط جديد مع رسالة مراجعة عامة.
- `EXPIRED`: لا يبدأ محتوى جديدًا؛ سجل التعلم السابق يعامل حسب السياسة المجمدة لاحقًا.
- `REVOKED`: رفض صريح دون كشف سبب داخلي حساس.
- لا تتحول أي حالة إلى Student role أو Admin capability.

## 4. الرحلة المؤسسية

### J-ORG-01 — عقد صالح ومقاعد متاحة

**Given:** عقد `ACTIVE`، البرنامج مشمول، المقعد متاح، المعلم تابع للمؤسسة.

**Expected:**
- تخصيص المقعد ينتج Entitlement محدد النطاق.
- Enrollment لا ينشأ قبل الاستحقاق.
- كل سجل يحمل organization/program/cohort scope المطلوب.

### J-ORG-02 — نفاد المقاعد

**Expected:**
- رفض صريح.
- لا Entitlement جزئي.
- لا Enrollment ناقص.
- لا زيادة صامتة في عدد المقاعد.

### J-ORG-03 — Wrong Organization

**Expected:** deny-by-default، ولا تكشف بيانات العقد أو أسماء المعلمين أو عدد المقاعد لمستخدم خارج المؤسسة.

### J-ORG-04 — عقد Suspended / Expired / Terminated

**Expected:** لا تخصيص مقاعد جديدة، ولا توسيع Scope، ولا تحويل الحالة تلقائيًا إلى اشتراك فردي.

### J-ORG-05 — نقل المقعد

تبقى **السياسة التجارية نفسها غير معتمدة**. سيناريو القبول يثبت فقط أن أي نقل مستقبلي يجب أن يكون مدققًا، scoped، وألا ينسخ تقدم أو شهادة بين حسابين.

## 5. مصفوفة الأدوار ورفض الصلاحيات

### Teacher Learner

مسموح: تعلمه، تقييمه، شهاداته.

ممنوع: إدارة عقود، منح قدرات، تعديل برامج، إصدار شهادات يدويًا، رؤية مستخدمين خارج نفسه.

### Organization Admin

مسموح: عقود ومقاعد مؤسسته ضمن Scope فقط.

ممنوع: إدارة محتوى البرنامج، تعديل درجات، منح Academy platform capabilities، رؤية مؤسسة أخرى.

### Program Manager

مسموح: البرنامج/الإصدار المحدد له فقط.

ممنوع: عقود المؤسسة، برامج أخرى، Student app data.

### Cohort Coordinator

مسموح: الدفعات المسندة فقط.

ممنوع: توسيع Scope، تعديل عقود، منح صلاحيات.

### Instructor

مسموح: التدريب والتفاعل التعليمي المسموح ضمن البرنامج/الدفعة.

ممنوع: RBAC، العقود، Entitlements، الشهادات الإدارية.

### Certificate Officer

مسموح: إجراءات الشهادة وفق أهلية مثبتة وسياسة الإصدار.

ممنوع: تعديل Completion evidence أو الدرجات أو نتائج التقييم.

## 6. Dual Persona — فصل الطالب والمعلم

### J-PER-01 — Student Only

- `/auth` وStudentShell يعملان دون إنشاء Teacher profile أو Academy grant.
- لا تظهر Teacher workspace كجزء من مساحة الطالب الداخلية.

### J-PER-02 — Teacher Only

- `/academy` يعمل دون Student profile مكتمل.
- لا يعتمد على Student `app_role` أو Student subscription.

### J-PER-03 — Dual Persona

- يسمح بنفس `auth.users.id` للهوية فقط.
- Teacher profile وStudent profile منفصلان.
- تبديل persona صريح.
- cache/state/navigation لكل persona منفصلة منطقيًا.
- logout/session semantics مشتركة فقط على مستوى الهوية، وليس الصلاحيات أو البيانات.

### J-PER-04 — محاولة عبور الصلاحية

أي Teacher route يستدعي Student role لمنح Academy capability = **FAIL**.
أي Student route يستدعي Academy grant لمنح Student/Admin behavior = **FAIL**.

## 7. رحلة الشهادة

### J-CERT-01 — Not Eligible

لا شهادة ولا رمز تحقق؛ تعرض المتطلبات الناقصة فقط للمستخدم المصرح له.

### J-CERT-02 — Eligible

الأهلية ليست إصدارًا. يجب تثبيت `program_version_id` وCompletion evidence قبل الإصدار.

### J-CERT-03 — Issued

الشهادة ثابتة على إصدار البرنامج، ولها رمز تحقق مستقل، ولا تتغير بتحديث البرنامج لاحقًا.

### J-CERT-04 — Revoked

صفحة التحقق العامة تعرض `REVOKED` دون كشف سبب داخلي حساس.

### J-CERT-05 — Public Verification Privacy

المسموح كحد أدنى: حالة الشهادة، اسم البرنامج، اسم حامل الشهادة بالقدر المعتمد، تاريخ الإصدار، الرمز.

الممنوع: البريد، الهاتف، الدرجات التفصيلية، محاولات التقييم، Student PII، بيانات المؤسسة غير اللازمة للتحقق.

## 8. حالات الخطأ المشتركة

يجب تصميم Mock states على الأقل لـ:

- unauthenticated
- teacher profile incomplete
- wrong persona
- wrong organization
- wrong program
- wrong cohort
- entitlement pending/suspended/expired/revoked
- contract suspended/expired/terminated
- seat pool exhausted
- certificate not eligible/revoked/not found
- stale program version
- duplicated action / idempotent retry

كل حالة تستخدم deny-by-default ولا تنشئ أثرًا جزئيًا.

## 9. معايير UX/A11y للحالات السابقة

- RTL صحيح على 360/390/412/768/1280.
- لا تعتمد حالة الرفض على اللون وحده.
- Focus ينتقل إلى رسالة النتيجة أو الخطأ بعد الإجراء.
- كل زر قابل للتفعيل بلوحة المفاتيح.
- الرسائل تذكر ما يحتاجه المستخدم دون كشف تفاصيل أمنية داخلية.
- لا توجد روابط إدارة في Teacher learner persona.
- لا توجد Student navigation داخل Academy workspace.

## 10. أثر Capacity Gate الجديد

دمج PR #225 أضاف Load gate محميًا لـstaging فقط وحقق الاختبارات المحلية، لكن جولة staging توقفت عند Smoke بسبب بطء مسار الشبكة من runner القياس. هذا لا يفتح بوابة الأكاديمية ولا يغلقها؛ يلزم قياس لاحق من runner قريب من `ap-south-1` قبل أي اعتماد سعة إنتاجية.

## 11. ما لا يبدأ بعد

- لا جداول Academy جديدة.
- لا Entitlement أو Contract migrations.
- لا RLS/RPC جديدة.
- لا تعديل `self_enroll`.
- لا تقاعد force-delete عبر Migration.
- لا Payment provider.
- لا QB integration/cutover.
- لا Deploy أو Production write.

## 12. بوابة الانتقال التالية

يمكن بدء **Fixtures واختبارات محلية غير متصلة بالـDB** فقط إذا بقيت البوابات مغلقة، بشرط أن تختبر هذه السيناريوهات كعقود UI/domain mock دون إنشاء Schema أو استدعاء Supabase.

أما Backend non-prod الحقيقي فيبقى متوقفًا حتى تتحقق على الأقل:

1. QB strategy معتمدة للـMVP أو Cutover مغلق.
2. Import contract formal acceptance.
3. Scoped RBAC acceptance.
4. Entitlement/contract acceptance.
5. Force-delete retirement/restriction plan معتمد.

## 13. قرار Stage 20J

- `QUESTION_BANK_RUNTIME_CUTOVER = HOLD`
- `IMPORT_CONTRACT = PASS_OPERATIONAL_STRONG / HOLD_FORMAL`
- `CURRICULUM_STRUCTURE = PASS_BASELINE`
- `ACADEMY_SCOPED_RBAC = TARGET_FROZEN / RUNTIME_PARTIAL`
- `ACADEMY_ENTITLEMENTS = TARGET_FROZEN / RUNTIME_NOT_READY`
- `SECURITY_RELEASE_GATE = HOLD`
- `CAPACITY_GATE = TOOLING_READY / STAGING_MEASUREMENT_INCOMPLETE`
- `ACADEMY_FULL_PROGRAMMING_GATE = CLOSED`
- `NEXT_SAFE_PART = MOCK_FIXTURES_AND_LOCAL_CONTRACT_TEST_DESIGN_ONLY`
- `PRODUCTION_WRITE = NO`
- `MIGRATION_APPLY = NO`
- `DEPLOY = NO`
