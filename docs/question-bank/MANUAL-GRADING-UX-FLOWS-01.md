# MANUAL-GRADING-UX-FLOWS-01
## تدفقات رحلة المستخدم والتصميم البصري لمحرك التصحيح اليدوي — التصحيح القانوني المعتمد 03

> **وثيقة تدفقات رحلة المستخدم والتصميم البصري (UX Flows & Visual Design Document)**
> **الإصدار:** 3.0.0 (Canonical Correction 03)
> **الحالة:** مجمد للتصميم الوثائقي فقط (Design Frozen - Docs Only / No Code / No SQL Execution / No DB / No Deploy)
> **النظام:** منصة تسهيل التعليمية (Tas-heel Engine - Question Bank QB-01)

---

## 1. فلسفة التصميم البصري ودعم اللغة العربية (Visual Design & Arabic RTL System) `[EXISTING_QB01]`

### 1.1. الهوية البصرية الجذابة (Rich Modern Aesthetics) `[EXISTING_QB01]`
- **أنظمة الألوان المتقدمة**:
  - الوضع الداكن الفاخر (Sleek Dark Mode): خلفيات بتركيبات `Slate-900` و `Zinc-950` مع لمسات زجاجية (Glassmorphism) وعناصر إضاءة محيطية خفيفة.
  - الوضع الفاتح الناصع (Clean Light Mode): خلفيات `Emerald-50/Off-White` بتباين مرتفع للقراءة.
- **التفاعل الديناميكي والأنيميشن**:
  - انتقالات سلسة (200ms Easing) مع مؤشرات مرئية لمستويات سلم التقييم (Rubric Chips Accent).

### 1.2. دعم اللغة العربية والربط ثنائي الاتجاه (Arabic RTL & BiDi Handling) `[EXISTING_QB01]`
- **المحاذاة الشاملة من اليمين لليسار (RTL System)**:
  - ضبط الاتجاه العربي الفصيح لكافة الأزرار والقوائم وعناصر الواجهة باستخدام خطوط عربية حديثة (Cairo / Inter).
- **معالجة النصوص ثنائية الاتجاه (BiDi Engine)**:
  - محاذاة النص العربي لليمين مع المحافظة التلقائية على محاذاة اليسار (LTR) للرموز البرمجية، الصيغ الرياضية، والأكواد.

---

## 2. تدفقات رحلة المستخدم التفصيلية (Core User Journeys) `[REQUIRED_EXTENSION]`

### 2.1. الرحلة الأولى: رحلة المصحح (Grader Journey - Queue to Submit) `[REQUIRED_EXTENSION]`

```
[طابور الإجابات (Queue)] ───(claim)───> [قفل مؤقت Lease Lock (TTL 15m)]
                                                  │
                                                  ▼
                                     [شاشة التقييم المجهول (Blind Evaluation)]
                                        ├── مؤشر القفل (Countdown Timer + Heartbeat)
                                        ├── حالة Fencing Token (Valid / Active)
                                        ├── لوحة الإجابة (مجهولة الهوية)
                                        └── سلم التقييم (Rubric Evaluator Panel)
                                                  │
                                                  ▼ (إدخال الدرجة والبنود)
                                     [اعتماد وإرسال التقييم الذري (Submit Score)]
                                                  │
                                                  ▼
                                     [تحول الحالة إلى SUBMITTED / العودة للطابور]
```

#### عناصر الواجهة المتقدمة للمصحح:
- **شريط الهيدر العلوي**: مؤشر الوقت المتبقي للقفل (Countdown Timer)، زر تجديد النشاط (Heartbeat Indicator)، حالة رمز المحاصرة (Fencing Token Badge)، وزر التحرير اليدوي (Release Claim).
- **لوحة عرض إجابة الطالب (Student Response Viewer)**: تكبير/تصغير الخط، دعم وضع العلامات التوضيحية، وإخفاء هوية الطالب بالكامل (Blind Token).
- **لوحة سلم التقييم (Rubric Panel)**: بنود تفاعلية لمسية تحدّث المجموع آلياً وتتحقق من الحدود ($0 \le \text{Score} \le \text{Max Score}$).
- **إرجاع التقييم للمراجعة**: في حال وجود ملاحظات توجيهية من المصحح الأول، يتم فتح شاشة التقييم بحالة `RETURNED_FOR_SECOND_REVIEW` لعرض الملاحظات والتعديل.

---

### 2.2. الرحلة الثانية: رحلة المصحح الأول والمراجع (Senior Grader & Reviewer Journey) `[REQUIRED_EXTENSION]`

```
[طابور المعايرة والتحكيم (Moderation & Arbitration Queue)]
       │
       ├── مسار أ: عينات ضبط الجودة العشوائية (QA Sampling 5%)
       └── مسار ب: حوادث انحراف التصحيح المزدوج (Double Mark Variance > 15%)
       │
       ▼
[شاشة التحكيم والمقارنة المزدوجة (Arbitration Interface)]
   ├── درجة وملاحظات المصحح الأول (Grader A Score)
   ├── درجة وملاحظات المصحح الثاني (Grader B Score)
   └── حساب التباين آلياً ومقارنة بنود Rubric
       │
       ├── خيار أ: إقرار الدرجة المعايرة المعتمدة ───> [حالة FINALIZED]
       └── خيار ب: إعادة الإجابة للمراجعة الثانية ───> [حالة RETURNED_FOR_SECOND_REVIEW]
```

#### ميزات واجهة التحكيم والمعايرة:
- **مقارنة التقييمات الشاقولية (Side-by-Side Comparison)**: عرض التقييمين المستقلين جنبًا إلى جنب مع إبراز نقاط التباين بلون تنبيهي.
- **إعادة التوجيه (Return with Guidance)**: زر مخصص لإعادة المهمة بحالة `RETURNED_FOR_SECOND_REVIEW` متبوعاً بحقل توجيهي إجباري.

---

### 2.3. الرحلة الثالثة: رحلة مدير التصحيح (Grading Manager Journey - Operations Dashboard) `[REQUIRED_EXTENSION]`

```
[لوحة العمليات والتحكم المباشر (Operations Dashboard)]
       │
       ├── مؤشرات الأداء الحية (SLA Breach Metrics, Workload Capacity)
       ├── طابور التخصيص والتعيين اليدوي (Manual Dispatch)
       └── إدارة الاعتراضات والفتح الاستثنائي (Appeals & Reopen)
       │
       ▼
[زر الاعتماد والإفراج الجماعي للدفعة (Trigger Batch Release)]
       │ (تحول حالة الدفعة إلى BATCH_FINALIZED + RELEASED)
       ▼
[تنشيط صندوق الإشعارات Outbox وكشف الإجابات النموذجية وفق Reveal Timer]
```

---

### 2.4. الرحلة الرابعة: رحلة مشغل الطوارئ (Admin Emergency Operator Journey) `[REQUIRED_EXTENSION]`

```
[مركز الطوارئ وسجلات التدقيق (Emergency Audit Center)]
       │
       ▼
[البحث عن الاستجابة بـ UUID أو المفتاح المزدوج]
       │
       ▼
[مفتش السجل التتابعي السلسلي (Append-Only Audit Inspector)]
       │
       ▼
[طلب فتح مراجعة استثنائية (RPC Emergency Reopen)]
       │ (اشتراط رمز الطوارئ + سبب إجباري reason لا يقل عن 20 حرفاً)
       ▼
[تسجيل صف تصحيحي جديد بحالة REOPENED وتوجيه الإجابة لـ Senior Grader]
```

---

### 2.5. الرحلة الخامسة: رحلة الطالب (Student Results & Appeal Experience) `[REQUIRED_EXTENSION]`

```
[شاشة نتائج الطالب (Student Results Dashboard)]
       │ (تظهر النتائج فقط بعد BATCH_FINALIZED + RELEASED)
       ▼
[بطاقة تفاصيل الدرجة + بنود Rubric + ملاحظات المصحح المعتمدة]
       │
       ├── خيار أ: استعراض الإجابة النموذجية ───> (بعد انقضاء Reveal Timer)
       └── خيار ب: تقديم اعتراض / تظلم (Submit Appeal)
           │
           ▼
     [نافذة إدخال مبررات الاعتراض والنقاط الخلافية]
           │
           ▼
     [تحول الحالة إلى APPEALED والتخصيص لمراجع مستقل لا تربطه COI]
```

---

## 3. مواصفات التجاوب وإمكانية الوصول (Accessibility & Mobile UX Specifications) `[REQUIRED_EXTENSION]`

| المكون (UI Component) | شاشات الهواتف (< 640px) | شاشات التابلت (640px - 1024px) | الشاشات الكبيرة (> 1024px) | إمكانية الوصول (WCAG 2.1 AA) |
| :--- | :--- | :--- | :--- | :--- |
| **تخطيط صفحة التصحيح** | عمودي كامل مع درج سفلي | تخطيط مقسوم 50% / 50% | تخطيط ثلاثي الأعمدة | دعم التنقل الكامل بـ Keyboard |
| **سلم التقييم (Rubric)** | Drawer يتم سحبه من الأسفل | Panel ثابت في الجانب الأيسر | Panel ممتد يمين الإجابة | تسميات ARIA Labels وتمركز Focus |
| **أزرار إدخال الدرجات** | أزرار لمسية كبيرة ($\ge 52\text{px}$) | أزرار لمسية ($\ge 48\text{px}$) | إدخال رقمي مباشر + Rubric | استعادة التركيز الذكي (Focus Restoration) |
| **إشعارات حالة القفل** | شريط سفلي ثابت يوضح TTL | شريط علوي بارز | تنبيه جانبي مع مؤشر صوتي | إشعارات قابلة للقراءة عبر قارئ الشاشة |

---
*نهاية الوثيقة MANUAL-GRADING-UX-FLOWS-01 (Canonical Correction 03)*
