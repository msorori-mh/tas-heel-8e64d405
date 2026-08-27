# أكاديمية معلم الثانوية — Stage 17: اعتماد قابلية الاستخدام والوصول غير الإنتاجي

| الحقل | القيمة |
|---|---|
| المعرّف | `TEACHER_ACADEMY_STAGE_17_NONPROD_USABILITY_AND_ACCESSIBILITY_ACCEPTANCE` |
| الحالة | `STARTED_NONPROD_ACCEPTANCE` |
| الأساس | Stage 16 clickable non-production prototype |
| نوع العمل | UX / Accessibility / Mock denial states only |
| Backend / DB / Migration / Production | **ممنوع** |
| Student data / student roles / student wallet | **غير مستخدمة** |
| QB runtime integration | **DISABLED** |

## 1. قرار البوابات قبل بدء Stage 17

تمت مراجعة أحدث حالة ظاهرة في مستودع تطبيق الطلاب قبل بدء هذه المرحلة.

```text
STUDENT_MAIN_RECENT_RELEASE_GATE=PASS_STRONG
MAIN_INDEPENDENT_COMPONENT_PUBLISHING_GUARDS=PASS_SOURCE_EVIDENCE
QUESTION_BANK_IMPORT_FOUNDATION=PASS_STRONG
QUESTION_BANK_FINAL_INDEPENDENT_RUNTIME_CLOSURE=NOT_PROVEN
IMPORT_LIFECYCLE_FINAL_INDEPENDENT_GATE=NOT_PROVEN
ACADEMY_ROLE_CAPABILITY_MODEL=FROZEN_DESIGN
ACADEMY_COMMERCE_CERTIFICATE_BOUNDARY=FROZEN_DESIGN
STUDENT_DATA_ISOLATION=PASS_DESIGN_AND_PROTOTYPE
ACADEMY_PROGRAMMING_GATE=CLOSED
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED
```

القرار: التحسينات الأخيرة في `main` رفعت الثقة في lint/audit/CI ونشر مكونات الدرس بشكل مستقل، لكنها لا تثبت وحدها الإغلاق المستقل النهائي لـQB Runtime/Cutover أو دورة حياة الاستيراد المطلوبة لفتح Backend الأكاديمية. لذلك تبدأ Stage 17 فقط داخل النموذج غير الإنتاجي.

## 2. مراجعة Stage 16 الساكنة

المراجعة الساكنة للنموذج السابق كشفت نقاط قبول UX/A11y واضحة:

- لا توجد `focus-visible` states صريحة.
- أزرار التنقل لا تحمل `aria-current`.
- شريطا التقدم بلا semantic `progressbar`.
- جدول العقود يحتاج region قابلة للتمرير أفقيًا على الشاشات الصغيرة.
- تغيير الدور لا يعرض denial states خاصة بالصلاحيات؛ كان مجرد role switch بصري.
- عنوان الشاشة لم يكن يستقبل focus بعد الانتقال.
- Label الدور لم يكن مربوطًا صراحةً بالـselect عبر `for`.
- لا يوجد keyboard arrow navigation داخل قائمة الأقسام.

هذه النقاط تخص النموذج فقط وليست عيوب Backend أو Production.

## 3. ما بدأ تنفيذه في Stage 17

تم تحديث النموذج غير الإنتاجي فقط لإضافة:

1. `:focus-visible` واضح للأزرار والـselect والتنقل.
2. `aria-current="page"` للقسم النشط.
3. `role="progressbar"` مع `aria-valuemin/max/now` للتقدم.
4. `label for="role"` وشرح Screen Reader لتغيير الدور التجريبي.
5. `caption` مخفي بصريًا لجدول العقود و`scope="col"` للعناوين.
6. `table-wrap` قابلة للتمرير أفقيًا ومعلّمة كـregion على الجوال.
7. Focus management: نقل التركيز إلى عنوان الشاشة بعد التنقل.
8. Arrow-key navigation داخل قائمة الأقسام.
9. Role-based denial-state mock بدل إظهار شاشة غير مسموحة بصريًا.
10. استمرار إظهار جميع الأقسام في النموذج حتى يستطيع المراجع اختبار حالات السماح والرفض صراحةً.

## 4. مصفوفة السماح التجريبية

هذه ليست صلاحيات حقيقية؛ هي فقط UX acceptance model.

| الدور | الأقسام المسموحة في النموذج |
|---|---|
| Teacher Learner | Home, Catalog, Cohort/Progress, Certificates, Support |
| Trainer | Home, Catalog, Cohort/Progress, Support |
| Organization Manager | Home, Commerce/Contracts, Support |
| Certificate Officer | Home, Certificates, Support |
| Support | Home, Support |

أي انتقال إلى قسم غير مسموح يعرض `حالة رفض تجريبية` ولا يحاول الوصول إلى بيانات أو API.

## 5. معايير القبول المطلوب إغلاقها

### Responsive / RTL

- عرض 360px بدون قص وظيفي.
- عرض 390px بدون قص وظيفي.
- عرض 412px بدون قص وظيفي.
- Desktop 1280px.
- RTL ثابت في العناوين والجداول والتنقل.
- الجدول الطويل يستخدم scroll region بدل تمديد الصفحة أفقياً.

### Keyboard

- الوصول لكل عنصر تفاعلي بالـTab.
- Focus indicator واضح.
- Enter/Space على أزرار التنقل.
- Arrow keys بين أزرار الأقسام.
- لا Keyboard Trap.

### Screen reader semantics

- Role selector له label ووصف.
- الشاشة النشطة تحمل `aria-current` في التنقل.
- Progress له قيمة واسم قابلان للقراءة.
- Table headers لها scope.
- Denial state معلنة عبر live region/status.

### Role denial UX

يجب إثبات mock denial لكل حالة على الأقل:

- Learner → Contracts = DENIED.
- Trainer → Certificates = DENIED.
- Organization Manager → Individual learner progress = DENIED.
- Certificate Officer → Contracts = DENIED.
- Support → Catalog/Cohort/Commerce/Certificates = DENIED.

### Commerce / entitlement / certificate edge cases

يبقى نطاق Stage 17 مرئيًا فقط عبر حالات Mock:

- `NOT_ELIGIBLE`
- `FULL`
- entitlement absent/expired
- contract active/full
- certificate ready/not ready
- support sensitive-access request

لا تنفذ هذه الحالات أي mutation أو API.

## 6. حدود الفصل الإلزامية

Stage 17 لا تضيف ولا تستخدم:

- Supabase client.
- API endpoints.
- `auth.users` runtime.
- `student app_role`.
- Student PII.
- Student wallet/subscriptions.
- Student certificates.
- `qb_edit`, `qb_review`, `qb_publish`.
- DB schema.
- SQL/Migration.
- Deployment configuration.

## 7. بوابة البرمجة الكاملة

تبقى مغلقة حتى تحقق جميع البنود معًا:

```text
QUESTION_BANK_FINAL_INDEPENDENT_RUNTIME_CLOSURE=PASS
IMPORT_LIFECYCLE_FINAL_INDEPENDENT_GATE=PASS
ZERO_CRITICAL_SECURITY_BLOCKERS=PASS
ACADEMY_ROLE_CAPABILITY_MODEL=FROZEN
ACADEMY_COMMERCE_CERTIFICATE_BOUNDARY=FROZEN
STUDENT_DATA_ISOLATION=PASS
```

## 8. بوابة إغلاق Stage 17

يمكن تحويل Stage 17 من STARTED إلى PASS_NONPROD_ACCEPTANCE فقط بعد تحقق عملي/متصفحي من:

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

## 9. الحكم الحالي

```text
STAGE_17=STARTED_NONPROD_ACCEPTANCE
ACADEMY_PROGRAMMING_GATE=CLOSED
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED
PRODUCTION_WRITE=NO
MIGRATION=NO
DEPLOY=NO
```

الجزء التالي بعد إغلاق Stage 17، إذا بقيت بوابة البرمجة مغلقة، يجب أن يظل تصميميًا/غير إنتاجي ويترك QB integration معطلاً.
