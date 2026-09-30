# Stage 20T — Training Program Curriculum Blueprint

الحالة: **تحليل وتصميم غير إنتاجي فقط**.

المرجع عند البدء: `main@849fbb198ba087a0453d2a73caccb8c66d4a44f0` بتاريخ 2026-09-22.

## 1. قرار البوابة

بوابة البرمجة الكاملة لأكاديمية معلم الثانوية تبقى مغلقة.

### Question Bank

- PR #58 ما يزال `Open + Draft`.
- Runtime الافتراضي ما يزال `LEGACY` دون formal cutover معتمد.
- لذلك لا يُستخدم Question Bank runtime كاعتماد للأكاديمية بعد.

### Import Contract V2

- PR #96 ما يزال `Open + Draft/HOLD`.
- دمج PR #295 أصلح عقد نشر التجارب المحلية وأعاد CSP إلى runtime wrapper المركزي مع PG17/static guards.
- هذا يحسن دليل CF11 جزئيًا، لكنه لا يحقق formal PASS لعقد V2 لأن PR #96 نفسه لم يعتمد ولم تغلق كل شروطه المعلنة.

### Roles / Subscriptions / Entitlements

- الفصل البنيوي بين Student وTeacher موجود كأساس جيد.
- Scoped RBAC الكامل ما يزال غير مكتمل في runtime.
- دورة `Contract → Entitlement → Enrollment` لم تستبدل `self_enroll` كعقد تجاري نهائي.

### Security

- `admin_curriculum_force_delete` ما تزال `SECURITY DEFINER` وممنوحة لـ`authenticated` مع فحص Full Admin داخل الدالة.
- لأنها قادرة على حذف نشاط تعلم وأسئلة وسجلات نشر وتعطيل immutable triggers مؤقتًا، تبقى Release-governance blocker حتى التقييد أو التقاعد بمسار break-glass مضبوط ومختبر.

النتيجة:

```text
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
PAYMENT_INTEGRATION=NO
QB_RUNTIME_INTEGRATION=NO
STUDENT_APP_CHANGE=NO
```

## 2. غرض Stage 20T

الانتقال من وصف عام لمحفظة برامج الأكاديمية إلى **Blueprint تدريبي قابل للتحويل لاحقًا إلى Program Versions وstoryboards وmock content** دون لمس runtime أو قاعدة البيانات.

هذه المرحلة لا تحدد أسعارًا، مدة اشتراك، refund policy، grace period، أو اعتمادًا مهنيًا رسميًا.

## 3. معمارية محفظة الـMVP

### المسار A — البرنامج التأسيسي المشترك

اسم عمل داخلي: **أساسيات التميز في تدريس المرحلة الثانوية**.

الجمهور: جميع معلمي المرحلة الثانوية بغض النظر عن المادة.

الوحدات:

1. **هوية المعلم المهنية واستخدام الأكاديمية**
   - فصل Teacher Persona عن Student Persona.
   - بناء الملف المهني.
   - فهم سجل التعلم والشهادات.

2. **التخطيط للحصة ومخرجات التعلم**
   - صياغة مخرجات قابلة للقياس.
   - ربط الحصة بالمنهج.
   - تخطيط أنشطة مناسبة للزمن المتاح.

3. **التقويم التشخيصي والتكويني والختامي**
   - متى يستخدم كل نوع.
   - بناء دليل تعلم قصير داخل الحصة.
   - قراءة نتائج الطلاب لاتخاذ قرار تدريسي.

4. **معالجة التعثر والفروق الفردية**
   - اكتشاف الأخطاء الشائعة.
   - التدخل العلاجي.
   - التفريق في النشاط والتكليف دون خفض المخرجات.

5. **التدريس الرقمي والذكاء الاصطناعي المسؤول**
   - استخدام أدوات رقمية داعمة.
   - التحقق من المحتوى المولد آليًا.
   - حماية بيانات الطلاب وحقوق المحتوى.

6. **النزاهة الأكاديمية وحقوق المحتوى**
   - الملكية الفكرية.
   - الاستخدام المسموح للمحتوى التعليمي.
   - إدارة المواد التي ينشئها المعلم داخل الأكاديمية.

### المسار B — البرامج التخصصية حسب المادة

يُنشأ Program مستقل لكل مادة مدعومة، بنفس الهيكل العام ولكن بمحتوى تخصصي.

قالب البرنامج:

1. خريطة المنهج ومخرجاته الرئيسية.
2. المفاهيم عالية الصعوبة والأخطاء الشائعة.
3. استراتيجيات شرح المفاهيم المجردة أو المركبة.
4. أمثلة صفية وتمارين متدرجة.
5. تصميم تقويمات قصيرة وأسئلة موضوعية/مقالية مناسبة للمادة.
6. تحليل أخطاء الطلاب وبناء تدخلات علاجية.
7. استخدام التجارب/المحاكاة/الخرائط الذهنية عندما تكون مناسبة للمادة.
8. تقييم ختامي للبرنامج.

### المسار C — برامج تخصصية قصيرة مؤجلة عن MVP الأول

تبقى في backlog التصميمي ولا تدخل أول إصدار إلا بقرار مستقل:

- بناء الاختبارات وتحليل جودتها.
- إدارة الصف والتحفيز.
- مهارات الإرشاد الأكاديمي للطلاب.
- قيادة الفرق التعليمية ورؤساء المواد.
- تصميم محتوى رقمي متقدم.

## 4. عقد Program Version

كل برنامج تدريبي يجب أن يمتلك Version ثابتة بعد النشر.

```text
Program
  → Program Version
      → Modules
          → Learning Units
          → Activities
          → Assessments
      → Completion Rules
      → Certificate Template Reference
```

القواعد:

- تعديل برنامج منشور لا يعيد كتابة Version بدأها المعلم.
- أي تغيير جوهري في المحتوى أو التقييم ينشئ Version جديدة.
- Enrollment يثبت Version محددة.
- Certificate تشير إلى Version محددة.
- لا يسمح بإصدار شهادة من Draft Version.

## 5. نموذج Learning Unit غير الإنتاجي

كل وحدة تعلم مستقبلية يجب أن توثق على الأقل:

- `title`
- `learning_outcomes[]`
- `content_blocks[]`
- `practice_activity`
- `reflection_or_application`
- `assessment_requirement`
- `completion_rule`
- `estimated_effort` كقيمة تحريرية غير تجارية

لا يُحوّل هذا النموذج إلى schema أو migration في Stage 20T.

## 6. تقييم المعلم

تقييمات الأكاديمية مستقلة عن تقييمات الطالب.

### الأنواع المستهدفة

- Knowledge check قصير داخل الوحدة.
- Applied task / reflection عند الحاجة.
- Final assessment على مستوى البرنامج.

### ضوابط التصميم

- نتيجة معلم لا تظهر في Student progress.
- Student subscription لا يمنح Teacher assessment access.
- Teacher assessment history يبقى داخل Teacher workspace.
- أي تكامل مستقبلي مع Question Bank ينتظر formal QB gate المناسب.
- حد النجاح الرقمي لا يُثبت هنا؛ يحتاج قرارًا تدريبيًا/حوكميًا مستقلًا.

## 7. الشهادة

الاسم الافتراضي الآمن:

**شهادة إتمام برنامج تدريبي**

شروط الأهلية التصميمية:

1. Enrollment صحيح على Program Version منشورة.
2. إكمال الوحدات المطلوبة.
3. اجتياز التقييم المطلوب عند وجوده.
4. عدم وجود مانع policy يمنع الإصدار.
5. Certificate ID فريد.
6. ربط الشهادة بالمعلم والـProgram Version.

لا تستخدم عبارة «معتمدة» أو «اعتماد مهني» قبل وجود اعتماد رسمي موثق.

## 8. تجربة الاستخدام المستهدفة للمعلم

```text
Teacher Workspace
  → Academy Home
  → Training Catalog
  → Program Details
  → Access Status
  → Enrollment
  → Learning Workspace
  → Progress
  → Final Assessment
  → Completion
  → Certificate
```

### Dual Persona

إذا كان المستخدم طالبًا ومعلمًا معًا:

- يظهر اختيار واضح لمساحة العمل.
- لا تنتقل صلاحيات أو اشتراكات أو تقدم بين المساحتين.
- العودة إلى Student app لا تحفظ Academy capability كـStudent capability.

## 9. الأدوار المرتبطة بالمحتوى التدريبي

### Teacher Learner

- يقرأ البرامج المسموح بها.
- يتعلم ويتقدم ويؤدي التقييمات.
- يرى شهاداته فقط.

### Academy Content Manager

- يعد Draft programs وDraft versions ضمن scope محدد.
- لا يمنح نفسه entitlement.
- لا يصدر شهادة لنفسه بسبب صلاحية التحرير.

### Academy Reviewer / Approver

- يراجع version قبل النشر.
- لا يغير نطاقه بنفسه.

### Organization Manager

- يدير المقاعد ضمن مؤسسته فقط.
- لا يغير محتوى البرنامج.
- لا يطلع على تفاصيل معلمين خارج scope المؤسسة.

### Academy Admin

- يملك control-plane capability صريحة ومدققة.
- صلاحية الإدارة لا تعني Enrollment تلقائيًا.

## 10. Storyboard Pack المطلوب لاحقًا

الجزء الآمن التالي بعد Stage 20T، ما دامت بوابات البرمجة مغلقة، هو إعداد Storyboards/UX contracts فقط للشاشات التالية:

1. Academy Home.
2. Training Catalog.
3. Program Details.
4. Access/Entitlement state.
5. Learning Workspace.
6. Progress.
7. Assessment readiness/result state.
8. Certificates list/detail.
9. Organization seats dashboard.
10. Dual Persona switch.

كلها تبقى Design/Mock فقط دون Network أو Supabase أو Payment.

## 11. Acceptance criteria لمرحلة التصميم

يُعتبر Stage 20T مكتملًا تصميميًا عندما يكون لكل برنامج MVP:

- جمهور مستهدف واضح.
- Learning outcomes موثقة.
- وحدات مرتبة.
- Completion contract موثق.
- Assessment contract موثق.
- Certificate eligibility موثقة.
- Persona/RBAC boundaries موثقة.
- لا اعتماد على Student role/subscription/progress.
- لا افتراضات تجارية غير معتمدة.

## 12. أثر PR #295 على البوابات

PR #295 يمثل تحسنًا مهمًا في استقرار نشر التجارب المحلية لأنه أعاد فرض CSP في runtime wrapper بدل مطالبة HTML المرفوع بتضمين السياسة داخله، وأبقى القيود الخطرة fail-closed مع transactional proof وPG17 rehearsal.

لكن القرار الحاكم يبقى:

- **CF11 evidence: improved**.
- **Import Contract V2 formal gate: HOLD** حتى اعتماد PR #96 وإغلاق شروطه كاملة.
- لا ينتج عن PR #295 وحده أي سماح ببدء staging integration للأكاديمية.

## 13. المسار المسموح بعد هذه المرحلة

طالما البوابات الحالية لم تتغير، يسمح فقط بـ:

- Storyboards.
- UX state contracts.
- Program content outlines.
- Role/permission matrices.
- Subscription/entitlement policy design.
- Certificate policy design.
- Mock data specifications.
- Test vectors غير المتصلة بالشبكة.

ويظل ممنوعًا:

- Production writes.
- Migration apply.
- Deploy.
- Payment integration.
- Question Bank runtime integration.
- Production schema/RLS/RPC changes.
- أي تغيير في Student app من أجل الأكاديمية.
