# النموذج التجاري والاستحقاقات المالية (Teacher Academy Business Model)

| حقل الوثيقة | القيمة |
|---|---|
| معرّف الوثيقة | TEACHER-ACADEMY-BUSINESS-MODEL-01 |
| التاريخ | 2026-08-03 |
| الحالة | **DRAFT — CANONICAL BLUEPRINT UPDATE 05** |
| النطاق | النموذج التجاري، الاستحقاقات المالية B2B/B2C، والقرارات المالية B1–B4 |

---

## 1. استراتيجية النموذج التجاري والمنتجات (S6 Commerce)

تعتمد الأكاديمية نموذجاً تجارياً مستقلاً كلياً يضمن تقديم برامج التطوير المهني للمعلمين والمؤسسات دون أي تداخل مع اشتراكات الطلاب أو المحافظ المالية للطلاب.

### 1.1 الكيانات المعتمدة للمحرك التجاري:
- **`products`:** تعريف المنتجات التدريبية والاشتراكات والحزم.
- **`orders`:** تسجيل وتتبع أوامر الشراء والتعاملات.
- **`entitlements`:** منح وحساب استحقاقات الوصول الفعلي للبرامج.
- **`invoices`:** إصدار وتتبع الفواتير المالية الصادرة.
- **`contracts`:** السجل التجاري القانوني المبرم بين الطرفين.

---

## 2. حدود الكيانات العقارية والمؤسسية (H Entity Boundaries)

### 2.1 `contracts` مقابل `organization_contracts`
- **`contracts`:** السجل التجاري القانوني الأساسي للعقد بين الطرفين، ويشمل: (`contract_number`, `parties`, `product`, `dates`, `financial_terms`, `status`).
- **`organization_contracts`:** ربط مؤسسي للعقد يربط `contract_id` و `organization_id`، ويحدد: (`organizational_scope`, `seat_allocation_policy`, `beneficiary_hierarchy`, `organization_sla`).

### 2.2 `organization_memberships` مقابل `teacher_organization_memberships`
- **`organization_memberships`:** المصدر القانوني للعضوية العامة في المؤسسة (`person_id`, `organization_id`, `membership_type`, `start_date`, `end_date`, `status`, `scope`).
- **`teacher_organization_memberships`:** امتداد مهني خاص بالمعلم مرتبط بـ `organization_membership_id` يحمل البيانات التخصصية والأكاديمية دون تكرار حقول العضوية العامة.

---

## 3. نماذج الترخيص B2B وإدارة المقاعد (`contract_seats`)

- **عقود الترخيص المؤسسي (B2B Licensing):** يتيح النظام للمدارس والمكاتب التعليمية شراء حزم مقاعد تدريبية معتمدة.
- **تخصيص المقاعد (`contract_seats`):** يتم توزيع المقاعد وتتبع الاستهلاك وإعادة التدوير عند انتهاء انتماء المعلم.

---

## 4. قائمة القرارات المالية والتجارية الـ 4 (B1–B4 Business Decisions)

تحدد القرارات القانونية الأربعة السياسات المالية المطلوبة قبل التشغيل التجاري:

| رمز القرار | القرار التجاري | الوصف والهدف | الحالة |
|---|---|---|---|
| **B1** | Commercial packaging and pricing | تحديد أسعار المنتجات والحزم الفردية B2C والمؤسسية B2B | **NEEDS_OWNER_DECISION** |
| **B2** | Institutional contract policy | تحديد سياسات عقود المدارس والحد الأدنى للمقاعد والشروط Legal | **NEEDS_OWNER_DECISION** |
| **B3** | Finance, tax, invoices and retention | تحديد سياسات الفوترة والضرائب والاحتفاظ بالسجلات المالية | **NEEDS_OWNER_DECISION** |
| **B4** | Trainer compensation and accreditation economics | تحديد المكافآت المالية للمدربين واقتصاديات الاعتماد المهني | **NEEDS_OWNER_DECISION** |

---

## 5. العمل غير المتصل وتوزيع المهام

تتوزع المهام التجارية وفق التوزيع المعماري المعتمد:
- **MVP (85 مهمة):** المواصفات الأساسية لـ `products` و `orders` و `entitlements` دون ربط بمحافظ الطلاب.
- **P1 (15 مهمة):** التكامل مع بوابات الدفع والتجديد التلقائي وإدارة عقود B2B.
- **P2 (10 مهام):** الحزم المؤسسية المخصصة وتقارير الاعتراف بالإيرادات Financial Audits.
