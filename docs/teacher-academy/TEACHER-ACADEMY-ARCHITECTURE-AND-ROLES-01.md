# معمارية النظام والنموذج القياسي وحوكمة الصلاحيات (Teacher Academy Architecture & Roles)

| حقل الوثيقة | القيمة |
|---|---|
| معرّف الوثيقة | TEACHER-ACADEMY-ARCHITECTURE-AND-ROLES-01 |
| التاريخ | 2026-08-03 |
| الحالة | **DRAFT — CANONICAL BLUEPRINT UPDATE 05** |
| النطاق | معمارية النظام ونموذج البيانات الـ 24 وحوكمة الصلاحيات وحدود الكيانات |

---

## 1. المبادئ المعمارية وحوكمة الصلاحيات (S2 & S3)

### 1.1 عزل الصلاحيات عبر Capability Grants (S2)
1. **عدم توسيع app_role:** يُمنع حظراً قاطعاً إضافة أي أدوار خاصة بالأكاديمية إلى قائمة أدوار تطبيق الطلاب القائمة.
2. **المنح المؤطر (Scoped Capability Grants):** تُمنح الصلاحيات حصراً عبر جدول `academy_capability_grants` محددة بالنطاقات التالية:
   - `program_version_id`: صلاحية محصورة في إصدار برنامج معين.
   - `cohort_id`: صلاحية محصورة في دفعة تدريبية محددة.
   - `organization_id`: صلاحية محصورة في مدرسة أو مكتب تعليم معين.

### 1.2 حدود الإدارة والوصول الإداري الطارئ (S3)
1. **إلغاء Admin Bypass الشامل:** لا توجد أي صلاحية تجاوز شاملة مستندة إلى اسم الدور المباشر (سواء platform_admin أو ta_admin).
2. **بروتوكول الوصول الطارئ (Emergency Access Protocol):**
   - طلب وصول طارئ مؤقت محدد بمدة زمنية لا تتجاوز 60 دقيقة.
   - إدخال سبب صريح وإجباري (Mandatory Reason).
   - تسجيل كل عملية تنفّذ في سجل تدقيق عام غير قابل للتعديل (`emergency_access_audit_logs`).
   - سحب وإلغاء الصلاحية تلقائياً فور انتهاء المدة.

---

## 2. النموذج الموحد للبيانات (Canonical Domain Model — 24 Entities)

يحتوي النموذج المعماري القياسي للأكاديمية على 24 كياناً موحداً مقسمة حسب النطاقات السبعة S1–S7:

### 2.1 النطاق التعليمي (S1 Educational Model)
1. `academy_programs`: البرامج التدريبية المعتمدة.
2. `academy_program_versions`: إصدارات البرامج التدريبية.
3. `academy_courses`: المقررات الدراسية التابعة للإصدار.
4. `academy_modules`: الوحدات التدريبية داخل المقرر.
5. `academy_lessons`: الدروس التفصيلية (فيديو، نص، محتوى).
6. `academy_cohorts`: الدفعات الزمنية المحددة للالتحاق.

### 2.2 نطاق حوكمة الصلاحيات (S2 Capability Model)
7. `academy_capability_grants`: جدول منح الصلاحيات المؤطرة بالـ Scopes.

### 2.3 نطاق الإدارة والتدقيق (S3 Admin Governance)
8. `emergency_access_audit_logs`: سجل طلبات وتأثيرات الوصول الإداري الطارئ.

### 2.4 نطاق المؤسسات والعقود (S4 Organizations)
9. `organizations`: المدارس والمكاتب والإدارات التعليمية.
10. `organization_memberships`: العضويات الزمنية العامة للمعلمين بالمؤسسات.
11. `organization_relationships`: التبعية الهرمية بين المؤسسات.
12. `organization_contracts`: عقود الترخيص B2B المبرمة للمؤسسات.
13. `contract_seats`: المقاعد التدريبية المخصصة والمستهلكة لكل عقد.

### 2.5 نطاق الشهادات والاعتماد (S5 Certificates)
14. `academy_certificates`: جداول الشهادات المهنية المستقلة للمعلمين.
15. `academy_certificate_events`: سجل أحداث الإصدار والتجديد والإبطال.
16. `professional_hours_ledger`: دفتر الحسابات لساعات التطوير المهني.

### 2.6 نطاق التجارة والاستحقاقات (S6 Commerce Engine)
17. `products`: المنتجات والاشتراكات والخدمات التدريبية.
18. `orders`: أوامر الشراء الصادرة.
19. `entitlements`: الاستحقاقات الفعلية الممنوحة للوصول.
20. `invoices`: الفواتير المالية الصادرة.
21. `contracts`: العقود التجارية المبرمة.

### 2.7 نطاق الهوية والخصوصية (S7 Teacher Identity & Privacy)
22. `teacher_profiles`: البيانات المهنية للمعلم المرتبطة بـ Auth Account المشترك.
23. `teacher_subject_assignments`: إسنادات التخصصات والمواد التدريسية للمعلم.
24. `teacher_organization_memberships`: الانتماءات والامتدادات المهنية للمعلم بالمؤسسات.

---

## 3. حدود الكيانات المتداخلة (Entity Boundaries)

### 3.1 `organization_memberships` مقابل `teacher_organization_memberships`
- **`organization_memberships`:** المصدر القانوني للعضوية العامة في المؤسسة، ويحمل (`person_id`, `organization_id`, `membership_type`, `start_date`, `end_date`, `status`, `scope`).
- **`teacher_organization_memberships`:** امتداد مهني خاص بالمعلم مرتبط بـ `organization_membership_id`، ويحمل فقط البيانات المهنية مثل (`teacher_role`, `verified_subject_assignment`, `academic_position`, `verification_metadata`) دون تكرار بيانات العضوية العامة.

### 3.2 `contracts` مقابل `organization_contracts`
- **`contracts`:** السجل التجاري القانوني الأساسي للعقد بين الطرفين (`contract_number`, `parties`, `product`, `dates`, `financial_terms`, `status`).
- **`organization_contracts`:** ربط مؤسسي للعقد يرتبط بـ `contract_id` و `organization_id`، ويحمل (`organizational_scope`, `seat_allocation_policy`, `beneficiary_hierarchy`, `organization_sla`).

---

## 4. مصفوفة الصلاحيات الموحدة (Capability Matrix)

| رمز الصلاحية (Capability) | الوصف | النطاقات المدعومة (Allowed Scopes) |
|---|---|---|
| program.read | تصفح البرامج والمقررات والدروس | العام، أو program_version_id |
| program.enroll | التسجيل في دفعة تدريبية | cohort_id |
| assessment.submit | تقديم التقييمات واختبارات الوحدات | cohort_id |
| submission.grade | تصحيح المهام والتقييم عبر Rubric | cohort_id |
| certificate.issue | اعتماد وإصدار الشهادات التدريبية | program_version_id أو cohort_id |
| org.manage_seats | تخصيص وتوزيع المقاعد للمؤسسة | organization_id |
| emergency.access | الوصول الإداري الطارئ المؤقت | مسبب ومؤرخ لفترة زمنية محددة |

---

## 5. نموذج التهديدات وتحليل المخاطر (Threat Model)

> **تنبيه منهجي إجباري:** يتم إنجاز نموذج التهديدات وتحليل المخاطر في **المرحلة 9 (Stage 9)** قبل البدء في تصميم الجدول والـ Schema في **المرحلة 10 (Stage 10)**.

### 5.1 التهديدات الرئيسية ومعالجتها المعمارية
1. **تهديد Privilege Escalation:** محاولة الوصول المباشر عبر أدوار الطلاب -> **المعالجة:** حظر app_role والاعتماد حصراً على Capability Grants المؤطرة.
2. **تهديد PII Leakage لبيانات الطلاب:** استعلام المعلم عن بيانات الطلاب الشخصية -> **المعالجة:** حظر SELECT العام على profiles الطلاب وسياسات RLS صارمة.
3. **تهديد Admin Bypass Overreach:** تجاوز المسؤول للسياسات الأمنية -> **المعالجة:** إلغاء Admin Bypass وتفعيل Emergency Access المسبب المؤرخ.
4. **تهديد تزوير الشهادات:** تعديل بيانات الشهادة أو تحريفها -> **المعالجة:** عزل جداول الشهادات واعتماد التحقق التلقائي عبر التوقيع والـ QR.

---

## 6. العزل وتكامل الأنظمة بروتوكول المزامنة Offline

- **Auth Account المشترك:** يعتمد النظام على `auth.users` للتحقق من هوية الحساب.
- **الاستقلال المالي:** لا تستخدم بوابة المعلمين جداول subscriptions أو wallets الخاصة بالطلاب إطلاقاً.
- **حماية PII للطلاب:** تُعزل بيانات الطلاب في جداولها وتُمنع بوابة المعلمين من تنفيذ أي SELECT عام عليها.
- **التوزيع القياسي لـ Offline:** MVP (85 مهمة) / P1 (15 مهمة) / P2 (10 مهام).
