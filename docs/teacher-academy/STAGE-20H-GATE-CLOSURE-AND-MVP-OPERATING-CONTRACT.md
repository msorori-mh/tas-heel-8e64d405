# STAGE 20H — Gate Closure & MVP Operating Contract

## الحالة

هذه مرحلة تحليل وتصميم غير إنتاجية فقط لـ«أكاديمية معلم الثانوية» فوق تطبيق طلاب الثانوية الحالي.

- Production write: **NO**
- Migration apply: **NO**
- Deploy: **NO**
- Payment integration: **NO**
- Question Bank runtime cutover: **NO**
- RLS/RPC production privilege change: **NO**

المرجع عند بدء المرحلة: `main@16d9725c04857b82576d45b011b972ae1c3db531`.

---

## 1. إعادة تقييم بوابات البدء

### 1.1 استقرار بنك الأسئلة — PARTIAL / HOLD FOR RUNTIME CUTOVER

حدث تحسن تشغيلي مهم في دورة حياة الأسئلة الوزارية: التصحيح بعد الاستيراد أصبح ينشئ مراجعة جديدة immutable revision، ويحافظ على جلسات الطلاب القديمة مثبتة على مراجعتها الأصلية، ويعيد النموذج إلى `draft` قبل أي نشر جديد.

هذا يرفع سلامة التحرير والمراجعات، لكنه **لا يساوي إغلاق بوابة بنك الأسئلة** لأن QB-03 ما يزال تصميم Cutover فقط والـruntime الافتراضي ما يزال `LEGACY`.

قرار 20H:

- نعامل سلامة دورة المراجعات على أنها **PASS_OPERATIONAL_IMPROVED**.
- نعامل QB Runtime Cutover على أنه **HOLD**.
- لا تعتمد الأكاديمية على QB runtime في MVP قبل إغلاق Cutover مستقل.

### 1.2 عقد الاستيراد — PASS OPERATIONAL / HOLD FORMAL

مسار Golden Lesson الفعلي أصبح أقوى بعد دعم CF10/CF11، PostgreSQL 17، والنشر الفعلي لمكونات الدرس والتجارب المتعددة، لكن PR العقد الرسمي V2 ما يزال Draft/HOLD.

قرار 20H:

- يسمح بالاعتماد على **مفاهيم المحتوى والبرنامج** في التحليل والتصميم.
- يمنع اعتبار عقد الاستيراد «معتمدًا رسميًا» للأكاديمية حتى إغلاق PR العقد أو إصدار عقد بديل superseding له.
- لا تنشأ أي migration أكاديمية اعتمادًا على عقد غير معتمد.

### 1.3 بنية المناهج — PASS BASELINE / RELEASE GOVERNANCE HOLD

هيكل الصف/المسار/الفصل/المادة/الوحدة/الدرس ومكونات Golden Lesson أصبح كافيًا كأساس تصميمي، لكن القدرة المسبقة للإطلاق `admin_curriculum_force_delete` ما تزال قدرة شديدة التدمير: Full Admin فقط داخليًا، لكنها متاحة كـRPC للمستخدمين authenticated ثم تحسم الصلاحية داخل الدالة، وتستطيع حذف بيانات تعلم وأسئلة ونشر وتعطيل immutable triggers أثناء المعاملة.

قرار 20H:

- لا يوجد دليل حالي على bypass مباشر لصلاحية Full Admin.
- مع ذلك تبقى الدالة **Release-governance blocker** قبل فتح أي كتابة إنتاجية جديدة للأكاديمية.
- الإغلاق المقبول لاحقًا: تقاعد الدالة، أو جعلها server-only/service-role، أو قفلها نهائيًا خارج بيئة pre-launch مع إثبات آلي.

### 1.4 الأدوار — TARGET FROZEN / RUNTIME PARTIAL

الـruntime الحالي للأكاديمية يمنح capability على `(user_id, capability)` دون scope مؤسسي/برنامج/دفعة.

قرار 20H: النموذج المستهدف الملزم قبل Backend جديد هو:

`actor -> organization -> program -> cohort -> capability`

ولا يجوز اشتقاق صلاحية أكاديمية من:

- Student `app_role`.
- كون المستخدم طالبًا أو معلمًا في تطبيق الطلاب.
- إكمال دورة تدريبية وحده.
- امتلاك اشتراك طلابي أو محفظة طالب.

### 1.5 الاشتراكات والعقود — TARGET FROZEN / RUNTIME NOT READY

`academy.self_enroll(program_version_id)` ما يزال جزءًا من أساس runtime الحالي، لذلك لا توجد طبقة Entitlement مستقلة تضمن أن التسجيل ناتج عن شراء فردي أو مقعد مؤسسي صالح.

قرار 20H:

- `self_enroll` لا يعد عقدًا تجاريًا مقبولًا للنسخة المستهدفة.
- enrollment الجديد يجب أن يعتمد على Entitlement صالح.
- لا أسعار نهائية في التصميم حتى يعتمدها المالك.

### 1.6 الموانع الأمنية — GATE CLOSED

بوابة «لا توجد موانع أمنية حرجة/إطلاقية» **غير مغلقة** بسبب مسار force-delete المذكور أعلاه، إضافة إلى أن Scoped RBAC وEntitlements لم يصلا إلى runtime المستهدف.

**النتيجة:**

`ACADEMY_FULL_PROGRAMMING_GATE = CLOSED`

المسموح الآن: التحليل، التصميم، البرامج، الأدوار، العقود، UX، الاشتراكات، الشهادات، وخطة التنفيذ فقط.

---

## 2. عقد التشغيل المستهدف لـMVP

### 2.1 حدود المنتج

الأكاديمية مساحة مستقلة وظيفيًا عن تطبيق الطالب حتى لو اشتركا في Supabase Auth أو تطبيق Android واحد.

الحد الأدنى الملزم:

- Student entry: `/auth` ثم مساحة الطالب.
- Teacher entry: `/academy` ثم مساحة المعلم.
- جلسة الهوية قد تكون مشتركة، لكن persona والملف والـRBAC والاشتراكات والشهادات مستقلة.
- لا تظهر عناصر إدارة الأكاديمية داخل StudentShell كصلاحيات طالب.
- لا تُستخدم جداول الطالب/المحفظة/الشهادات الطلابية لمنح أي حق أكاديمي.

### 2.2 الأدوار المستهدفة

| الدور | النطاق | أهم الصلاحيات | ممنوعات صريحة |
|---|---|---|---|
| Teacher Learner | self | التعلم، الاختبارات، الشهادات الشخصية | إدارة المحتوى، منح صلاحيات، رؤية بيانات الآخرين |
| Organization Admin | organization | إدارة أعضاء المؤسسة والمقاعد | صلاحيات خارج المؤسسة، نشر QB |
| Program Manager | organization + program | إدارة دفعات وبرنامج محدد | برامج أخرى، Student data |
| Cohort Coordinator | organization + program + cohort | متابعة دفعة محددة | تعديل المحتوى المصدر أو العقود |
| Instructor | program/cohort | جلسات وتفاعل تدريبي | منح RBAC، إصدار مالي |
| Certificate Officer | organization/program | إصدار/إلغاء الشهادات المؤهلة | تعديل نتائج التعلم |
| Support | scoped support | حل مشاكل الوصول غير الحساسة | تغيير الدرجات أو منح اشتراك |
| Academy Super Admin | academy | إدارة المنظومة | لا يرث صلاحيات Student/QB تلقائيًا |

أي صلاحية QB (`qb_edit`, `qb_review`, `qb_publish`) تبقى مجالًا منفصلًا ولا تُمنح تلقائيًا لأي دور أكاديمية.

---

## 3. عقد الاشتراك والاستحقاق

### 3.1 حالات Entitlement

- `PENDING`
- `ACTIVE`
- `SUSPENDED`
- `EXPIRED`
- `REVOKED`

لا يسمح بالتسجيل أو الاستمرار في محتوى مدفوع جديد إلا وفق سياسة صريحة لكل حالة.

### 3.2 المصادر المقبولة للاستحقاق

1. **شراء فردي معتمد**.
2. **مقعد مؤسسي** ضمن عقد ساري، عضوية مستخدم نشطة، وبرنامج مطابق.
3. **منحة/كوبون إداري** إذا أضيف لاحقًا، بسجل تدقيق مستقل.

### 3.3 العقد المؤسسي

الحد الأدنى المفاهيمي:

- organization
- contract
- contract_term
- purchased_programs
- seat_pool
- seat_assignment
- entitlement
- audit trail

حالات العقد:

- `DRAFT`
- `ACTIVE`
- `SUSPENDED`
- `EXPIRED`
- `TERMINATED`

لا يؤدي وجود المستخدم في المؤسسة وحده إلى Entitlement.

### 3.4 قاعدة التسجيل

التسلسل المستهدف:

`plan/contract -> entitlement -> enrollment -> learning -> completion -> certificate`

وليس:

`authenticated user -> self_enroll -> access`

---

## 4. عقد الشهادات

### 4.1 الأهلية

لا تصدر الشهادة إلا عند تحقق جميع الشروط المعتمدة للنسخة المحددة من البرنامج، على الأقل:

- enrollment صالح.
- إكمال جميع المكونات الإلزامية.
- اجتياز التقييم النهائي بالحد المعتمد للبرنامج.
- عدم وجود revocation أكاديمي يمنع الشهادة.
- تثبيت الشهادة على `program_version_id` الذي أكمله المعلم.

انتهاء الاشتراك بعد الإكمال لا يلغي شهادة صادرة صحيحة تلقائيًا؛ الإلغاء قرار مستقل ومُدقق.

### 4.2 حالات الشهادة

- `ELIGIBLE`
- `ISSUED`
- `REVOKED`

### 4.3 التحقق العام

صفحة التحقق العامة تكشف الحد الأدنى فقط:

- حالة الشهادة.
- اسم صاحبها بالقدر الذي يعتمد لاحقًا.
- اسم البرنامج.
- تاريخ الإصدار.
- رقم/رمز الشهادة.

لا تكشف البريد، الهاتف، المؤسسة الداخلية، الدرجات التفصيلية، سجلات المحاولات أو أي Student PII.

---

## 5. البرامج التدريبية — خط الأساس

يستمر التصميم على برامج المواد الثمانية للثانوية:

1. القرآن الكريم.
2. التربية الإسلامية.
3. اللغة العربية.
4. اللغة الإنجليزية.
5. الرياضيات.
6. الفيزياء.
7. الكيمياء.
8. الأحياء.

يظل لكل برنامج version مستقل، ولا تعدل شهادة قديمة عند تحديث محتوى البرنامج لاحقًا.

الأسعار، مدة الاشتراك التجارية، وسياسة الخصومات **TBD — تحتاج قرار مالك** ولا تُخترع قيم في هذه المرحلة.

---

## 6. UX — حالات يجب أن تكون مصممة قبل Backend

### 6.1 teacher-only

- يدخل إلى `/academy`.
- لا يحتاج Student profile.
- لا يرى واجهة الطالب أو محفظته أو امتحاناته.

### 6.2 student-only

- يبقى في Student persona.
- لا يحصل على Academy capabilities لمجرد وجود الحساب.

### 6.3 dual-persona

- نفس `auth.users.id` مسموح.
- ملفان منطقيان مستقلان.
- تبديل persona صريح.
- navigation وdata loaders منفصلان.
- لا صلاحيات متقاطعة ضمنيًا.

### 6.4 حالات الرفض الإلزامية

يجب تصميم رسائل وحالات UI لـ:

- no entitlement.
- expired entitlement.
- suspended entitlement.
- revoked entitlement.
- contract expired.
- seat pool exhausted.
- wrong organization.
- wrong program.
- wrong cohort.
- certificate not eligible.
- certificate revoked.
- capability out of scope.

---

## 7. خطة إغلاق البوابات قبل أي Backend جديد

### Gate A — QB

يغلق عندما:

- يعتمد مسار Cutover أو يعتمد قرار رسمي بأن Academy MVP معزولة تمامًا عن QB runtime.
- لا يبقى default غير مقصود على LEGACY للمسارات التي تحتاج QB الجديد.
- توجد rollback/verification evidence.

### Gate B — Import Contract

يغلق عندما:

- يغلق/يُستبدل PR العقد V2 رسميًا.
- يصبح العقد المنشور مطابقًا للمسار التشغيلي الفعلي CF10/CF11.
- regression V1/V2 مثبت ومؤرخ.

### Gate C — Scoped RBAC

يغلق عندما يعتمد تصميم schema/authorization لـorganization/program/cohort ويجتاز negative tests محليًا وPG17 قبل أي production migration.

### Gate D — Commerce & Entitlements

يغلق عندما يعتمد العقد التجاري وحالات entitlement ويمنع التسجيل المدفوع دون entitlement.

### Gate E — Security

يغلق عندما:

- يتم تقاعد/تقييد prelaunch force-delete بطريقة قابلة للإثبات.
- لا توجد capability inheritance من Student persona.
- negative authorization matrix ناجحة.
- لا توجد أسرار أو service-role في العميل.

### Gate F — Certificates

يغلق عندما يعتمد:

- eligibility contract.
- version pinning.
- issue/revoke audit.
- privacy-minimal public verification.

---

## 8. ترتيب التنفيذ عندما تُفتح البوابة المناسبة

لا يبدأ هذا الترتيب الآن؛ هو خطة التنفيذ فقط.

1. **Non-prod scoped RBAC schema + negative contract tests**.
2. **Non-prod entitlement/contract schema + lifecycle tests**.
3. **Non-prod enrollment gate replacing direct commercial self-enroll**.
4. **Non-prod certificate lifecycle**.
5. **Teacher UI integration against non-prod contracts**.
6. **PG17 integration + E2E personas**.
7. **Staging only after all previous gates pass**.
8. **Production migration/deploy only بتفويض صريح مستقل**.

---

## 9. قرارات 20H

- `QUESTION_REVISION_LIFECYCLE = PASS_OPERATIONAL_IMPROVED`
- `QUESTION_BANK_RUNTIME_CUTOVER = HOLD`
- `IMPORT_CONTRACT = PASS_OPERATIONAL / HOLD_FORMAL`
- `CURRICULUM_STRUCTURE = PASS_BASELINE`
- `ACADEMY_SCOPED_RBAC = TARGET_FROZEN / RUNTIME_PARTIAL`
- `ACADEMY_ENTITLEMENTS = TARGET_FROZEN / RUNTIME_NOT_READY`
- `TEACHER_STUDENT_SEPARATION = REQUIRED_AND_FROZEN`
- `SECURITY_RELEASE_GATE = HOLD`
- `ACADEMY_FULL_PROGRAMMING_GATE = CLOSED`
- `PRODUCTION_WRITE = NO`
- `MIGRATION_APPLY = NO`
- `DEPLOY = NO`

الجزء الآمن التالي، إذا بقيت البوابات مغلقة، هو توحيد Decision Log التجاري والتنظيمي (الأسعار، مدة الاشتراك، قواعد المقعد المؤسسي، سياسة انتهاء الاستحقاق، أهلية الشهادة) وتجهيز مصفوفة قبول UX نهائية فقط، دون Backend أو Migration أو نشر.
