# متطلبات المنتج لأكاديمية المعلمين (Teacher Academy Product Requirements - PRD)

| حقل الوثيقة | القيمة |
|---|---|
| معرّف الوثيقة | TEACHER-ACADEMY-PRODUCT-REQUIREMENTS-01 |
| التاريخ | 2026-08-03 |
| الحالة | **DRAFT — CANONICAL BLUEPRINT UPDATE 05** |
| النطاق | المتطلبات الوظيفية وغير الوظيفية وقواعد نموذج البيانات والمؤسسات |

---

## 1. نظرة عامة ورؤية المنتج

تهدف أكاديمية المعلمين إلى توفير بيئة تعليمية وتمكينية للمعلمين تشمل برامج تدريبية تخصصية، وتقييمات تشخيصية، وشهادات مهنية مستقلة، مع ربط المعلمين بالمؤسسات التعليمية دون تداخل مع جداول أو صلاحيات الطلاب.

---

## 2. المتطلبات الوظيفية حسب النطاقات السبعة (S1–S7)

### 2.1 النطاق التعليمي (S1 Educational Model)
- **التسلسل الهرمي المعتمد:**
  ```
  academy_programs -> academy_program_versions -> academy_courses -> academy_modules -> academy_lessons -> academy_cohorts
  ```
- **إزالة التاكسونومي القديم:** تم إلغاء الجداول السابقة (`ta_paths` و `ta_modules` و `ta_lessons`) نهائياً وتوثيق إزالتها.
- **إدارة الدفعات (`academy_cohorts`):** يلتحق المعلم بالبرنامج حصراً عبر دفعة زمنية محددة.

### 2.2 نطاق حوكمة الصلاحيات (S2 Capability Model)
- **جدول الصلاحيات:** تُدار كافة الصلاحيات عبر `academy_capability_grants`.
- **حظر enum الطلاب:** يُحظر توسيع enum `app_role` الخاص بتطبيق الطلاب.
- **الصلاحيات المؤطرة (Scoped Assignments):** تُربط كل صلاحية بـ `program_version_id` أو `cohort_id` أو `organization_id`.

### 2.3 نطاق الإدارة والوصول الطارئ (S3 Admin Governance)
- **إلغاء Blanket Bypass:** لا يوجد أي تجاوز إداري مباشر لـ Platform Admin أو `ta_admin`.
- **بروتوكول الوصول الإداري الطارئ:**
  - تقديم طلب مؤقت مسبب لا يتجاوز 60 دقيقة.
  - التوثيق والتسجيل الفوري الصارم في `emergency_access_audit_logs`.
  - إلغاء الصلاحية تلقائياً فور انتهاء المدة.

### 2.4 نطاق المؤسسات والعقود والمقاعد (S4 Organizations & Seats)
- **المؤسسات (`organizations`):** تمثيل المدارس والمكاتب والإدارات التعليمية.
- **العضويات العامة (`organization_memberships`):** المصدر القانوني الموحد للعضوية بين الشخص والمؤسسة، ويحوي (`person_id`, `organization_id`, `membership_type`, `start_date`, `end_date`, `status`, `scope`).
- **امتداد المعلم المهني (`teacher_organization_memberships`):** امتداد مهني يرتبط بـ `organization_membership_id` ويحمل بيانات المعلم (`teacher_role`, `verified_subject_assignment`, `academic_position`, `verification_metadata`) دون تكرار بيانات العضوية.
- **العقود التجارية (`contracts`):** السجل التجاري القانوني للعقد المبرم بين الطرفين (`contract_number`, `parties`, `product`, `dates`, `financial_terms`, `status`).
- **العقود المؤسسية (`organization_contracts`):** امتداد مؤسسي للعقد يرتبط بـ `contract_id` و `organization_id` ويحدد (`organizational_scope`, `seat_allocation_policy`, `beneficiary_hierarchy`, `organization_sla`).
- **إدارة المقاعد (`contract_seats`):** تتبع وتوزيع وإعادة تدوير المقاعد المخصصة للمؤسسة.

### 2.5 نطاق الشهادات والاعتماد (S5 Certificates)
- **الشهادات المستقلة (`academy_certificates`):** إصدار شهادات المعلمين بعيداً عن جداول شهادات الطلاب.
- **سجل الأحداث (`academy_certificate_events`):** تسجيل كافة عمليات الإصدار والتحديث والإبطال.
- **دفتر الساعات المهنية (`professional_hours_ledger`):** احتساب وتجميع ساعات التطوير المهني المعتمدة.

### 2.6 نطاق التجارة والاستحقاقات (S6 Commerce Engine)
- **محرك التجارة المستقل:** الكيانات المعتمدة هي (`products`, `orders`, `entitlements`, `invoices`, `contracts`).
- **العزل المالي:** عدم استخدام اشتراكات الطلاب (`subscriptions`) أو المحافظ المالية للطلاب إطلاقاً.

### 2.7 نطاق الهوية والخصوصية (S7 Teacher Identity & Privacy)
- **الحساب المشترك:** الاعتماد على `auth.users` للمصادقة.
- **الملف المهني (`teacher_profiles`):** البيانات المهنية والتخصصية المستقلة للمعلم.
- **إسناد التخصصات (`teacher_subject_assignments`):** ربط المعلم بالمواد التدريسية والمراحل.
- **حماية بيانات الطلاب:** حظر تنفيذ أي query عام للحصول على PII الخاص بالطلاب بواسطة المعلمين أو مسؤولي الأكاديمية.

---

## 3. المتطلبات غير الوظيفية والأمان

1. **نموذج التهديدات (Stage 9):** يتم تنفيذ واكتمال نموذج التهديدات في المرحلة 9 قبل البدء في تصميم Schema وتداول البيانات في المرحلة 10.
2. **الأداء والتوافر:** ضمان أداء سريع لواجهات المعلمين واستجابة عالي التوافر عبر PWA Service Worker.

---

## 4. العمل غير المتصل وملخص Backlog

تعتمد متطلبات العمل غير المتصل التوزيع القياسي المعتمد:
- **MVP (85 مهمة):** App Shell، الكتالوج، المحتوى النصي، و Progress Outbox بمزامنة LWW.
- **P1 (15 مهمة):** الأنشطة والتقييمات، Evidence Outbox، وحل التعارضات.
- **P2 (10 مهام):** الفيديو المشفر المحمي، والتحزيم الأصيل Native Packaging.
- **الإجمالي:** 110 مهمة تنفيذية.
