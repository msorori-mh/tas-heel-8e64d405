# أكاديمية معلم الثانوية — نموذج التهديدات قبل تصميم الـSchema (Stage 09)

| الحقل | القيمة |
|---|---|
| المعرّف | `TEACHER-ACADEMY-THREAT-MODEL-09` |
| الحالة | `DESIGN_ONLY — PRE_SCHEMA_GATE` |
| النطاق | أكاديمية المعلمين فقط، مع Backend مشترك على مستوى الهوية لا على مستوى الأدوار أو البيانات |
| كتابة Production | ممنوعة |
| Migration / DDL | ممنوع |
| Deploy / Publish | ممنوع |

## 1. قرار البوابة

الحالة الحالية تسمح بإغلاق **Stage 09 — Threat Model** فقط، ولا تسمح بالانتقال إلى Stage 10 (Schema) بعد.

```text
QUESTION_BANK_IMPORT_FOUNDATION=PASS
QUESTION_BANK_RUNTIME_CUTOVER=NOT_CLOSED
IMPORT_CONTRACT=CONTRACT_CLOSED
IMPORT_EXECUTE_RUNTIME=NOT_REQUIRED_FOR_THIS_STAGE
ACADEMY_CANONICAL_ARCHITECTURE=PASS_DESIGN_FROZEN
ACADEMY_ROLES_CAPABILITIES=PASS_DESIGN_FROZEN
ACADEMY_COMMERCE_BOUNDARY=PASS_DESIGN_FROZEN
STUDENT_CONTENT_SECURITY=PASS_CURRENT_RELEASE_CANDIDATE
ACADEMY_SCHEMA_GATE=CLOSED
```

السبب الحاسم: بنك الأسئلة صار مستقراً كعقد/استيراد Fail-Closed، لكن مسار backfill/cutover التشغيلي ما زال غير مغلق؛ لذلك يبقى أي تكامل للأكاديمية مع QB **Disabled by default** ولا يبدأ Schema خاصاً به الآن.

## 2. الأصول الحساسة

1. هوية المعلم المهنية `teacher_profiles`.
2. الانتماءات والتخصصات المهنية.
3. صلاحيات `academy_capability_grants` ونطاقاتها.
4. برامج الأكاديمية وإصداراتها ودفعاتها.
5. التقدم والتقييمات ومحاولات المتعلم.
6. الاستحقاقات التجارية والمقاعد المؤسسية.
7. الشهادات وأحداث الإصدار/الإبطال.
8. سجلات الوصول الإداري الطارئ.
9. المراجع Read-only إلى محتوى الطالب المنشور.
10. أي Published Revision من بنك الأسئلة عند تفعيل التكامل مستقبلاً.

## 3. حدود الثقة

### 3.1 Auth Boundary
- يسمح بمشاركة `auth.users` كهوية حساب فقط.
- يمنع اشتقاق صلاحيات الأكاديمية مباشرة من `student app_role`.
- لا يمنح تسجيل الدخول في تطبيق الطالب أي Capability في الأكاديمية تلقائياً.

### 3.2 Student Data Boundary
- الأكاديمية لا تملك SELECT عاماً على `profiles` أو بيانات الطلاب الشخصية.
- أي تكامل تعليمي مع محتوى الطالب يكون على Published/Versioned content فقط.
- لا FK حذف متسلسل من Student Content إلى Academy Progress/Certificates/Entitlements.

### 3.3 Question Bank Boundary
- التكامل الافتراضي: `DISABLED`.
- عند التفعيل لاحقاً: Read-only على Published Revision مثبتة بالهوية/hash.
- ممنوع منح `qb_edit`, `qb_review`, `qb_publish` نتيجة لدور تدريبي أو إكمال دورة.

### 3.4 Commerce Boundary
- يمنع استخدام جداول `subscriptions` أو `wallets` الخاصة بالطلاب.
- الوصول يأتي من `products/orders/contracts/entitlements` الخاصة بالأكاديمية.
- المقاعد المؤسسية تأتي من عقد + عضوية زمنية + سياسة تخصيص.

## 4. مصفوفة التهديدات الرئيسية

| التهديد | الشدة | الضابط المطلوب قبل Stage 10 |
|---|---:|---|
| Privilege escalation عبر `app_role` | Critical | Capability grants مستقلة ومقيدة بالنطاق + deny by default |
| وصول معلم إلى PII طلاب | Critical | RLS صريح + عدم وجود grant عام + اختبارات سلبية |
| Admin bypass شامل | Critical | لا bypass دائم؛ Emergency Access مؤقت ومسبب ومدقق |
| تسريب إجابات QB قبل reveal | Critical | Published revision read-only + server-side reveal + zero client answer keys |
| تعديل محتوى منشور بصمت | High | Revision pinning + immutable published version |
| حذف مصدر طلابي يؤدي لفقد تقدم/شهادة | High | soft deprecation + stable reference + no cascade |
| تزوير شهادة | High | immutable issue event + verification token/QR + audit trail |
| تضخيم/سرقة entitlement | High | server-controlled entitlement issuance + idempotency + audit |
| تجاوز حدود المؤسسة | High | organization-scoped capability + temporal membership checks |
| replay لعملية حساسة | High | nonce/idempotency + bounded token lifetime + audit |
| Offline stale authorization | High | offline read cache only للبيانات العامة؛ كل mutation الحساسة تحتاج online revalidation |
| Tampering في محتوى تدريبي محلي | Medium | hash-pinned assets + signed/verified manifests |
| Enumeration للمعلمين/المؤسسات | Medium | bounded search + RLS + no public directory by default |

## 5. ضوابط إلزامية قبل Schema

يجب أن يثبت Stage 10 لاحقاً الآتي قبل أي Migration:

1. كل جدول Academy يملك مالك بيانات واضحاً وسياسة lifecycle واضحة.
2. كل Capability لها Scope واحد على الأقل ولا توجد صلاحية شاملة مبهمة.
3. كل علاقة مع Student Content تكون reference ثابتة غير قابلة للحذف المتسلسل.
4. كل علاقة مع QB تبقى feature-flagged وdisabled حتى إغلاق runtime cutover.
5. `teacher_profiles` منفصلة عن `profiles` الطلابية.
6. لا policy تحتوي `USING (true)` لبيانات أكاديمية حساسة.
7. لا `service_role` في Client.
8. لا اعتماد على Wallet/Subscription الطالب.
9. إصدار الشهادة يحتاج completion evidence + program_version ثابتة + entitlement صالح.
10. كل إجراء حساس يكتب Audit Event غير قابل للتعديل من نفس صاحب الإجراء.

## 6. سيناريوهات أمنية يجب أن تفشل

- طالب يحاول استدعاء endpoint معلم.
- معلم من مؤسسة A يقرأ مقاعد أو أعضاء مؤسسة B.
- Mentor يحاول `certificate.issue` خارج cohort الممنوحة.
- Content manager في تطبيق الطالب يحاول تعديل Academy Program.
- Academy admin يحاول قراءة PII طالب دون Emergency Access مؤقت.
- إكمال دورة تدريبية يحاول إنشاء grant لنشر سؤال.
- انتهاء عضوية المؤسسة مع بقاء entitlement غير صالح.
- حذف/استبدال درس طالب منشور يحذف progress أو certificate للأكاديمية.
- Client يطلب correct answer من QB قبل reveal.
- Offline client يرسل mutation بعد انتهاء grant دون إعادة تحقق online.

## 7. معايير الخروج من Stage 09

يصبح `THREAT_MODEL_STAGE_09=PASS` عندما:

- لا يوجد Threat من نوع Critical بدون Control محدد.
- حدود Auth / Student / QB / Commerce موثقة وغير متعارضة.
- Capability model هو المصدر الوحيد للتفويض في الأكاديمية.
- Emergency Access هو الاستثناء الوحيد للوصول الإداري الاستثنائي، ومؤقت ومدقق.
- QB integration remains disabled until its operational cutover gate is closed.

بعد ذلك فقط يسمح ببدء **Stage 10 — Schema Design (source/design only)**، وليس Migration أو Production Apply.

## 8. القرار الحالي

```text
THREAT_MODEL_STAGE_09=PASS_DESIGN
ACADEMY_PROGRAMMING_GATE=PARTIAL_NOT_OPEN
ACADEMY_SCHEMA_STAGE_10=HOLD_QB_RUNTIME_CUTOVER
PRODUCTION_WRITE=NO
MIGRATION=NO
DEPLOY=NO
```
