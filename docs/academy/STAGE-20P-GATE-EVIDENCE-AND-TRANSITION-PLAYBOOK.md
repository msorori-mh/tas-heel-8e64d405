# Stage 20P — Gate Evidence & Transition Playbook

الحالة: **تحليل/تصميم غير إنتاجي فقط**.

المرجع: `main@7520a6a22ec9fcd4b18f6d4b12ad221fd30365d4`.

## 1) قرار البوابة الحالي

بوابة البرمجة الكاملة لـ «أكاديمية معلم الثانوية» تبقى **مغلقة**.

الأسباب المثبتة على المرجع الحالي:

- Question Bank: PR #58 ما يزال `Draft/Open` ويصرح أن runtime الافتراضي يبقى `LEGACY`، بلا Cutover رسمي.
- Import Contract: PR #96 ما يزال `Draft/HOLD` ويشترط استكمال CF10/CF11 لـV2 واختبارات PostgreSQL/E2E قبل الدمج.
- Academy Domain: Runtime ما يزال يوفّر `self_enroll(program_version_id)` مباشرة، بينما العقد التجاري المستهدف يعتمد Entitlement مستقلًا قبل Enrollment.
- Academy RBAC: الصلاحيات الحالية تتحقق كCapabilities عامة للمستخدم؛ النموذج المستهدف Scoped RBAC لم يُغلق تشغيليًا بعد.
- Security release gate: `admin_curriculum_force_delete` ما تزال SECURITY DEFINER، Full-Admin-checked داخليًا، لكنها ممنوحة EXECUTE لدور `authenticated` وتستطيع حذف بيانات تعلم/أسئلة/نشر وتعطيل immutable triggers مؤقتًا؛ لذلك تبقى Release-governance blocker.

تحسينات الطالب الأخيرة الخاصة بالأوفلاين، الملف، المدارس وقياس السعة لا تغيّر قرار بوابات الأكاديمية.

## 2) الهدف من Stage 20P

منع الانتقال المبكر من «تصميم جيد» إلى «تنفيذ Domain» قبل وجود دليل إغلاق واضح لكل بوابة.

هذه المرحلة تحوّل كل بوابة من وصف عام إلى **Evidence Contract** يحدد:

1. ما الذي يجب أن يصبح صحيحًا.
2. ما الدليل المطلوب لإثباته.
3. ما الذي يسمح ببدء المرحلة التالية.
4. ما الذي لا يعتبر دليلًا كافيًا.

لا تنفذ هذه المرحلة Migration أو Deploy أو Runtime cutover أو Payment/QB integration.

## 3) Evidence Contract — Question Bank

### الحالة الحالية

`HOLD_FORMAL_CUTOVER`

### شروط PASS

يجب أن تتحقق جميع النقاط التالية معًا:

- اعتماد مسار Revision رسمي بدل الاعتماد الافتراضي على LEGACY runtime.
- وجود Cutover plan محدد وقابل للرجوع، مع Rollback contract واضح.
- اكتمال backfill/revision mapping دون فقد محاولات تاريخية.
- ثبات السؤال المنشور عند وجود محاولات سابقة؛ أي تعديل ينشئ Revision جديدة.
- Negative tests تمنع تغيير الإجابة أو الخيارات لسؤال منشور مستخدم تاريخيًا دون Revision.
- اختبارات regression تغطي Student practice + ministerial exams + self-test + offline artifacts حيث ينطبق.
- اعتماد صريح بأن PR #58 أُغلق أو تم استبداله بقرار/تنفيذ أحدث معتمد.

### لا يكفي للـPASS

- نجاح UI إدارة الأسئلة فقط.
- نجاح اختبارات محلية مع بقاء runtime الافتراضي LEGACY.
- وجود Revision tables دون Cutover رسمي.

## 4) Evidence Contract — Import Contract V2

### الحالة الحالية

`HOLD_FORMAL`

### شروط PASS

- اعتماد عقد `tamkeen.golden-lesson-package.v2` كعقد رسمي غير Draft.
- CF10 materialization يقرأ V1/V2 وفق `contract_schema` دون hard-coded capability set قديم.
- CF11 publication يدعم V2 دون إعادة إدخال mindMap/labExperiment legacy assumptions.
- PostgreSQL regression فعلي لـV1 + V2.
- إثبات 8 official-book questions و20 self-test وفق العقد النهائي دون تسريب الإجابة للطالب.
- Build/TypeScript/E2E/RTL على checkout كامل.
- Error contract واضح للملفات الجزئية أو الدروس بلا وحدة.
- لا يُعتبر مجرد Preview ناجح اعتمادًا للعقد.

## 5) Evidence Contract — Curriculum & Program Structure

### الحالة الحالية

`PASS_BASELINE / NOT_FULL_DOMAIN_GATE`

البنية الأساسية للبرامج والمحتوى وTeacher workspace موجودة ويمكن متابعة تصميمها، لكنها وحدها لا تسمح بفتح البرمجة التجارية.

### شروط الثبات المطلوبة قبل Domain expansion

- Program Version immutable بعد النشر أو التخرج منه عبر Revision/Version جديدة.
- Learning completion مربوط بإصدار برنامج محدد.
- كل Program يملك سياسة واضحة للمدة، التقييم، النجاح، المحتوى الإلزامي والجلسات الحية.
- Subject-specific وAll-teachers audiences لا تتداخل دون قاعدة معلنة.
- لا يعتمد البرنامج على Student curriculum role أو Student subscription.

## 6) Evidence Contract — Scoped RBAC

### الحالة الحالية

`PARTIAL`

### النموذج المستهدف

`actor + capability + scope_type + scope_id`

Scopes:

- `ACADEMY_GLOBAL`
- `ORGANIZATION`
- `PROGRAM`
- `COHORT`

### Minimum role contracts

- Teacher Learner: تعلم شخصي فقط، لا إدارة.
- Academy Super Admin: إدارة عالمية للأكاديمية فقط، لا يرث صلاحيات Student Admin تلقائيًا.
- Program Manager: إدارة برنامج محدد.
- Organization Manager: إدارة مؤسسة/مدرسة محددة وفق العقد.
- Content/Assessment Manager: إدارة محتوى/تقييم ضمن Scope مستقل.
- Auditor/Support Read-only: قراءة محددة بلا تعديل.

### Negative acceptance

- Student-only identity = صفر Academy capabilities.
- Teacher learner لا يستطيع منح Entitlement لنفسه.
- Program Manager لا يرى عقود مؤسسة خارج Scope.
- Organization Manager لا يعدّل Catalog عالميًا.
- مشاركة Auth identity بين Student/Teacher لا تشارك Role أو Subscription أو Certificate.

## 7) Evidence Contract — Subscription / Contract / Entitlement

### الحالة الحالية

`NOT_READY`

### العقد المستهدف

`Plan/Offer → Contract/Order → Entitlement → Enrollment → Learning → Completion → Certificate`

### حالات Entitlement

- `PENDING`
- `ACTIVE`
- `SUSPENDED`
- `EXPIRED`
- `REVOKED`

### قواعد القبول

- `ACTIVE` فقط يسمح Enrollment جديدًا في برنامج مدفوع/مقيّد.
- `self_enroll` لا يكون مصدر تفويض تجاري مستقلًا.
- Suspension تمنع الوصول المحمي وفق السياسة ولا تمحو سجل التعلم.
- Expiration لا تعيد كتابة completion history.
- Revocation تسجل السبب والفاعل والتاريخ.
- Entitlement الطالب لا يمنح Entitlement للمعلم والعكس.

## 8) Evidence Contract — Certificates

الشهادة ليست نتيجة UI؛ هي أثر Domain موثق.

### شروط الإصدار

- Teacher persona صحيح.
- Enrollment صالح ومربوط بـProgram Version ثابت.
- Completion requirements مستوفاة.
- Assessment threshold مستوفى.
- لا مانع إداري صريح عند لحظة الإصدار.
- Certificate ID مستقل وقابل للتحقق.

### Verification contract

يعرض الحد الأدنى فقط:

- اسم صاحب الشهادة.
- اسم البرنامج.
- إصدار البرنامج أو مرجعه.
- تاريخ الإصدار.
- الحالة: Valid / Revoked.

لا يعرض بيانات حساسة من الملف المهني أو العقد أو الدفع.

## 9) Evidence Contract — Security Release Gate

### الحالة الحالية

`HOLD`

`admin_curriculum_force_delete` يبقى blocker حوكميًا حتى تحقق واحد من مسارين معتمدين:

### المسار A — Retirement

- إلغاء الحاجة التشغيلية للـprelaunch purge.
- سحب EXECUTE من الأدوار التطبيقية.
- إزالة/تعطيل واجهة الاستدعاء.
- إثبات رفض الاستدعاء من authenticated/admin غير المخصص.

### المسار B — Constrained break-glass

إذا تقرر الاحتفاظ به:

- لا يكون متاحًا لجميع `authenticated` حتى مع فحص داخلي فقط.
- Capability/role مخصص عالي الحساسية.
- Reason إلزامي وغير فارغ.
- Preview + explicit second confirmation contract.
- Audit immutable مستقل.
- منع التشغيل بعد launch state إلا بإجراء break-glass موثق.
- Negative tests تشمل teacher/student/content-manager/program-manager.
- سياسة موثقة لتعطيل/إعادة تفعيل immutable triggers بأمان أو إزالة الحاجة لذلك.

حتى إغلاق ذلك تبقى `CRITICAL_SECURITY_RELEASE_GATE=HOLD`.

## 10) فصل Student / Teacher — عقد غير قابل للتفاوض

### Student

- واجهة، profile، curriculum context، الاشتراك والشهادات الطلابية مستقلة.

### Teacher

- Teacher profile مستقل.
- Academy catalog/enrollment/learning/certificates مستقلة.
- Academy admin capabilities مستقلة.

### Dual persona

يجوز مشاركة Auth identity والجلسة التقنية فقط.

ممنوع:

- Role inheritance.
- Subscription inheritance.
- Certificate inheritance.
- استخدام `public.profiles.app_role` كـAcademy authorization source.
- توجيه فشل Academy إلى Student workspace كمسار fallback.

## 11) القرارات التجارية التي تبقى Owner Decisions

هذه البنود لا تمنع استمرار UX/design لكنها تمنع تثبيت Commerce runtime نهائي:

- سعر كل Plan أو البرنامج.
- مدة الاشتراك.
- فترة السماح بعد الانتهاء.
- سياسة Refund.
- سياسة نقل المقعد المؤسسي من معلم إلى آخر.
- هل الشهادة تبقى Valid بعد Expiration الطبيعي.
- أثر Refund/Revocation بعد Completion على الشهادة.
- هل الجلسات الحية ضمن السعر أم Add-on.

لا تُخترع قيم افتراضية لهذه القرارات داخل الكود.

## 12) Transition Ladder

طالما البوابات الرسمية أعلاه غير مغلقة:

### مسموح الآن

- الرؤية والنطاق.
- تصميم البرامج التدريبية.
- Role/Scope matrix.
- Contract/Entitlement states.
- UX journeys وحالات الرفض.
- Certificate policy.
- Acceptance matrices.
- خطة التنفيذ والـrollback/evidence checklists.

### غير مسموح الآن ضمن هذا المسار

- Production write.
- Migration apply.
- Deploy.
- Payment integration.
- QB runtime cutover/integration.
- Production schema/RLS/RPC modifications.
- Domain code يفترض أن البوابات أغلقت بينما هي HOLD.

### أول تنفيذ غير إنتاجي عند فتح بوابة مناسبة رسميًا

1. Pure domain types.
2. Pure validators/state reducers.
3. Mock fixtures.
4. Role-denial/component/A11y tests.
5. Isolated staging فقط بعد تحقق البوابات اللازمة لذلك النطاق.

## 13) Gate Matrix الحالية

| البوابة | الحالة | شرط الانتقال |
|---|---|---|
| Question Bank stability | HOLD_FORMAL_CUTOVER | Runtime cutover + revisions/backfill/regression evidence |
| Import Contract | HOLD_FORMAL | V2 CF10/CF11 + PG regression + E2E + formal approval |
| Curriculum/program structure | PASS_BASELINE | تثبيت version/completion contracts |
| Teacher/Student UI separation | PASS_BASELINE_UI | يبقى الفصل Domain/Authz إلزاميًا |
| Scoped RBAC | PARTIAL | scoped grants + negative evidence |
| Contracts/Entitlements | NOT_READY | entitlement-authorized enrollment |
| Certificates | DESIGN_READY | completion/version/verification contract |
| Security release gate | HOLD | retire/constrain deep-delete + negative evidence |
| Full academy programming gate | CLOSED | جميع البوابات المطلوبة للنطاق المحدد PASS |

## 14) قرار Stage 20P

`ACADEMY_FULL_PROGRAMMING_GATE=CLOSED`

هذه المرحلة لا تمنح إذن تنفيذ إنتاجي. الغرض منها أن يصبح أي انتقال لاحق قابلًا للإثبات بندًا ببند بدل الاعتماد على الانطباع بأن الواجهة أو الاختبارات الجزئية «مستقرة بما يكفي».