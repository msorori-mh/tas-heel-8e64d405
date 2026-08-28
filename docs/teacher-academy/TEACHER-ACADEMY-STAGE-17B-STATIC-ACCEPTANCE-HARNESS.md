# أكاديمية معلم الثانوية — Stage 17B: Static Acceptance Harness

| الحقل | القيمة |
|---|---|
| المعرّف | `TEACHER_ACADEMY_STAGE_17B_STATIC_ACCEPTANCE_HARNESS` |
| الحالة | `STARTED_NONPROD_STATIC_ACCEPTANCE` |
| الأساس | Stage 17 usability/accessibility acceptance |
| الفرع | `docs/teacher-academy-stage-17-acceptance-harness` |
| Backend / DB / Migration / Production | **ممنوع** |
| QB runtime integration | **DISABLED** |

## 1. قرار البوابات في 28 أغسطس 2026

مراجعة أحدث `main` المتاح أظهرت:

```text
QUESTION_BANK_IMPORT_FOUNDATION=PASS_STRONG
QUESTION_BANK_FINAL_INDEPENDENT_RUNTIME_CLOSURE=NOT_PROVEN
IMPORT_CONTRACT_FOUNDATION=PASS_STRONG
IMPORT_LIFECYCLE_FINAL_INDEPENDENT_GATE=NOT_PROVEN
CURRICULUM_AND_LESSON_STRUCTURE=PASS_STRONG_SOURCE
ACADEMY_ROLE_CAPABILITY_MODEL=FROZEN_DESIGN
ACADEMY_COMMERCE_CERTIFICATE_BOUNDARY=FROZEN_DESIGN
STUDENT_DATA_ISOLATION=PASS_DESIGN_AND_PROTOTYPE
CONTENT_V3_R4_SOURCE_SECURITY=PASS_STRONG
CONTENT_V3_PRODUCTION_R5_21H_APPLY=HOLD_PRODUCTION_PREFLIGHT
ACADEMY_PROGRAMMING_GATE=CLOSED
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED
```

السبب: Correction 79 يثبت fail-closed قويًا لبنك الأسئلة و438 اختبار استيراد، لكنه لا يحتوي إثبات الإغلاق المستقل النهائي للـRuntime/Cutover. كذلك أحدث Production R5/21H preflight توقف دون كتابة بسبب نقص صلاحيات المشغل وعدم القدرة على إثبات backup/PITR، مع READY rows قديمة بلا snapshot وretired capabilities ما زالت READY. لذلك لا يجوز فتح Backend الأكاديمية أو Schema الآن.

## 2. الجزء الجديد الذي بدأ

تمت إضافة harness غير إنتاجي مستقل:

`docs/teacher-academy/prototypes/stage-17/verify-static-acceptance.mjs`

هدفه تثبيت عقود Stage 17 القابلة للتحقق ساكنًا قبل الاختبار المتصفحي النهائي:

- RTL + viewport + mobile breakpoint.
- touch targets بحد أدنى 44px.
- `focus-visible`.
- skip link وfocus management.
- `aria-current`.
- keyboard arrow navigation.
- role selector label/description.
- semantic progress bars.
- table caption/header scope/scroll region.
- denial live region.
- role-based allow/deny matrix.
- commerce/entitlement/certificate mock states.
- عدم وجود استدعاءات `fetch/XMLHttpRequest/WebSocket/EventSource/axios`.
- عدم وجود تكامل Runtime مع Supabase أو student roles/wallet/PII أو QB editing capabilities.

## 3. أمر التشغيل المحلي

من جذر المستودع:

```powershell
node docs/teacher-academy/prototypes/stage-17/verify-static-acceptance.mjs
```

النتيجة المطلوبة:

```text
STAGE17_STATIC_ACCEPTANCE=PASS
BACKEND_NETWORK_CALLS=ZERO_BY_STATIC_CONTRACT
STUDENT_RUNTIME_INTEGRATION=ZERO_BY_STATIC_CONTRACT
BROWSER_RUNTIME_ACCEPTANCE=PENDING
```

## 4. ما لم يتم

لم يتم في هذه المرحلة:

- Backend.
- Supabase/API connection.
- DB schema.
- Migration.
- Production write.
- Deploy.
- QB runtime integration.
- استخدام بيانات طالب أو أدوار الطالب أو Wallet الطالب.

## 5. بوابة الإغلاق التالية

Stage 17 لا يصبح `PASS_NONPROD_ACCEPTANCE` حتى يتم تنفيذ اختبار متصفحي فعلي على:

```text
360x800
390x844
412x915
1280x900
```

ويثبت:

```text
RTL_RESPONSIVE=PASS
KEYBOARD_NAVIGATION=PASS
FOCUS_VISIBILITY=PASS
SCREEN_READER_SEMANTICS=PASS
ROLE_DENIAL_MOCKS=PASS
CONTRACT_ENTITLEMENT_CERT_EDGE_CASES=PASS
NO_BACKEND_NETWORK_CALLS=PASS
STUDENT_ISOLATION=PASS
```

إذا بقيت بوابة البرمجة مغلقة بعد ذلك، يستمر العمل فقط في UX/النطاق/الأدوار/العقود/الاشتراكات/الشهادات وخطة التنفيذ.

## الحكم الحالي

```text
STAGE_17B=STARTED_NONPROD_STATIC_ACCEPTANCE
ACADEMY_PROGRAMMING_GATE=CLOSED
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED
PRODUCTION_WRITE=NO
MIGRATION=NO
DEPLOY=NO
```
