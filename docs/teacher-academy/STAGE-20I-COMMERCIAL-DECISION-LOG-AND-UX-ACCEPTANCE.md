# STAGE 20I — Commercial Decision Log & UX Acceptance

## الحالة

مرحلة تحليل وتصميم غير إنتاجية فقط لـ«أكاديمية معلم الثانوية».

- Production write: **NO**
- Migration apply: **NO**
- Deploy: **NO**
- Payment integration: **NO**
- Question Bank runtime cutover: **NO**
- RLS/RPC production privilege change: **NO**

المرجع عند بدء المرحلة: `main@e2613cbe68971cf39349771d11bfc7f89f1859cf`.

## 1. إعادة تقييم بوابات البدء

### بنك الأسئلة — HOLD

PR #58 ما يزال Draft، والـruntime الافتراضي ما يزال `LEGACY`. تحسن مسار مراجعات الأسئلة الوزارية لا يساوي اعتماد QB runtime cutover.

### عقد الاستيراد — PASS_OPERATIONAL_STRONGER / HOLD_FORMAL

تم دمج PR #221 الذي يعالج اكتمال سجل الدروس خلف API row limits عبر pagination مستقرة، واجتازت رأسه Web CI وAndroid CI وPG17. هذا يقوي المسار التشغيلي للاستيراد، لكنه لا يغلق الاعتماد الرسمي: PR #96 ما يزال Draft/HOLD ولم يُستبدل بعقد رسمي أحدث.

### بنية المناهج — PASS_BASELINE / SECURITY HOLD

هيكل الصف/المسار/الفصل/المادة/الوحدة/الدرس ومكونات Golden Lesson مناسب للتحليل والتصميم. لكن `admin_curriculum_force_delete` ما تزال قدرة شديدة التدمير، Full-Admin-checked داخليًا لكنها قابلة للاستدعاء من `authenticated` وتستطيع حذف بيانات تعلم/أسئلة/نشر وتعطيل immutable triggers أثناء المعاملة. تبقى مانع Release Governance.

### الأدوار — TARGET_FROZEN / RUNTIME_PARTIAL

`academy.capability_grants` ما تزال فعليًا على `(user_id, capability)` دون scope مؤسسة/برنامج/دفعة. النموذج المستهدف يبقى:

`actor -> organization -> program -> cohort -> capability`

ولا يجوز اشتقاق أي Academy capability من Student `app_role` أو Student profile.

### الاشتراكات والاستحقاقات — TARGET_FROZEN / RUNTIME_NOT_READY

`academy.self_enroll(program_version_id)` ما يزال Runtime قائمًا، لذلك لا توجد طبقة Commerce/Contracts/Entitlements مستقلة تحكم الوصول التجاري.

### الأمان — PARTIAL IMPROVEMENT / GATE CLOSED

إصلاح `js-yaml` في PR #221 أزال blocker عالي الشدة من dependency audit، لكن بوابة الأمان لا تزال مغلقة بسبب force-delete وعدم اكتمال Scoped RBAC وEntitlements.

**النتيجة:** `ACADEMY_FULL_PROGRAMMING_GATE = CLOSED`.

## 2. Decision Log التجاري — ما يمكن تجميده الآن

### قرارات معتمدة تصميميًا

1. المنتج التجاري للأكاديمية مستقل عن أي اشتراك أو محفظة أو شهادة طالب.
2. الوصول المدفوع يعتمد على `Entitlement` صالح، لا على مجرد تسجيل الدخول.
3. `Enrollment` نتيجة Entitlement صالح وليس مصدرًا للاستحقاق.
4. المقعد المؤسسي لا يمنح صلاحية خارج المؤسسة/البرنامج/الدفعة المحددة.
5. انتهاء الاشتراك لا يلغي شهادة سبق إصدارها بصورة صحيحة؛ الإلغاء قرار مستقل ومدقق.
6. تغيير إصدار البرنامج لا يغير شهادة مرتبطة بإصدار قديم.
7. حالات الاستحقاق القياسية: `PENDING`, `ACTIVE`, `SUSPENDED`, `EXPIRED`, `REVOKED`.
8. حالات العقد القياسية: `DRAFT`, `ACTIVE`, `SUSPENDED`, `EXPIRED`, `TERMINATED`.

### قرارات مالك مؤجلة ولا تُخترع قيم لها

- السعر النهائي لكل برنامج أو باقة.
- مدة الاشتراك الفردي.
- سياسة الخصومات والكوبونات.
- هل يسمح بنقل المقعد المؤسسي بين المعلمين بعد بدء التعلم، وتحت أي ضوابط.
- نافذة السماح بعد انتهاء العقد إن وجدت.
- سياسة الاسترداد والإلغاء التجاري.

لا تمنع هذه البنود إكمال UX states والعقود المفاهيمية؛ تمنع فقط تثبيت قيم تجارية نهائية.

## 3. UX Acceptance Matrix

### Teacher Learner

- بدون Entitlement: يرى البرنامج والسبب، ولا يبدأ المحتوى المدفوع.
- `PENDING`: يرى حالة انتظار واضحة ولا يعتبر مسجلًا نهائيًا.
- `ACTIVE`: يمكنه بدء/متابعة البرنامج المحدد فقط.
- `SUSPENDED`: يمنع بدء نشاط جديد وتظهر جهة المراجعة دون كشف بيانات داخلية.
- `EXPIRED`: يحتفظ بسجل التعلم المسموح به وسياسة الشهادة، ولا يبدأ محتوى مدفوعًا جديدًا.
- `REVOKED`: وصول مرفوض برسالة واضحة دون كشف سبب حساس غير مخصص للمستخدم.

### Organization Admin

- يرى عقود ومقاعد مؤسسته فقط.
- لا يستطيع منح برنامج غير مشتَرى في العقد.
- `seat pool exhausted`: رفض صريح دون إنشاء Enrollment ناقص.
- `wrong organization`: deny-by-default.
- نقل/سحب المقعد لا يمنح أي Academy capability إدارية للمتعلم.

### Program/Cohort Roles

- Program Manager لا يرى برامج خارج نطاقه.
- Cohort Coordinator لا يرى دفعات خارج نطاقه.
- Instructor لا يمنح RBAC ولا يغير عقودًا أو استحقاقات.
- Certificate Officer لا يغير درجات أو Completion evidence.

### Dual Persona

- نفس `auth.users.id` مسموح.
- Teacher profile وStudent profile مستقلان منطقيًا.
- تبديل persona صريح.
- لا تستخدم Student navigation/data loaders في `/academy`.
- لا تستخدم Academy grants داخل StudentShell لمنح وظائف طالب أو إدارة محتوى الطالب.

## 4. شهادة المعلم — قبول UX

- `NOT_ELIGIBLE`: توضح المتطلبات الناقصة دون إنشاء شهادة.
- `ELIGIBLE`: جاهزة للإصدار وفق policy ولا تعد شهادة صادرة بعد.
- `ISSUED`: مثبتة على `program_version_id` ورمز تحقق مستقل.
- `REVOKED`: صفحة التحقق العامة تعرض أنها ملغاة دون كشف سبب داخلي حساس.

صفحة التحقق العامة تكشف الحد الأدنى: الحالة، اسم البرنامج، اسم حامل الشهادة بالقدر المعتمد، تاريخ الإصدار، ورمز الشهادة. لا تكشف البريد أو الهاتف أو الدرجات التفصيلية أو محاولات التقييم أو Student PII.

## 5. الاختبارات غير الإنتاجية المطلوبة لاحقًا

هذه قائمة قبول فقط وليست تنفيذ Backend الآن:

- negative matrix لكل دور ونطاق.
- persona isolation: student-only / teacher-only / dual-persona.
- entitlement lifecycle state transitions.
- contract/seat exhaustion and wrong-scope denials.
- certificate eligibility/version pinning/revocation/privacy.
- RTL/mobile/keyboard/focus لحالات النجاح والرفض.

## 6. شرط الانتقال إلى تنفيذ غير إنتاجي فعلي

لا يبدأ Schema/Backend non-prod جديد حتى تغلق البوابات المناسبة على الأقل: Scoped RBAC design acceptance، Entitlement contract acceptance، Security blocker retirement plan، ومع قرار واضح بأن MVP لا تعتمد على QB runtime قبل Cutover أو أن QB gate قد أُغلق.

## 7. قرار Stage 20I

- `QUESTION_BANK_RUNTIME_CUTOVER = HOLD`
- `IMPORT_CONTRACT = PASS_OPERATIONAL_STRONGER / HOLD_FORMAL`
- `CURRICULUM_STRUCTURE = PASS_BASELINE`
- `ACADEMY_SCOPED_RBAC = TARGET_FROZEN / RUNTIME_PARTIAL`
- `ACADEMY_ENTITLEMENTS = TARGET_FROZEN / RUNTIME_NOT_READY`
- `DEPENDENCY_HIGH_SEVERITY_BLOCKER = CLEARED_BY_PR_221`
- `SECURITY_RELEASE_GATE = HOLD`
- `ACADEMY_FULL_PROGRAMMING_GATE = CLOSED`
- `PRODUCTION_WRITE = NO`
- `MIGRATION_APPLY = NO`
- `DEPLOY = NO`

الجزء الآمن التالي عند بقاء البوابات مغلقة: تحويل هذه المصفوفة إلى سيناريوهات قبول مفصلة للرحلات الفردية والمؤسسية والشهادات، ببيانات Mock وتصميم فقط، دون Supabase أو دفع أو QB runtime.