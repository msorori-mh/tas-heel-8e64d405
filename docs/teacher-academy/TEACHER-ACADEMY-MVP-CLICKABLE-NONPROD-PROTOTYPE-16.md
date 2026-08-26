# أكاديمية معلم الثانوية — Stage 16: النموذج التفاعلي غير الإنتاجي

| الحقل | القيمة |
|---|---|
| المعرّف | `TEACHER_ACADEMY_MVP_CLICKABLE_NONPROD_PROTOTYPE_16` |
| الحالة | `PASS_NONPROD_UX_EXECUTION_ONLY` |
| الأساس | Stage 15 Non-Prod UX Prototype & Acceptance Pack |
| نوع العمل | Static Clickable UX / Mock Data / No Backend |
| Production / Migration / Deploy | **ممنوع** |
| Student DB / Student roles / Student wallet | **غير مستخدمة** |
| QB runtime integration | **DISABLED** |

## 1. مراجعة بوابات تطبيق طلاب الثانوية قبل البدء

تمت مراجعة أحدث حالة متاحة من المستودع قبل تنفيذ Stage 16.

```text
STUDENT_MAIN_HEAD=7ca6902b92498cc7b16bf2b37850f4bf8070b2a6
QUESTION_BANK_IMPORT_FOUNDATION=PASS_STRONG
QUESTION_BANK_FAIL_CLOSED_TIMEOUT=PASS
QUESTION_BANK_IMPORT_TESTS=438_PASS_IN_CORRECTION_79
QUESTION_BANK_FINAL_INDEPENDENT_RUNTIME_CLOSURE=NOT_PROVEN
IMPORT_TEMPLATE_SHEET_BINDING=PASS_STRONG
IMPORT_LESSON_IDENTITY_GUARDS=PASS_STRONG
IMPORT_CROSS_TEMPLATE_CONFLICT_GUARD=PASS_STRONG
LESSON_QUESTION_CAPABILITIES=BOTH_MANDATORY
SELF_TEST_FOUR_OPTIONS=ENFORCED
CURRICULUM_AND_LESSON_JOURNEY=PASS_STRONG_SOURCE
ACADEMY_PROGRAMMING_GATE=CLOSED
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED
```

### القرار

التغييرات الأحدث رفعت الثقة في **الاستيراد وبنك الأسئلة** بصورة واضحة، لكنها لا تشكل وحدها إثباتًا مستقلًا نهائيًا لـRuntime/Cutover. لذلك لا تبدأ Stage 16 أي Backend أو Schema أو Migration، وتتحرك فقط داخل UX غير الإنتاجي.

## 2. الجديد في تطبيق الطلاب وتأثيره على الأكاديمية

أحدث `main` يفرض الآن:

1. مكوّني الأسئلة معًا ضمن عقد الدرس.
2. أربعة خيارات في Self Test.
3. ربط كل Workbook بورقة البيانات canonical الخاصة به.
4. تطابق subject/lesson identity قبل النشر.
5. منع تعارض question codes بين القالبين الرسمي وSelf Test.

قرار الأكاديمية: **لا تعيد استخدام محررات أو صلاحيات بنك أسئلة الطالب**. عند فتح تكامل QB مستقبلًا سيكون الاستهلاك Read-only على Published Revision فقط.

## 3. ما تم تنفيذه في Stage 16

تم إنشاء نموذج HTML تفاعلي مستقل بالكامل في:

`docs/teacher-academy/prototypes/stage-16/index.html`

النموذج يستخدم Mock Data فقط ويعرض:

- Teacher Learner dashboard.
- Program Catalog وحالات entitlement.
- Cohort / Progress.
- Institutional contracts and seats.
- Certificates and verification UX.
- Support / audit UX.
- Role switcher لأغراض المراجعة البصرية فقط.

## 4. حدود الفصل الإلزامية

النموذج لا يحتوي على:

- أي اتصال Supabase/API.
- أي بيانات طالب حقيقية.
- أي `student app_role`.
- أي Wallet/Subscription من تطبيق الطالب.
- أي وظائف `qb_edit`, `qb_review`, `qb_publish`.
- أي Migration أو SQL.
- أي deploy config.

`auth.users` غير مستخدم في النموذج؛ ويمكن لاحقًا أن يكون هوية مشتركة فقط، وليس مصدر صلاحيات Academy.

## 5. Persona-to-screen acceptance

### Teacher Learner

يرى البرامج، entitlement، التسجيل، التقدم، الجلسات، التقييمات، والشهادات الخاصة به فقط.

### Trainer

الـprototype يسمح بمحاكاة الدور بصريًا، لكن أي تنفيذ لاحق يجب أن يكون scoped إلى Cohorts الممنوحة فقط، دون Commerce أو بيانات مؤسسات غير لازمة.

### Organization Manager

يرى contract/seats/usage ضمن مؤسسة واحدة فقط. لا يرى Progress فرديًا خارج الغرض التشغيلي المعتمد.

### Certificate Officer

يرى Completion Evidence والشهادة فقط ضمن نطاقه، ولا يملك Catalog/Contract/QB editing.

### Support

يرى Support case minimal data، وأي elevated access يجب أن يكون مؤقتًا ومبررًا ومؤرشفًا وفق Stage 14.

## 6. حالات UX الحرجة التي يغطيها النموذج

- `AVAILABLE`
- `ENTITLED`
- `ENROLLED`
- `EXPIRED`
- `SOLD_OUT`
- `NOT_ELIGIBLE`
- Contract `ACTIVE`
- Seat pool `FULL`
- Certificate `READY_TO_ISSUE`
- Support case `OPEN`

## 7. بوابة البرمجة بعد Stage 16

لا تفتح البرمجة الكاملة حتى يتحقق مجتمعة:

```text
QUESTION_BANK_FINAL_INDEPENDENT_RUNTIME_CLOSURE=PASS
IMPORT_LIFECYCLE_FINAL_INDEPENDENT_GATE=PASS
ZERO_CRITICAL_SECURITY_BLOCKERS=PASS
ACADEMY_ROLE_CAPABILITY_MODEL=FROZEN
ACADEMY_COMMERCE_CERTIFICATE_BOUNDARY=FROZEN
STUDENT_DATA_ISOLATION=PASS
```

## 8. الجزء التالي الآمن إذا بقيت البوابة مغلقة

`TEACHER_ACADEMY_STAGE_17_NONPROD_USABILITY_AND_ACCESSIBILITY_ACCEPTANCE`

نطاقه فقط:

- اختبار responsive/RTL على النموذج.
- Keyboard navigation.
- Focus states.
- Screen-reader labels.
- Role-based denial-state mock screens.
- Contract/entitlement/certificate edge-case UX.
- لا Backend ولا DB ولا Migration ولا Production.

## 9. الحكم

```text
STAGE_16=STARTED_AND_PROTOTYPE_CREATED
ACADEMY_PROGRAMMING_GATE=CLOSED
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED
PRODUCTION_WRITE=NO
MIGRATION=NO
DEPLOY=NO
NEXT_SAFE_STAGE=17_NONPROD_USABILITY_AND_ACCESSIBILITY_ACCEPTANCE
```
