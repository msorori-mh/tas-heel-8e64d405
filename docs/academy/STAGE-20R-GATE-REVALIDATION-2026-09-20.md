# Stage 20R — Gate Revalidation — 2026-09-20

المرجع: `main@c6f8a2e0ef6b115fe05f715aec22cecb8c9c9268`.

## النتيجة التنفيذية

```text
QUESTION_BANK_FORMAL_GATE=HOLD
IMPORT_CONTRACT_FORMAL_GATE=HOLD
CURRICULUM_STRUCTURE=PASS_BASELINE / HOLD_INTEGRATED_GATE
SCOPED_RBAC=HOLD
SUBSCRIPTIONS_ENTITLEMENTS=HOLD
SECURITY_RELEASE_GATE=HOLD
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
```

## 1) بنك الأسئلة

PR #58 ما يزال Open + Draft، ويذكر صراحة أن runtime الافتراضي يبقى `LEGACY`، ولا توجد موافقة Cutover رسمية.

التحسينات اللاحقة في دورة حياة الأسئلة مهمة لكنها لا تستبدل قرار الـformal cutover المطلوب.

**القرار: HOLD.**

## 2) عقد الاستيراد

PR #96 ما يزال Open + Draft + HOLD. شروطه المعلنة قبل الاعتماد تشمل إكمال CF10/CF11 وفق العقد، PostgreSQL regression، وإثباتات runtime/E2E المطلوبة.

وجود إصلاحات لاحقة منفصلة في نشر المحتوى لا يغيّر حالة PR الرسمية ولا يثبت تلقائيًا أن عقد V2 بكامله أصبح معتمدًا.

**القرار: HOLD.**

## 3) بنية المناهج

المنصة تملك بالفعل أساسًا تشغيليًا للبرامج والإصدارات والتعلم والتقييم والشهادات، كما أن بنية محتوى الطالب تطورت بشكل ملحوظ.

لكن هذه النقطة وحدها لا تكفي لفتح الأكاديمية لأن عقود الاستيراد/BQ cutover والتفويض التجاري ليست مغلقة.

**القرار: PASS_BASELINE فقط، وليس PASS للبوابة المجمعة.**

## 4) الأدوار وScoped RBAC

الـruntime الحالي يعتمد `academy.capability_grants` مع unique active grant على `(user_id, capability)`؛ لا يوجد Scope كامل للمؤسسة/البرنامج/الدفعة ضمن العقد التشغيلي الحالي.

لذلك لا يمكن اعتماد نموذج صلاحيات المؤسسة/البرنامج قبل إضافة Scoped RBAC في مرحلة منفصلة واختباره على staging.

**القرار: HOLD.**

## 5) الاشتراكات والاستحقاقات

`academy.self_enroll(uuid)` ما يزال جزءًا من الـruntime ومن الـTeacher Academy API، ويُمنح التنفيذ لـ`authenticated` ضمن foundation الحالية. هذا لا يمثل دورة `Contract -> Entitlement -> Enrollment` المطلوبة للتشغيل التجاري الآمن.

**القرار: HOLD.**

## 6) المانع الأمني

`public.admin_curriculum_force_delete(text,uuid,text)` في baseline الحالي:

- `SECURITY DEFINER`.
- يتحقق داخليًا من `public.is_full_admin(auth.uid())`.
- لكنه ما يزال ممنوح `EXECUTE` لدور `authenticated`.
- يحذف سجلات تعلم ومحاولات وأسئلة ومحتوى ونشر.
- يعطل مجموعة من immutable triggers مؤقتًا داخل المعاملة لإتمام الحذف العميق.

المطلوب لإغلاق البوابة ليس مجرد وجود فحص Full Admin داخل الدالة، بل قرار governance واضح: إما retirement للمسار بعد المرحلة التجريبية، أو break-glass مقيد ومثبت باختبارات رفض ومراقبة وتدقيق.

**القرار: SECURITY RELEASE GATE = HOLD.**

## 7) فصل Teacher / Student

الفصل في Stage 20R يبقى عقدًا صريحًا:

- لا استخدام Student role لتفويض الأكاديمية.
- لا استخدام Student subscription كـTeacher entitlement.
- لا مشاركة لمساحة الشهادات.
- لا إضافة تغييرات إلى Student app ضمن هذه المرحلة.

## 8) العمل المسموح الآن

مع بقاء البوابات مغلقة، المسموح فقط:

- الرؤية والنطاق.
- تصميم البرامج التدريبية.
- العقود المنطقية.
- الأدوار والصلاحيات المستهدفة.
- تجربة الاستخدام.
- نموذج الاشتراكات والمقاعد.
- سياسات الشهادات.
- خطة التنفيذ والاختبارات المستقبلية.

الممنوع:

- Production write.
- Migration apply.
- Deploy.
- Payment integration.
- QB runtime cutover.
- Production schema/RLS/RPC changes.
- أي تغيير في Student app ضمن Stage 20R.
