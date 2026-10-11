# رؤية ونطاق أكاديمية المعلمين (Teacher Academy Vision & Scope)

| حقل الوثيقة | القيمة |
|---|---|
| معرّف الوثيقة | TEACHER-ACADEMY-VISION-AND-SCOPE-01 |
| التاريخ | 2026-08-03 |
| الحالة | **DRAFT — CANONICAL BLUEPRINT UPDATE 05** |
| النطاق | الرؤية والنطاق والحوكمة ونموذج القرارات الـ 21 وتتبع القرارات الـ 64 |

---

## 1. الرؤية التنفيذية واستراتيجية النظام

أكاديمية المعلمين هي منصة للتطوير والتأهيل المهني للمعلمين، تعمل بنظام معماري مستقّل معتمدةً على نظام المصادقة الموحد (`auth.users`)، ودون التعديل أو المساس بجدول أدوار الطلاب (`app_role`) أو المحافظ المالية للطلاب.

### المبادئ الأساسية:
1. **عزل الحسابات والصلاحيات (S2):** عدم إضافة أي دور للمعلمين داخل `app_role`، واعتماد منح الصلاحيات المؤطرة حصراً عبر `academy_capability_grants` مع Scopes محددة.
2. **حظر Bypass الإداري الشامل (S3):** إلغاء أي صلاحيات تجاوز كلي للـ Platform Admin أو `ta_admin`، وتفعيل بروتوكول الوصول الإداري الطارئ المؤقت والمسبب والمؤرخ وسجل التدقيق `emergency_access_audit_logs`.
3. **التكامل غير المتصل (Offline Strategy):** تقسيم العمل غير المتصل حسب المراحل:
   - **MVP:** دعم App Shell والكتالوج والمحتوى النصي و Progress Outbox بمزامنة Last-write-wins.
   - **P1:** دعم الأنشطة والتقييمات و Evidence Outbox وحل التعارضات والمزامنة ثنائية الاتجاه.
   - **P2:** دعم تنزيل الفيديو المشفر Offline والتحزيم الأصيل Native Packaging.

---

## 2. التسلسل الهرمي التعليمي المعرف (S1 Domain Model)

تعتمد الأكاديمية التسلسل الهرمي القياسي المحدد في S1:
```
academy_programs -> academy_program_versions -> academy_courses -> academy_modules -> academy_lessons -> academy_cohorts
```

> **ملاحظة إزالة:** تم الاستغناء الكلي عن التاكسونومي القديم (`ta_paths` و `ta_modules` و `ta_lessons`) واستبداله بالنموذج القياسي المعتمد أعلاه.

---

## 3. حدود الكيانات المتداخلة (Entity Boundaries)

### 3.1 حدود العضويات المؤسسية:
- **`organization_memberships`:** هي المصدر القانوني الموحد للعضوية العامة في المؤسسة، وتحتوي على: (`person_id`, `organization_id`, `membership_type`, `start_date`, `end_date`, `status`, `scope`).
- **`teacher_organization_memberships`:** امتداد مهني خاص بالمعلم مرتبط بـ `organization_membership_id`، ويحمل فقط البيانات المهنية مثل (`teacher_role`, `verified_subject_assignment`, `academic_position`, `verification_metadata`) دون تكرار حقول العضوية الأساسية.

### 3.2 حدود العقود التجارية:
- **`contracts`:** السجل التجاري القانوني الأساسي للعقد بين الطرفين، ويشمل: (`contract_number`, `parties`, `product`, `dates`, `financial_terms`, `status`).
- **`organization_contracts`:** ربط أو امتداد مؤسسي للعقد مرتبط بـ `contract_id` و `organization_id`، ويحمل: (`organizational_scope`, `seat_allocation_policy`, `beneficiary_hierarchy`, `organization_sla`).

---

## 4. نموذج القرارات الـ 21 القانوني (Canonical 21 Decisions Model)

تم إلغاء الصيغة السابقة غير المكتملة (`S1–S7 + AD1–AD4 + OD-1–OD-10`) واستبدالها بالقائمة القانونية المعتمدة التالية (21 قراراً):

### 4.1 APPROVED_OWNER_DECISIONS (7 قرارات معتمدة)
- **S1:** Canonical educational domain model (`academy_programs` -> `academy_cohorts`) — **APPROVED**
- **S2:** Capability grants and scoped assignments (`academy_capability_grants`) — **APPROVED**
- **S3:** No blanket admin bypass & emergency access (`emergency_access_audit_logs`) — **APPROVED**
- **S4:** Organizations, memberships, contracts and seats (`organizations`, `organization_memberships`, `contracts`, `contract_seats`) — **APPROVED**
- **S5:** Independent academy certificates (`academy_certificates`, `academy_certificate_events`, `professional_hours_ledger`) — **APPROVED**
- **S6:** Products, orders, entitlements, invoices and contracts (`products`, `orders`, `entitlements`, `invoices`, `contracts`) — **APPROVED**
- **S7:** Shared Auth with isolated teacher professional profile (`auth.users` + `teacher_profiles`) — **APPROVED**

### 4.2 MUST_DECIDE_BEFORE_RUNTIME (7 قرارات تتطلب حسم المالك قبل التشغيل)
- **R1:** Completion and passing policy — **NEEDS_OWNER_DECISION**
- **R2:** Assessment and offline integrity — **NEEDS_OWNER_DECISION**
- **R3:** Submission, review, SLA and appeals policy — **NEEDS_OWNER_DECISION**
- **R4:** Certificate authority and issuance policy — **NEEDS_OWNER_DECISION**
- **R5:** Institutional visibility and privacy policy — **NEEDS_OWNER_DECISION**
- **R6:** Frontend deployment and session model — **NEEDS_OWNER_DECISION**
- **R7:** Shared integrations: QB, notifications and analytics — **NEEDS_OWNER_DECISION**

### 4.3 MAY_DEFER_TO_P1 (3 قرارات مؤجلة لمرحلة P1)
- **P1-1:** Native packaging and adoption triggers — **DEFERRED_TO_P1**
- **P1-2:** Internationalization and content expansion — **DEFERRED_TO_P1**
- **P1-3:** Advanced credentials, AI and interoperability — **DEFERRED_TO_P1**

### 4.4 BUSINESS_DECISIONS (4 قرارات تجارية واستثمارية)
- **B1:** Commercial packaging and pricing — **NEEDS_OWNER_DECISION**
- **B2:** Institutional contract policy — **NEEDS_OWNER_DECISION**
- **B3:** Finance, tax, invoices and retention — **NEEDS_OWNER_DECISION**
- **B4:** Trainer compensation and accreditation economics — **NEEDS_OWNER_DECISION**

---

## 5. مصفوفة تتبع القرارات الـ 64 (Traceability Matrix DEC-01 .. DEC-64)

توضح المصفوفة التالية ربط كافة القرارات التاريخية الـ 64 بالقرارات الـ 21 المعتمدة:

| Original ID | Original Subject | Canonical Decision ID | Canonical Category | Status | Resolution | Blocking Phase | Source Document |
|---|---|---|---|---|---|---|---|
| DEC-01 | النماذج التعليمية الخمسة السابقة | S1 | APPROVED_OWNER_DECISIONS | APPROVED | توحيد التسلسل الهرمي التعليمي المعرف S1 | Design | Vision & Scope |
| DEC-02 | حوكمة الصلاحيات وإلغاء enum المعلمين | S2 | APPROVED_OWNER_DECISIONS | APPROVED | اعتماد Capability Grants ومنع توسيع app_role | Design | Vision & Scope |
| DEC-03 | حظر Admin Bypass الشامل والوصول الطارئ | S3 | APPROVED_OWNER_DECISIONS | APPROVED | إلغاء التجاوز الإداري الشامل وتفعيل Emergency Access | Design | Vision & Scope |
| DEC-04 | نمذجة المؤسسات والعقود والمقاعد | S4 | APPROVED_OWNER_DECISIONS | APPROVED | نمذجة المؤسسات والعضويات والعقود والمقاعد | Design | Vision & Scope |
| DEC-05 | الشهادات المستقلة وسجل الساعات | S5 | APPROVED_OWNER_DECISIONS | APPROVED | عزل شهادات المعلمين وسجل الساعات المهنية | Design | Vision & Scope |
| DEC-06 | نموذج التجارة والمنتجات والاستحقاقات | S6 | APPROVED_OWNER_DECISIONS | APPROVED | بناء محرك التجارة والاستحقاقات المستقل | Design | Vision & Scope |
| DEC-07 | حساب المعلم وخصوصية بيانات الطلاب | S7 | APPROVED_OWNER_DECISIONS | APPROVED | اعتماد Auth المشترك وعزل ملف المعلم المهني | Design | Vision & Scope |
| DEC-08 | تفكيك واجهة الطلاب عن المعلمين ونماذج الجلسات | R6 | MUST_DECIDE_BEFORE_RUNTIME | NEEDS_OWNER_DECISION | تفكيك تطبيق المعلمين كـ PWA مستقل مع نموذج جلسات خاص | Runtime | Vision & Scope |
| DEC-09 | توحيد Backend والتكاملات المشتركة | R7 | MUST_DECIDE_BEFORE_RUNTIME | NEEDS_OWNER_DECISION | توحيد الخدمات الخلفية والتكامل مع الخدمات العامة | Runtime | Vision & Scope |
| DEC-10 | استقلال صلاحيات بنك الأسئلة والتكامل | R7 | MUST_DECIDE_BEFORE_RUNTIME | NEEDS_OWNER_DECISION | عزل نطاق QB وتوفير واجهات تكامل مؤمنة | Runtime | Vision & Scope |
| DEC-11 | تحزيم التطبيق الأصيل وترقيات الواجهة | P1-1 | MAY_DEFER_TO_P1 | DEFERRED_TO_P1 | تأجيل التحزيم الأصيل PWA-to-Native إلى P1 | P1 | Vision & Scope |
| DEC-12 | سياسة النماذج التجارية والتسعير والحزم | B1 | BUSINESS_DECISIONS | NEEDS_OWNER_DECISION | تحديد سياسات التسعير والحزم التجارية B2B/B2C | Business | Vision & Scope |
| DEC-13 | الاعتماد المهني الخارجي واقتصاديات الاعتماد | B4 | BUSINESS_DECISIONS | NEEDS_OWNER_DECISION | تحديد مكافآت المدربين واقتصاديات الاعتماد | Business | Vision & Scope |
| DEC-14 | الفوترة والضرائب ومزودي الخدمات المالية | B3 | BUSINESS_DECISIONS | NEEDS_OWNER_DECISION | تحديد سياسات الضرائب والفوترة والاحتفاظ المالي | Business | Vision & Scope |
| DEC-15 | سياسات الاتصال الخارجي وسجل الاستبقاء | B3 | BUSINESS_DECISIONS | NEEDS_OWNER_DECISION | واعتماد سياسة الاحتفاظ بالبيانات والاتصالات | Business | Vision & Scope |
| DEC-16 | نمذجة المسار التعليمي (programs->cohorts) | S1 | APPROVED_OWNER_DECISIONS | APPROVED | اعتماد الهيكل التعليمي الموحد S1 | Design | Product Requirements |
| DEC-17 | هيكل البرامج وإصداراتها (program_versions) | S1 | APPROVED_OWNER_DECISIONS | APPROVED | إضافة كيان إصدارات البرامج التدريبية | Design | Product Requirements |
| DEC-18 | تقسيم المقررات والوحدات (courses & modules) | S1 | APPROVED_OWNER_DECISIONS | APPROVED | توزيع المحتوى على مقررات ووحدات تدريبية | Design | Product Requirements |
| DEC-19 | تعريف دروس الأكاديمية (lessons) | S1 | APPROVED_OWNER_DECISIONS | APPROVED | نمذجة الدروس التفصيلية للتدريب | Design | Product Requirements |
| DEC-20 | إدارة الدفعات التدريبية (cohorts) | S1 | APPROVED_OWNER_DECISIONS | APPROVED | حصر التسجيل والتقدم بالدفعات الزمنية | Design | Product Requirements |
| DEC-21 | حوكمة Capability Grants والمحصر بالنطاق | S2 | APPROVED_OWNER_DECISIONS | APPROVED | تخصيص الصلاحيات بالـ Scopes المعتمدة | Design | Product Requirements |
| DEC-22 | منع توسيع enum app_role الخاص بالطلاب | S2 | APPROVED_OWNER_DECISIONS | APPROVED | حظر تعديل app_role كلياً | Design | Product Requirements |
| DEC-23 | حظر Admin blanket bypass الصريح | S3 | APPROVED_OWNER_DECISIONS | APPROVED | حظر صلاحيات التجاوز الإداري المباشر | Design | Product Requirements |
| DEC-24 | بروتوكول الوصول الإداري الطارئ المسبب | S3 | APPROVED_OWNER_DECISIONS | APPROVED | اشتراط السبب والمدة المؤقتة للوصول الطارئ | Design | Product Requirements |
| DEC-25 | سجل Audit لإجراءات Admin الطارئة | S3 | APPROVED_OWNER_DECISIONS | APPROVED | التعديل والتسجيل الصارم في emergency_access_audit_logs | Design | Product Requirements |
| DEC-26 | إدارة المؤسسات التدريبية (organizations) | S4 | APPROVED_OWNER_DECISIONS | APPROVED | اعتماد كيان المؤسسات المدرسية والتعليمية | Design | Product Requirements |
| DEC-27 | العضويات الزمنية للمؤسسة | S4 | APPROVED_OWNER_DECISIONS | APPROVED | اعتماد organization_memberships كمرجع للعضوية | Design | Product Requirements |
| DEC-28 | عقود ترخيص المؤسسات | S4 | APPROVED_OWNER_DECISIONS | APPROVED | اعتماد organization_contracts لربط العقود | Design | Product Requirements |
| DEC-29 | توزيع وإعادة مقاعد التدريب | S4 | APPROVED_OWNER_DECISIONS | APPROVED | إدارة المقاعد عبر contract_seats | Design | Product Requirements |
| DEC-30 | عزل جداول شهادات المعلمين | S5 | APPROVED_OWNER_DECISIONS | APPROVED | اعتماد academy_certificates للشهادات المهنية | Design | Product Requirements |
| DEC-31 | تسجيل أحداث الشهادات | S5 | APPROVED_OWNER_DECISIONS | APPROVED | تسجيل إصدار وتحديث الشهادات في academy_certificate_events | Design | Product Requirements |
| DEC-32 | دفتر التطوير المهني للساعات | S5 | APPROVED_OWNER_DECISIONS | APPROVED | احتساب وتتبع الساعات في professional_hours_ledger | Design | Product Requirements |
| DEC-33 | تحديد منتجات الأكاديمية | S6 | APPROVED_OWNER_DECISIONS | APPROVED | نمذجة المنتجات وأوامر الشراء في products و orders | Design | Product Requirements |
| DEC-34 | محرك الاستحقاقات التجارية | S6 | APPROVED_OWNER_DECISIONS | APPROVED | إدارة الاستحقاقات والفواتير في entitlements و invoices | Design | Product Requirements |
| DEC-35 | عزل اشتراكات المعلمين عن الطلاب | S6 | APPROVED_OWNER_DECISIONS | APPROVED | فصل كامل لبوابة المعلمين عن subscriptions الطلاب | Design | Product Requirements |
| DEC-36 | الملف المهني للمعلم (teacher_profiles) | S7 | APPROVED_OWNER_DECISIONS | APPROVED | إنشاء teacher_profiles المرتبط بـ auth.users | Design | Product Requirements |
| DEC-37 | إسناد التخصصات والمواد للمعلم | S7 | APPROVED_OWNER_DECISIONS | APPROVED | إدارة تخصصات المعلم في teacher_subject_assignments | Design | Product Requirements |
| DEC-38 | حظر SELECT العام على profiles الطلاب | R5 | MUST_DECIDE_BEFORE_RUNTIME | NEEDS_OWNER_DECISION | فرض سياسات RLS صارمة لحماية PII الطلاب | Runtime | Product Requirements |
| DEC-39 | هيكلة المسارات العامة والتربوية واللغات | P1-2 | MAY_DEFER_TO_P1 | DEFERRED_TO_P1 | توسيع الكتالوج واللغات في مرحلة P1 | P1 | Training Catalog |
| DEC-40 | هيكلة المسارات التخصصية لمواد الثانوية | S1 | APPROVED_OWNER_DECISIONS | APPROVED | اعتماد 10 برامج تخصصية لمواد الثانوية | Design | Training Catalog |
| DEC-41 | ربط الكفايات بمجالات التشخيص الـ 8 | R1 | MUST_DECIDE_BEFORE_RUNTIME | NEEDS_OWNER_DECISION | تحديد سياسات النجاح والربط بالتشخيص | Runtime | Training Catalog |
| DEC-42 | إزالة تاكسونومي ta_paths القديمة واستبدالها | S1 | APPROVED_OWNER_DECISIONS | APPROVED | حذف ta_paths نهائياً والاعتماد على S1 | Design | Training Catalog |
| DEC-43 | تصميم RLS وسياق Capability Grants | S2 | APPROVED_OWNER_DECISIONS | APPROVED | تطبيق سياسات RLS على مستوى جداول Scopes | Design | Architecture & Roles |
| DEC-44 | آلية الإدارة المؤقتة ومبررات الاستثناء | S3 | APPROVED_OWNER_DECISIONS | APPROVED | تنفيذ بروتوكول الوصول الإداري المؤقت عبر RPC | Design | Architecture & Roles |
| DEC-45 | النموذج المفهومي للبيانات (24 كيان) | S1 | APPROVED_OWNER_DECISIONS | APPROVED | اعتماد الـ 24 كياناً الموحدة في المعمارية | Design | Architecture & Roles |
| DEC-46 | مصفوفة الصلاحيات الموحدة | S2 | APPROVED_OWNER_DECISIONS | APPROVED | اعتماد مصفوفة الصلاحيات المؤطرة | Design | Architecture & Roles |
| DEC-47 | نموذج التهديدات والمخاطر الأمنية | R5 | MUST_DECIDE_BEFORE_RUNTIME | NEEDS_OWNER_DECISION | توثيق نموذج التهديدات في المرحلة 9 قبل Schema | Runtime | Architecture & Roles |
| DEC-48 | بروتوكول المزامنة والعمل Offline | R2 | MUST_DECIDE_BEFORE_RUNTIME | NEEDS_OWNER_DECISION | حسم نزاهة التقييمات وآلية المزامنة Offline | Runtime | Architecture & Roles |
| DEC-49 | رحلة الانضمام والملف المهني | S7 | APPROVED_OWNER_DECISIONS | APPROVED | تصميم تدفق التسجيل والملف المهني للمعلم | Design | UX Flows |
| DEC-50 | رحلة التشخيص وإسناد الدفعات | R1 | MUST_DECIDE_BEFORE_RUNTIME | NEEDS_OWNER_DECISION | تصميم رحلة التشخيص واشتراطات الاجتياز | Runtime | UX Flows |
| DEC-51 | رحلة التعلم عبر البرامج والدروس | S1 | APPROVED_OWNER_DECISIONS | APPROVED | تصميم واجهات تصفح المقررات والدروس | Design | UX Flows |
| DEC-52 | رحلة تسليم الأدلة والتقييم وسياسة SLA | R3 | MUST_DECIDE_BEFORE_RUNTIME | NEEDS_OWNER_DECISION | تصميم رحلة تسليم المهام ومراجعة المدرب | Runtime | UX Flows |
| DEC-53 | رحلة إصدار الشهادات وسلطة الاعتماد | R4 | MUST_DECIDE_BEFORE_RUNTIME | NEEDS_OWNER_DECISION | تصميم رحلة الإصدار والتحقق العام بالـ QR | Runtime | UX Flows |
| DEC-54 | رحلات الإدارة والطلب الطارئ | S3 | APPROVED_OWNER_DECISIONS | APPROVED | تصميم واجهة طلب الوصول الإداري المؤقت | Design | UX Flows |
| DEC-55 | نماذج الإيرادات المؤسسية وسياسة العقود | B2 | BUSINESS_DECISIONS | NEEDS_OWNER_DECISION | تحديد سياسات عقود المؤسسات B2B | Business | Business Model |
| DEC-56 | تسعير المقاعد والاشتراكات التجارية | B1 | BUSINESS_DECISIONS | NEEDS_OWNER_DECISION | تحديد تسعير المقاعد والاشتراكات | Business | Business Model |
| DEC-57 | عدم المساس بمحافظ الطلاب والعزل | S6 | APPROVED_OWNER_DECISIONS | APPROVED | عزل المحافظ والعمليات التجارية كلياً | Design | Business Model |
| DEC-58 | ترتيب مراحل التنفيذ وهيكلة Backlog | S1 | APPROVED_OWNER_DECISIONS | APPROVED | تنظيم الـ 17 مرحلة وتوزيع المهام | Design | Implementation Backlog |
| DEC-59 | إزالة التبعية الدائرية بين الكيانات | S1 | APPROVED_OWNER_DECISIONS | APPROVED | توثيق المسار الانتقالي المستقل بين TA-045 و TA-063 | Design | Implementation Backlog |
| DEC-60 | تقديم نموذج التهديدات على تصميم Schema | R5 | MUST_DECIDE_BEFORE_RUNTIME | NEEDS_OWNER_DECISION | تنفيذ نموذج التهديدات بالمرحلة 9 قبل Stage 10 | Runtime | Implementation Backlog |
| DEC-61 | نطاق MVP لـ Offline ونزاهة التخزين | R2 | MUST_DECIDE_BEFORE_RUNTIME | NEEDS_OWNER_DECISION | تحديد نطاق MVP للعمل غير المتصل | Runtime | Implementation Backlog |
| DEC-62 | نطاق P1 لـ Offline وحل التعارضات | R2 | MUST_DECIDE_BEFORE_RUNTIME | NEEDS_OWNER_DECISION | تحديد نطاق P1 للأنشطة و Evidence Outbox | Runtime | Implementation Backlog |
| DEC-63 | نطاق P2 لـ Offline والفيديو المحمي | P1-3 | MAY_DEFER_TO_P1 | DEFERRED_TO_P1 | تأجيل الفيديو المشفر والتحزيم المتقدم لـ P2 | P1 | Implementation Backlog |
| DEC-64 | حظر العمل التنفيذي في PR #54 | S3 | APPROVED_OWNER_DECISIONS | APPROVED | قصر PR #54 على التوثيق الفني والتصميم المعماري | Design | Implementation Backlog |

---

## 6. ملخص توزيع مهام Implementation Backlog

تم توزيع مهام التنفيذ الـ 110 وفق الهدف الدلالي المعتمد:
- **MVP (الأساس التشغيلي والإطلاق الأول):** 85 مهمة
- **P1 (الميزات الموسعة والأوفلاين المتقدم):** 15 مهمة
- **P2 (الفيديو المشفر والاعتمادات المتقدمة):** 10 مهام
- **الإجمالي:** 110 مهمة فريدة دون أي تعارض أو دائرية.
