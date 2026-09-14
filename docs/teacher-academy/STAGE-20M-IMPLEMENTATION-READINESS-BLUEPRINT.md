# STAGE 20M — Implementation Readiness Blueprint

## الحالة

مرحلة تحليل وتصميم غير إنتاجية فقط لـ«أكاديمية معلم الثانوية»، مبنية على `main@571a25baf770197a4627f88c3820f643bd65205f`.

- Production write: **NO**
- Migration apply: **NO**
- Deploy: **NO**
- Payment integration: **NO**
- Question Bank runtime cutover: **NO**
- Supabase schema/RLS/RPC change: **NO**
- Student role/profile/subscription reuse for Academy authorization: **NO**

## 1. قرار البوابات

### 1.1 بنك الأسئلة

تحسّن المسار التشغيلي بعد تثبيت Revision lifecycle وإصلاح «اختبر فهمك» ودعم صور الأسئلة المضمّنة، لكن PR #58 ما يزال Draft، والـruntime الافتراضي في عقد QB-03 ما يزال `LEGACY` دون Cutover رسمي.

**الحالة:** `PASS_OPERATIONAL_IMPROVED / HOLD_FORMAL_CUTOVER`.

### 1.2 عقد الاستيراد

المسار التشغيلي أقوى من نقطة بداية PR #96، لكن PR #96 نفسه ما يزال Draft/HOLD ويشترط إغلاق عقد V2 الكامل وRegression/Publication evidence قبل الدمج الرسمي.

**الحالة:** `PASS_OPERATIONAL_STRONG / HOLD_FORMAL`.

### 1.3 بنية المناهج

هيكل البرامج والإصدارات والدروس والتقييمات موجود ومختبر تشغيليًا، لكن اعتماد الأكاديمية لا يُفصل عن بوابتي QB والاستيراد أعلاه عند أي تكامل Runtime لاحق.

**الحالة:** `STABLE_FOR_DESIGN / NOT_CLEARED_FOR_NEW_PRODUCTION_INTEGRATION`.

### 1.4 الأدوار والصلاحيات

الأساس الحالي يفصل schema الأكاديمية عن الطالب، لكنه يعتمد `academy.capability_grants(user_id, capability)` دون scope للمؤسسة/البرنامج/الدفعة. النموذج المستهدف يظل:

`actor -> organization -> program -> cohort -> capability`.

**الحالة:** `TARGET_FROZEN / RUNTIME_PARTIAL`.

### 1.5 الاشتراكات والاستحقاقات

الـruntime الحالي ما يزال يحتوي `academy.self_enroll(program_version_id)`؛ لم تُفرض بعد دورة:

`plan/order/contract -> entitlement -> enrollment -> learning -> completion -> certificate`.

**الحالة:** `TARGET_FROZEN / RUNTIME_NOT_READY`.

### 1.6 الأمان

`admin_curriculum_force_delete` ما تزال Full-Admin-checked داخل الدالة لكنها ممنوحة لـ`authenticated`، وتستطيع حذف سجل تعلم/أسئلة/نشر وتعطيل immutable triggers مؤقتًا داخل المعاملة. تبقى Release-governance blocker حتى اعتماد تقييد/تقاعد واضح قبل توسع إنتاجي جديد.

**الحالة:** `SECURITY_RELEASE_GATE = HOLD`.

### النتيجة

`ACADEMY_FULL_PROGRAMMING_GATE = CLOSED`.

المسموح الآن: الرؤية، النطاق، البرامج التدريبية، الأدوار، العقود، UX، الاشتراكات، الشهادات، وخطة التنفيذ فقط.

## 2. حد الفصل الإلزامي بين الطالب والمعلم

1. هوية Auth التقنية المشتركة مسموحة فقط لتسجيل الدخول.
2. `/auth` يمثل Student persona، و`/academy` يمثل Teacher persona.
3. Student `app_role` لا يمنح Academy capability.
4. Student subscription لا يمنح Academy entitlement.
5. Teacher entitlement لا يغيّر Student subscription أو progress.
6. Teacher profile منفصل عن Student profile حتى لو كان `auth.users.id` نفسه.
7. Dual persona يحتاج اختيارًا صريحًا وتبديل state صريحًا.
8. لا مشاركة لبيانات progress أو certificates أو contracts أو RBAC بين المجالين.
9. لا تُمنح صلاحيات Question Bank للمعلم المتعلم لمجرد امتلاكه Teacher persona.

## 3. نطاق MVP الأكاديمية عند فتح البوابات لاحقًا

### Teacher Learner

- اكتشاف البرامج المؤهلة.
- عرض المتطلبات والمدة.
- رؤية حالة الاستحقاق بوضوح.
- الالتحاق فقط بعد Entitlement صالح.
- التعلم والتقدم والتقييم.
- الشهادة والتحقق منها.

### Organization Admin

- عقد المؤسسة.
- المقاعد المتاحة والمستخدمة.
- تخصيص/إلغاء تخصيص وفق السياسة المعتمدة.
- تقارير تجميعية دون كشف محاولات الأسئلة التفصيلية.

### Program Operations

- Program Manager.
- Cohort Coordinator.
- Instructor.
- Certificate Officer.

كل دور يقيّد بنطاق مستقل ولا يورّث صلاحيات من Student app أو من مجرد Teacher profile.

## 4. خارطة التنفيذ المستقبلية — لا يبدأ أي كود منها الآن

### Wave A — Domain contracts

يبدأ فقط بعد إغلاق الأمن ووجود اعتماد رسمي للأدوار/الاشتراكات.

مخرجاته المستقبلية:
- Entitlement contract.
- Scoped RBAC contract.
- Organization/seat contract.
- Certificate issuance/revocation contract.

### Wave B — Non-production pure logic

يبدأ فقط بعد اعتماد Wave A، وبدون Network/Supabase:
- Fixtures.
- Pure reducers/state validators.
- Role/scope decision table tests.
- Certificate eligibility validators.
- RTL/A11y component tests على بيانات Mock.

### Wave C — Isolated staging integration

لا يبدأ إلا بعد إغلاق:
- QB formal cutover.
- Import contract formal acceptance.
- Critical security blockers.
- Scoped RBAC design approval.
- Entitlement lifecycle approval.

ولا يستخدم Student roles أو Student subscription كاختصار authorization.

### Wave D — Production readiness

ممنوع حتى نجاح:
- Security regression.
- RLS/permission matrix.
- Cross-persona isolation E2E.
- Contract/seat concurrency.
- Certificate privacy verification.
- Rollback/recovery rehearsal.
- Explicit owner approval.

## 5. مصفوفة قرارات ما تزال تحتاج اعتمادًا قبل التنفيذ التجاري

تبقى القيم التالية غير مفترضة:

- سعر الاشتراك الفردي.
- مدة الاشتراك.
- سياسة التجديد.
- فترة السماح بعد الانتهاء.
- سياسة الاسترداد.
- خصومات الجهات/المؤسسات.
- أقل/أكبر عدد مقاعد للعقد المؤسسي.
- سياسة نقل المقعد بين المعلمين.
- أثر تعليق العقد على التعلم السابق.
- أهلية إصدار شهادة بعد انتهاء entitlement إذا اكتمل البرنامج قبله.
- بيانات الاسم الظاهرة في التحقق العام للشهادة.

لا يجوز تضمين قيم افتراضية لها في Backend أو UI نهائي قبل القرار.

## 6. شروط فتح أول تنفيذ برمجي غير إنتاجي

لا يُسمح حتى يتحقق الحد الأدنى التالي معًا:

1. اعتماد عقد Scoped RBAC من ناحية النطاقات والأدوار.
2. اعتماد Entitlement lifecycle وعدم الاعتماد على `self_enroll` كمسار تجاري نهائي.
3. اعتماد عقد الشهادة وحالات revoke/verify والخصوصية.
4. عدم وجود تعارض مع Student persona boundaries.
5. بقاء التنفيذ محليًا/Mock بلا Network وبلا DB.

تحقق هذه الشروط لا يعني فتح Backend؛ يفتح فقط Wave B.

## 7. شروط فتح Backend/Staging لاحقًا

يلزم جميع ما يلي:

- `QUESTION_BANK_FORMAL_CUTOVER = PASS`
- `IMPORT_CONTRACT_FORMAL = PASS`
- `SECURITY_RELEASE_GATE = PASS`
- `SCOPED_RBAC_CONTRACT = APPROVED`
- `ENTITLEMENT_CONTRACT = APPROVED`
- `CERTIFICATE_CONTRACT = APPROVED`
- `STUDENT_TEACHER_ISOLATION = PASS`

أي شرط HOLD يبقي Runtime integration مغلقًا.

## 8. القرار التنفيذي في Stage 20M

لا يوجد تصريح لكتابة إنتاجية أو Migration أو Deploy أو دمج QB أو Payment.

العمل التالي الآمن عند استمرار HOLD هو **Acceptance & Traceability Pack** يربط كل رحلة (فردي/مؤسسي/دور/شهادة/Dual persona) بمعيار قبول، حالة رفض، ومسؤولية نطاق؛ وثائق فقط حتى تتغير إحدى البوابات رسميًا.
