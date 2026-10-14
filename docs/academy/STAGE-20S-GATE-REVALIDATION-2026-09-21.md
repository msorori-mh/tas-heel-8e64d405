# Stage 20S — Gate Revalidation — 2026-09-21

المرجع: `main@c6f8a2e0ef6b115fe05f715aec22cecb8c9c9268`.

## النتيجة التنفيذية

```text
QUESTION_BANK_FORMAL_GATE=HOLD
IMPORT_CONTRACT_FORMAL_GATE=HOLD
CURRICULUM_STRUCTURE=PASS_BASELINE / HOLD_INTEGRATED_GATE
SCOPED_RBAC=HOLD
SUBSCRIPTIONS_ENTITLEMENTS=HOLD
SECURITY_RELEASE_GATE=HOLD
TEACHER_STUDENT_SEPARATION=PASS_BASELINE_UI / CONTRACT_REQUIRED
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
```

## 1) بنك الأسئلة

PR #58 ما يزال `Open + Draft` ويذكر صراحة أن runtime الافتراضي يبقى `LEGACY`، ولا توجد موافقة Cutover رسمية.

**القرار: HOLD.**

## 2) عقد الاستيراد

PR #96 ما يزال `Open + Draft + HOLD`. شروطه المعلنة قبل الاعتماد تشمل إكمال CF10/CF11 وفق عقد V2، PostgreSQL regression، وإثباتات runtime/E2E وعدم تسريب الإجابات.

**القرار: HOLD.**

## 3) بنية المناهج

البنية الحالية للأكاديمية تتضمن Programs وProgram Versions وEnrollments والتعلم والتقييم والشهادات كأساس تشغيلي. هذا يكفي لتصميم تجربة الأكاديمية، لكنه لا يغلق البوابة المجمعة بسبب استمرار HOLD في الاستيراد والتفويض التجاري والأمان.

**القرار: PASS_BASELINE فقط.**

## 4) الأدوار وScoped RBAC

`academy.capability_grants` في baseline الحالي يمنح capability على `(user_id, capability)` مع active unique grant، ولا يحمل Scope كاملًا للمؤسسة أو البرنامج أو الدفعة.

**القرار: HOLD حتى وجود Scoped RBAC واختبارات رفض وقبول على staging.**

## 5) الاشتراكات والاستحقاقات

`academy.self_enroll(uuid)` ما يزال مسار runtime مباشرًا وممنوحًا لـ`authenticated`. لا توجد بعد دورة تشغيلية مكتملة ومفصولة من:

`Plan → Contract → Entitlement → Enrollment → Completion → Certificate`.

**القرار: HOLD.**

## 6) المانع الأمني

`public.admin_curriculum_force_delete(text,uuid,text)` ما يزال موجودًا، وتوجد migration لاحقة تمنح `EXECUTE` لدور `authenticated` مع إبقاء `service_role`. رغم وجود فحص Full Admin داخل الوظيفة، يبقى المسار عالي الحساسية بسبب الحذف العميق وتعطيل immutable triggers أثناء التنفيذ.

المطلوب لإغلاق هذه البوابة: إما retirement صريح للمسار أو break-glass مقيد ومثبت باختبارات رفض وتدقيق ومراقبة.

**القرار: SECURITY RELEASE GATE = HOLD.**

## 7) فصل Teacher / Student

الأساس الحالي للأكاديمية مصمم أصلًا داخل schema `academy` ومعزول عن `student profile` و`app_role`، وهذا اتجاه صحيح. العقد الملزم لـStage 20S:

- لا استخدام Student role لتفويض الأكاديمية.
- لا استخدام اشتراك الطالب كـTeacher entitlement.
- لا مشاركة تلقائية للشهادات أو التقدم أو Enrollment.
- يمكن مشاركة حساب المصادقة نفسه مع Dual Persona، لكن كل Persona لها واجهة وصلاحيات واستحقاقات وتعلم وشهادات مستقلة.
- لا تعديل في Student app ضمن Stage 20S.

## 8) العمل المسموح الآن

مع بقاء البوابات مغلقة، يُسمح فقط بـ:

- الرؤية والنطاق.
- تصميم البرامج التدريبية.
- الأدوار والصلاحيات المستهدفة.
- العقود المنطقية.
- تجربة الاستخدام.
- الاشتراكات والمقاعد المؤسسية.
- سياسات الشهادات.
- خطة التنفيذ ومصفوفة القبول والاختبارات المستقبلية.

الممنوع:

- Production write.
- Migration apply.
- Deploy.
- Payment integration.
- QB runtime cutover.
- Production schema/RLS/RPC changes.
- أي تغيير في Student app.
