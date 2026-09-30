# Stage 20Q — Gate Revalidation (2026-09-19)

الحالة: **استمرار لنفس مرحلة التحليل/التصميم غير الإنتاجية**. لا تمثل هذه الوثيقة فتح مرحلة برمجية جديدة.

المرجع المعاد التحقق منه: `main@82475542af198b3110e5ac30cd96a4a148c0b059`.

## القرار

تبقى بوابة البرمجة الكاملة لـ«أكاديمية معلم الثانوية» **مغلقة**. التغيير الأخير على `main` لا يقدم دليلاً يغلق أيًا من البوابات الأربع المطلوبة.

## إعادة فحص البوابات

| البوابة | الحالة | الدليل الحالي | أثر القرار |
|---|---|---|---|
| استقرار بنك الأسئلة | HOLD رسميًا | PR #58 ما يزال Draft/Open، ويصرح أن runtime الافتراضي يبقى `LEGACY` وأن Cutover لم يُعتمد | لا QB runtime integration/cutover للأكاديمية |
| اعتماد عقد الاستيراد | HOLD رسميًا | PR #96 ما يزال Draft/HOLD ويشترط إكمال CF10/CF11 وPostgreSQL regression وE2E قبل الدمج | لا اعتماد Runtime على V2 contract |
| بنية المناهج/الأدوار/الاشتراكات | PASS جزئي للبنية والعزل، HOLD للـauthorization/commerce runtime | `academy` معزولة عن Student profile/app_role، لكن `capability_grants` الحالية على `(user_id, capability)` دون scope، و`self_enroll` ما يزال ينشئ Enrollment مباشرة دون Contract/Entitlement gate | نستمر في العقود المنطقية وUX فقط |
| عدم وجود مانع أمني حرج | HOLD | `admin_curriculum_force_delete` ما تزال `SECURITY DEFINER`، تتحقق من Full Admin داخليًا لكن EXECUTE ممنوح لـ`authenticated`، وتنفذ حذفًا عميقًا وتوقف immutable triggers داخل المعاملة | تبقى Release-governance blocker قبل أي توسع إنتاجي |

## الفصل الإلزامي بين الطالب والمعلم

يستمر اعتماد الحدود التالية دون استثناء:

- Student profile وTeacher persona كيانان مستقلان وظيفيًا حتى لو اشتركا في `auth_user_id`.
- `public.profiles.app_role` واشتراك الطالب لا يمنحان صلاحية أو Entitlement للأكاديمية.
- Teacher grants/roles لا تمنح صلاحيات داخل تطبيق الطالب.
- شهادات الأكاديمية وسجل تعلم المعلم لا تظهر ضمن مساحة شهادات/اشتراكات الطالب.
- أي Dual Persona تستخدم جلسة تقنية مشتركة فقط؛ authorization وsubscription state يبقيان منفصلين.

## العمل المسموح استكماله داخل Stage 20Q

يستمر العمل فقط في:

1. Canonical contracts للـPersona وScoped RBAC وPlan/Contract/Entitlement/Enrollment/Certificate.
2. Non-production test vectors ورفض cross-persona/cross-scope.
3. UX state contracts للاشتراك، انتهاء الاستحقاق، تعليق المعلم، وإصدار/إلغاء الشهادة.
4. برنامج التدريب ونطاقات البرامج ومتطلبات الإكمال والتقييم.
5. سجل القرارات التجارية غير المعتمدة دون اختراع قيم: السعر، مدة الاشتراك، الخصومات، الاسترداد، نقل المقاعد، grace period، وأثر إلغاء entitlement على الشهادة.
6. Transition plan لأول تنفيذ غير إنتاجي لاحق، بشرط فتح بوابة مناسبة رسميًا.

## المحظور

- `PRODUCTION_WRITE=NO`
- `MIGRATION_APPLY=NO`
- `DEPLOY=NO`
- `SCHEMA_RLS_RPC_CHANGE=NO`
- `PAYMENT_INTEGRATION=NO`
- `QB_RUNTIME_INTEGRATION=NO`
- `STUDENT_APP_AUTHORIZATION_CHANGE=NO`

## شرط الانتقال لأول تنفيذ غير إنتاجي

لا يبدأ حتى تتوافر أدلة رسمية تغلق البوابات المطلوبة بحسب Evidence Contract. عند فتح بوابة مناسبة، أول نطاق مسموح هو فقط: pure validators/reducers + mock fixtures + component/A11y tests، بلا Network أو Supabase أو Payment أو QB runtime.
