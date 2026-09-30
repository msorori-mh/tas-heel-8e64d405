# Stage 20O — Teacher Workspace Contract Reconciliation

الحالة: **تحليل/تصميم غير إنتاجي فقط**.

المرجع: `main@9a566791c7cfd821b84b5a54c44cad614e8ac677`.

## 1) قرار البوابة

بوابة البرمجة الكاملة لـ «أكاديمية معلم الثانوية» تبقى **مغلقة**.

- بنك الأسئلة: PR #58 ما يزال `Draft`، والـruntime الافتراضي ما يزال `LEGACY` دون Cutover رسمي.
- عقد الاستيراد: PR #96 ما يزال `Draft/HOLD` رسميًا.
- بنية الأكاديمية: واجهة المعلم أصبحت أكثر نضجًا، لكن Runtime ما يزال يستخدم capability grants عامة على المستخدم و`self_enroll` المباشر بدل Scoped RBAC + Contract/Entitlement lifecycle.
- الأمن: `public.admin_curriculum_force_delete` ما يزال Full-Admin-checked داخليًا، لكنه ممنوح للتنفيذ لدور `authenticated` ويملك قدرة حذف عميق وتعطيل immutable triggers داخل المعاملة؛ لذلك يبقى Release-governance blocker.

لا يغيّر دمج تحسينات واجهة المعلم قرار هذه البوابات.

## 2) ما تغير منذ Stage 20N

تم دمج إعادة تنظيم Teacher workspace في PR #259، وأصبحت الصفحة الرئيسية للأكاديمية تتضمن:

- Dashboard مستقلة للمعلم.
- ملخص البرامج المتاحة.
- ملخص البرامج المسجل بها.
- الشهادات الصالحة.
- بطاقة متابعة آخر برنامج.
- تنقل مستقل: الرئيسية، البرامج، مساري، الشهادات، الملف المهني.
- فصل Admin workspace عن Teacher workspace عبر portal/capability checks.

هذا التغيير يصنف كـ **UX baseline PASS** فقط، وليس Domain/Commerce/Security gate pass.

## 3) عقد الفصل بين الطالب والمعلم

### Student persona

- Student workspace يظل مستقلًا.
- لا يجوز استخدام `public.profiles.app_role` أو اشتراك الطالب لمنح صلاحيات الأكاديمية.
- لا يرث الطالب Catalog management أو Progress view أو Certificate administration.

### Teacher persona

- الدخول الوظيفي يعتمد على Teacher profile مستقل في `academy.teacher_profiles`.
- Teacher workspace لا يعرض Admin workspace إلا إذا كان `portal=admin` ومع Capability صريحة.
- حالة `ACTIVE` في ملف المعلم شرط دخول مساحة المعلم، لكنها ليست بديلًا عن Entitlement للبرامج التجارية.

### Dual persona

- نفس Auth identity قد يخدم شخصيتي طالب/معلم، لكن الملفات والأدوار والاشتراكات والشهادات تبقى مستقلة منطقيًا.
- مشاركة Session التقنية لا تسمح بوراثة أي Role أو Entitlement بين المساحتين.

## 4) مراجعة Teacher Dashboard الحالية

Dashboard الحالية تقرأ بالتوازي:

- `listMyLearning()`
- `loadVisiblePrograms()`
- `listMyCertificates()`

القبول التصميمي:

- هذه البيانات تخص Teacher persona فقط.
- فشل مصدر واحد لا يجب أن يحوّل المستخدم تلقائيًا لمساحة الطالب أو Admin.
- أعداد البرامج والشهادات تعتبر معلومات عرض، لا مصدر تفويض Authorization.
- زر «ابدأ التدريب» لا يجوز مستقبلًا أن ينشئ Enrollment تجاريًا دون Entitlement فعال.

## 5) فجوة Enrollment/Entitlement

Runtime الحالي ما يزال يحتوي:

`academy.self_enroll(program_version_id)`

ويتحقق من اكتمال ملف المعلم وظهور البرنامج، ثم ينشئ Enrollment مباشرة.

العقد المستهدف قبل التشغيل التجاري:

`Plan/Offer → Contract/Order → Entitlement → Enrollment → Learning → Completion → Certificate`

حالات Entitlement المطلوبة:

- `PENDING`
- `ACTIVE`
- `SUSPENDED`
- `EXPIRED`
- `REVOKED`

فقط `ACTIVE` يسمح بإنشاء Enrollment جديد أو متابعة محتوى محمي وفق سياسة البرنامج.

## 6) فجوة Scoped RBAC

الوضع الحالي يستخدم Capability على مستوى:

`user_id + capability`

الوضع المستهدف:

`actor + capability + scope_type + scope_id`

Scopes المطلوبة قبل أي توسع إداري:

- `ACADEMY_GLOBAL`
- `PROGRAM`
- `ORGANIZATION`
- `COHORT`

حالات رفض إلزامية:

- مشرف مؤسسة لا يرى بيانات مؤسسة أخرى.
- مدير برنامج لا يرث صلاحيات العقود أو الفوترة.
- مدرب/مراجع لا يستطيع إدارة Entitlements إلا بصلاحية مستقلة.
- Student-only user لا يحصل على أي Academy capability.

## 7) عقد الشهادات

واجهة الشهادات الحالية يمكن استمرار تصميمها، لكن الإصدار التجاري يجب أن يعتمد على:

- Enrollment مكتمل.
- Version ثابت للبرنامج عند الإكمال.
- اجتياز التقييم ومتطلبات البرنامج.
- عدم وجود Suspension/Revocation مانع للإصدار.
- Certificate verification يعرض الحد الأدنى من البيانات فقط.

إلغاء Entitlement بعد الإكمال لا يمحو سجل التعلم؛ سياسة بقاء/إلغاء الشهادة يجب أن تكون صريحة ومستقلة.

## 8) قرار الأمان

`admin_curriculum_force_delete` لا يعتبر bypass مباشرًا لأن الدالة تفحص Full Admin داخليًا، لكنه يبقى مانع حوكمة قبل فتح توسع إنتاجي للأكاديمية للأسباب التالية:

- القدرة ممنوحة لدور `authenticated` على مستوى EXECUTE.
- الدالة تحذف محاولات وتقدمًا وأسئلة ونشرًا ومحتوى منهجيًا.
- الدالة تعطل immutable triggers مؤقتًا داخل المعاملة.

معيار الإغلاق: تضييق/تقاعد القدرة بسياسة معتمدة واختبارات رفض سلبية موثقة، ثم إعادة تقييم Security gate.

## 9) الحالة النهائية للبوابات

| البوابة | الحالة | الملاحظة |
|---|---|---|
| Question Bank | HOLD | PR #58 Draft + LEGACY runtime |
| Import Contract | HOLD | PR #96 Draft/HOLD |
| Curriculum Structure | PASS_BASELINE | بنية البرامج/المحتوى موجودة، لا تكفي وحدها للفتح |
| Teacher/Student UI separation | PASS_BASELINE_UI | Workspace مستقل وظيفيًا |
| Scoped RBAC | PARTIAL | capability غير scoped |
| Subscriptions/Entitlements | NOT_READY | `self_enroll` مباشر |
| Certificates | DESIGNABLE | يلزم ربط نهائي بالـEntitlement/Completion |
| Critical security release gate | HOLD | deep-delete governance blocker |
| Full academy programming gate | CLOSED | لا تتحقق الشروط مجتمعة |

## 10) الجزء التالي المسموح

طالما البوابات أعلاه غير مغلقة، العمل المسموح محصور في:

- UX journeys للمعلم وحالات الرفض.
- مخطط البرامج التدريبية ومخرجاتها.
- Scoped RBAC design.
- العقود والاشتراكات والمقاعد والـEntitlements.
- الشهادات والتحقق منها.
- مصفوفات القبول وخطة التنفيذ.

الممنوع ضمن هذا المسار:

- Production writes.
- Migration apply.
- Deploy.
- Payment integration.
- QB runtime integration/cutover.
- أي تغيير Production schema/RLS/RPC.

## 11) Trigger لأول تنفيذ غير إنتاجي جديد

لا يبدأ كود Domain جديد إلا بعد إغلاق بوابة مناسبة رسميًا. وعندها يبدأ بالترتيب:

1. Pure domain types/validators.
2. Mock fixtures فقط.
3. Component/A11y/role-denial tests.
4. Isolated staging بعد إغلاق بقية البوابات اللازمة.

هذا المستند لا يمنح أي إذن إنتاجي.