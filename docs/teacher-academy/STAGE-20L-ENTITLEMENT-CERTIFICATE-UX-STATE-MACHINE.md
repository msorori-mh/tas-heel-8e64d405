# STAGE 20L — Entitlement, Certificate & Persona UX State Machine

## الحالة

مرحلة تحليل وتصميم غير إنتاجية فقط لـ«أكاديمية معلم الثانوية»، مبنية على `main@2cfe143b81a841033fedd0b5e1c4f05d1ec54d74`.

- Production write: **NO**
- Migration apply: **NO**
- Deploy: **NO**
- Payment integration: **NO**
- Question Bank runtime cutover: **NO**
- Supabase schema/RLS/RPC change: **NO**
- Student role/profile reuse for Academy authorization: **NO**

## 1. قرار البوابات عند بدء Stage 20L

### بنك الأسئلة

PR #58 ما يزال Draft، والـruntime الافتراضي فيه `LEGACY`. التحسينات التشغيلية اللاحقة في التصحيح والتدقيق لا تعادل Cutover رسميًا.

**الحالة:** `QUESTION_BANK = PASS_OPERATIONAL_IMPROVED / HOLD_FORMAL_CUTOVER`.

### عقد الاستيراد

PR #96 ما يزال Draft/HOLD رسميًا، رغم أن المسار التشغيلي الحالي أقوى من العقد الأصلي.

**الحالة:** `IMPORT_CONTRACT = PASS_OPERATIONAL_STRONG / HOLD_FORMAL`.

### المناهج والأمان

`admin_curriculum_force_delete` ما تزال موجودة في `main` وتُمنح EXECUTE لـ`authenticated` مع فحص Full Admin داخل الدالة. وبسبب قدرة الدالة على حذف سجلات تعلم وأسئلة ونشر وتعطيل immutable triggers مؤقتًا داخل المعاملة، تبقى Release-governance blocker حتى اعتماد سياسة تقييد/تقاعد واضحة.

**الحالة:** `SECURITY_RELEASE_GATE = HOLD`.

### الأدوار

النموذج الحالي يعتمد منح قدرة على مستوى `(user_id, capability)`؛ النموذج المستهدف للأكاديمية يبقى Scoped RBAC:

`actor -> organization -> program -> cohort -> capability`

**الحالة:** `SCOPED_RBAC = TARGET_FROZEN / RUNTIME_PARTIAL`.

### الاشتراكات والاستحقاقات

`academy.self_enroll(program_version_id)` ما يزال جزءًا من Runtime، وبالتالي لم يُفرض بعد تسلسل:

`plan/order/contract -> entitlement -> enrollment -> learning -> completion -> certificate`

**الحالة:** `ENTITLEMENTS = TARGET_FROZEN / RUNTIME_NOT_READY`.

### النتيجة

`ACADEMY_FULL_PROGRAMMING_GATE = CLOSED`.

Stage 20L لا يضيف Backend أو schema أو integrations؛ هدفه تحويل Fixtures المجمدة في Stage 20K إلى آلة حالات UX محددة تمنع الالتباس عند بدء التنفيذ لاحقًا.

## 2. مبدأ الفصل بين الطالب والمعلم

الهوية التقنية المشتركة مسموحة، لكن الهوية التشغيلية ليست مشتركة.

ثوابت لا تتغير:

1. `/auth` = Student persona.
2. `/academy` = Teacher persona.
3. Student `app_role` لا يمنح Academy capability.
4. Teacher profile لا يفتح Student workspace أو Student admin behavior.
5. Student subscription لا يمنح Academy entitlement.
6. Academy entitlement لا يغير Student subscription.
7. كل Persona لها navigation/cache/authorization state مستقلة.
8. عند Dual Persona يتم التبديل الصريح؛ لا انتقال ضمني حسب الدور.

## 3. Persona State Machine

### الحالات

- `P0_SIGNED_OUT`
- `P1_IDENTITY_READY`
- `P2_STUDENT_ACTIVE`
- `P3_TEACHER_ACTIVE`
- `P4_DUAL_PERSONA_SELECTOR`
- `P5_ACCESS_DENIED`

### الانتقالات المقبولة

`P0_SIGNED_OUT -> P1_IDENTITY_READY`

بعد نجاح المصادقة التقنية فقط.

`P1_IDENTITY_READY -> P2_STUDENT_ACTIVE`

فقط إذا اختار المستخدم الطالب وكان Student profile صالحًا.

`P1_IDENTITY_READY -> P3_TEACHER_ACTIVE`

فقط إذا اختار المستخدم المعلم وكان Teacher profile/eligibility صالحًا.

`P1_IDENTITY_READY -> P4_DUAL_PERSONA_SELECTOR`

عند وجود ملفي Student وTeacher.

`P4_DUAL_PERSONA_SELECTOR -> P2_STUDENT_ACTIVE | P3_TEACHER_ACTIVE`

اختيار صريح مع إعادة تهيئة state الخاصة بالـpersona الجديدة.

### انتقالات ممنوعة

- `P2_STUDENT_ACTIVE -> Academy capability` دون switch صريح.
- `P3_TEACHER_ACTIVE -> Student admin` دون Student authorization مستقل.
- استنتاج Persona من `app_role` وحده.
- دمج cache بين `/auth` و`/academy`.

## 4. Subscription / Contract State Machine

### الحالات

- `S0_DISCOVERABLE`
- `S1_ORDER_PENDING`
- `S2_CONTRACT_PENDING`
- `S3_ENTITLEMENT_PENDING`
- `S4_ENTITLEMENT_ACTIVE`
- `S5_ENTITLEMENT_SUSPENDED`
- `S6_ENTITLEMENT_EXPIRED`
- `S7_ENTITLEMENT_REVOKED`
- `S8_CANCELLED`

### قواعد UX

#### S0_DISCOVERABLE

يعرض البرنامج، الإصدار، الجمهور المستهدف، المتطلبات، والمدة التدريبية. لا يظهر زر «ابدأ التعلم» ما لم توجد أهلية انتقال إلى Entitlement.

#### S1_ORDER_PENDING

يظهر «طلبك قيد المعالجة». لا ينشأ Enrollment ولا Progress.

#### S2_CONTRACT_PENDING

للمؤسسات فقط. لا يعرض عدد المقاعد أو بيانات العقد إلا لدور scoped على المؤسسة نفسها.

#### S3_ENTITLEMENT_PENDING

تظهر حالة انتظار واضحة، ولا يُسمح ببدء درس أو تقييم أو شهادة.

#### S4_ENTITLEMENT_ACTIVE

يسمح فقط بالبرنامج/الإصدار/النطاق المثبت في Entitlement.

#### S5_ENTITLEMENT_SUSPENDED

يمنع النشاط الجديد. عرض السجل السابق يخضع للسياسة التجارية التي تعتمد لاحقًا؛ لا يُفترض السماح أو المنع تلقائيًا في هذه المرحلة.

#### S6_ENTITLEMENT_EXPIRED

لا Enrollment جديد ولا إصدار شهادة جديد دون سياسة صريحة. السجل السابق يبقى غير قابل للتعديل.

#### S7_ENTITLEMENT_REVOKED

رفض واضح دون كشف سبب أمني أو تجاري داخلي للمستخدم العام.

#### S8_CANCELLED

لا تتحول الحالة تلقائيًا إلى فردي أو مؤسسي بديل.

## 5. Organization Seat State Machine

### الحالات

- `O0_CONTRACT_ACTIVE_SEATS_AVAILABLE`
- `O1_CONTRACT_ACTIVE_SEATS_EXHAUSTED`
- `O2_CONTRACT_SUSPENDED`
- `O3_CONTRACT_EXPIRED`
- `O4_CONTRACT_TERMINATED`
- `O5_WRONG_ORGANIZATION_SCOPE`

### القواعد

- التخصيص لا ينشئ Enrollment مباشرة؛ ينشئ Entitlement فقط في النموذج المستهدف.
- المقعد مرتبط بنطاق المؤسسة + البرنامج + الإصدار.
- إعادة تخصيص المقعد ليست افتراضية؛ تحتاج سياسة تجارية معتمدة.
- لا يظهر لمؤسسة A عدد المقاعد أو أسماء معلمي مؤسسة B.
- نفاد المقاعد يرفض الطلب بدل الزيادة الصامتة.

## 6. Enrollment State Machine

### الحالات

- `E0_NONE`
- `E1_ELIGIBLE`
- `E2_ENROLLED`
- `E3_IN_PROGRESS`
- `E4_COMPLETION_PENDING`
- `E5_COMPLETED`
- `E6_LOCKED`

### الشرط الأساسي

`E0_NONE -> E1_ELIGIBLE` يتطلب Entitlement صالحًا.

لا يوجد انتقال صحيح إلى `E2_ENROLLED` إذا كانت حالة Entitlement ليست Active.

### Invariants

- Enrollment مثبت على `program_version_id`.
- تحديث البرنامج لا يغيّر Enrollment قائمًا.
- انقضاء Entitlement لا يعيد كتابة completion history.
- لا يستخدم Student progress لإكمال Teacher program.

## 7. Certificate State Machine

### الحالات

- `C0_NOT_ELIGIBLE`
- `C1_ELIGIBLE_NOT_ISSUED`
- `C2_ISSUED`
- `C3_REVOKED`
- `C4_NOT_FOUND`

### شروط C1

لا تتحقق الأهلية إلا بوجود:

- Enrollment مثبت على Program Version.
- Completion evidence كامل.
- Assessment pass وفق policy البرنامج.
- عدم وجود blocker يمنع الإصدار.

### إصدار C2

الشهادة يجب أن تثبت:

- `program_version_id`
- `issued_at`
- `verification_code`
- الحد الأدنى من بيانات الحامل المعتمدة

ولا تتغير بتعديل البرنامج لاحقًا.

### C3_REVOKED

التحقق العام يعرض `REVOKED` فقط مع البيانات الدنيا؛ سبب السحب الداخلي لا يُكشف علنًا.

### C4_NOT_FOUND

نتيجة محايدة لا تكشف هل المستخدم أو البريد أو الحساب موجود أصلًا.

## 8. Public Certificate Verification Contract

مسموح في التحقق العام فقط:

- حالة الشهادة.
- اسم البرنامج.
- تاريخ الإصدار.
- رمز التحقق.
- اسم حامل الشهادة بالقدر الذي تعتمد سياسة الخصوصية إظهاره.

ممنوع:

- البريد.
- الهاتف.
- Student profile.
- Teacher private profile details غير اللازمة.
- نتائج المحاولات والأسئلة.
- أسباب السحب الداخلية.
- بيانات العقد أو المؤسسة غير اللازمة.

## 9. Scoped RBAC UX Contract

### Teacher Learner

يرى تعلمه وتقدمه وشهاداته فقط.

### Organization Admin

يرى عقد ومقاعد مؤسسته فقط؛ لا يرى تقييمات تفصيلية أو عقود أخرى.

### Program Manager

يرى البرنامج والإصدار والدفعات المسندة؛ لا يدير الاشتراك المؤسسي ما لم يملك Scope مستقلًا.

### Cohort Coordinator

يرى الدفعات المسندة فقط.

### Instructor

يرى نشاط التدريب في البرنامج/الدفعة المسندة؛ لا يدير RBAC أو Entitlements.

### Certificate Officer

ينفذ إجراءات الشهادة بعد إثبات Eligibility؛ لا يغير نتائج التعلم للوصول إلى الأهلية.

## 10. حالات رفض واجهة إلزامية

يجب أن توجد حالة UX مستقلة لكل من:

1. Student persona يطلب Academy route دون Teacher profile.
2. Teacher persona يطلب Student-only action.
3. Entitlement Pending.
4. Entitlement Suspended.
5. Entitlement Expired.
6. Entitlement Revoked.
7. Organization scope mismatch.
8. Seats exhausted.
9. Enrollment بلا entitlement صالح.
10. Certificate not eligible.
11. Certificate revoked.
12. Certificate not found.
13. Role موجود لكن scope لا يغطي المورد.

الرسائل لا تكشف أسماء أدوار داخلية أو identifiers حساسة أو سياسات أمان داخلية.

## 11. UX Acceptance Matrix

المقاسات الدنيا:

- 360px
- 390px
- 412px
- 768px
- 1280px

متطلبات القبول:

- RTL صحيح.
- كل action قابل للوصول بلوحة المفاتيح.
- Focus ينتقل إلى رسالة الحالة/الرفض بعد الإجراء.
- لا يعتمد معنى الحالة على اللون فقط.
- لا يوجد Horizontal overflow في بطاقات الخطط والعقود والشهادات.
- زر Persona switch واضح ولا يبدو كـlogout.
- لا تعرض واجهة الطالب عناصر Academy admin حتى في Dual Persona.
- لا تعرض واجهة المعلم اشتراك الطالب أو تقدمه كمرجع authorization.

## 12. Mock Acceptance Scenarios

### L-PERSONA-01 — Dual Persona

Given هوية واحدة لها Student وTeacher profiles
When يختار المستخدم «المعلم»
Then يبدأ `/academy` مع Teacher state نظيفة دون Student navigation/cache.

### L-ENT-01 — Active entitlement

Given Teacher persona + Active entitlement لنسخة الرياضيات v1
When يفتح البرنامج
Then يسمح بالتعلم في v1 فقط، ولا يفتح v2 تلقائيًا.

### L-ENT-02 — Expired entitlement

Given Enrollment سابق وEntitlement منتهي
When يحاول بدء Activity جديدة
Then يرفض البدء ويحافظ على history دون تعديل.

### L-ORG-01 — Seats exhausted

Given عقد نشط و25/25 مقعدًا مخصصًا
When يحاول Organization Admin تخصيص مقعد
Then يرفض دون إنشاء Entitlement أو Enrollment.

### L-RBAC-01 — Wrong cohort

Given Instructor scoped على cohort A
When يطلب cohort B
Then deny-by-default دون تسريب قائمة أسماء cohort B.

### L-CERT-01 — Eligible

Given completed enrollment + passed assessment
When يطلب الإصدار Actor مخول
Then ينتقل إلى C2 مع Program Version ثابت.

### L-CERT-02 — Public revoked verification

Given شهادة Revoked
When يُدخل رمزها في صفحة التحقق العامة
Then تظهر الحالة revoked والبيانات الدنيا فقط.

## 13. شروط فتح أول تنفيذ غير إنتاجي للكود

حتى عند السماح لاحقًا بتنفيذ غير إنتاجي، يجب أن يكون أول Batch محدودًا إلى:

1. Fixtures محلية فقط.
2. Pure state reducers / validators بلا network.
3. Component tests لحالات Persona/Entitlement/Certificate.
4. A11y/RTL snapshots محلية.
5. لا Supabase client في الاختبارات الجديدة.
6. لا schema أو migration.
7. لا Payment SDK.
8. لا QB runtime import.

## 14. ترتيب التنفيذ بعد إغلاق البوابات الرسمية

1. إغلاق QB formal cutover أو اعتماد قرار Runtime نهائي.
2. اعتماد Import Contract رسميًا.
3. إغلاق force-delete release-governance blocker.
4. اعتماد Scoped RBAC schema/contract.
5. اعتماد Entitlement/Contract lifecycle.
6. تنفيذ Backend على staging فقط.
7. تنفيذ Academy UX المستقلة.
8. تنفيذ Certificate verification.
9. اختبارات RBAC/negative cases/PII.
10. E2E على staging.
11. قرار مستقل لأي Migration/Deploy إنتاجي.

## 15. القرارات التي ما تزال تحتاج اعتمادًا تجاريًا لاحقًا

لا تُخترع قيم افتراضية في الكود لهذه النقاط:

- أسعار الخطط.
- مدة الاشتراك.
- الخصومات.
- سياسة الاسترداد.
- سياسة نقل المقعد المؤسسي.
- فترة السماح بعد انتهاء العقد.
- مدى استمرار الوصول إلى السجل بعد انتهاء/تعليق الاستحقاق.
- مقدار اسم حامل الشهادة المعروض في التحقق العام.

## 16. Gate Summary

```text
STAGE_20L=DESIGN_ONLY
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
QUESTION_BANK=PASS_OPERATIONAL_IMPROVED/HOLD_FORMAL_CUTOVER
IMPORT_CONTRACT=PASS_OPERATIONAL_STRONG/HOLD_FORMAL
SCOPED_RBAC=TARGET_FROZEN/RUNTIME_PARTIAL
ENTITLEMENTS=TARGET_FROZEN/RUNTIME_NOT_READY
SECURITY_RELEASE_GATE=HOLD
TEACHER_STUDENT_BOUNDARY=FROZEN
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
PAYMENT_INTEGRATION=NO
QB_RUNTIME_INTEGRATION=NO
```
