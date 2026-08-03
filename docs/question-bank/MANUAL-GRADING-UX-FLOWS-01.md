# MANUAL-GRADING-UX-FLOWS-01
## تدفقات رحلة المستخدم والتصميم البصري لمحرك التصحيح اليدوي — التصحيح القانوني المعتمد 07

> **وثيقة تدفقات رحلة المستخدم والتصميم البصري (UX Flows & Visual Design Document)**
> **الإصدار:** 7.0.0 (Canonical Correction 07)
> **الحالة:** مجمد للتصميم الوثائقي فقط (Design Frozen - Docs Only / No Code / No SQL Execution / No DB / No Deploy)
> **النظام:** منصة تسهيل التعليمية (Tas-heel Engine - Question Bank QB-01)

---

## 0. تمييز النطاق والتنفيذ المستقبلي (Scope Distinction Block)

> [!IMPORTANT]
> **التصحيح القانوني لنطاق الحزمة الحالية مقابل التنفيذ المستقبلي:**
>
> **Current PR artifact change:**
> - **Docs only — no migration/runtime files**: وثائق تخطيط وسجل مهمات وتصميم فقط.
> - **Migration changes = ZERO**: لا توجد أي ملفات migrations أو تعديلات داتابيز في هذا PR.
> - **Runtime changes = ZERO**: لا يوجد أي كود تنفيذي أو شاشات تشغيلية في هذا PR.
> - **SQL = NO**: لا توجد استعلامات أو أوامر SQL تنفيذية في هذا PR.
> - **Database = ZERO**: لا توجد تعديلات على البنية التحتية لقواعد البيانات في هذا PR.
>
> **Future task implementation requirement:**
> - **Migration Required / Runtime Required حسب كل مهمة**: التصنيف المستقبلي الدلالي الموضح لكل مهمة في Backlog عند تنفيذ الميزات مستقبلاً (Migration Required = YES/NO | Runtime Required = YES/NO).
> - قد يتطلب التنفيذ المستقبلي Migrations لبناء الكيانات والـ RLS والـ RPCs.
> - قد يتطلب التنفيذ المستقبلي Runtime workers/UI لتشغيل المعالجات والمؤقتات والواجهات.
> - يحتاج حزم تنفيذ مستقلة ومراجعة أمنية كاملة لكل مهمة قبل الدمج.

---

## 1. فلسفة التصميم البصري ودعم اللغة العربية (Visual Design & Arabic RTL System) `[REQUIRED_EXTENSION]`

### 1.1. الهوية البصرية الجذابة (Rich Modern Aesthetics) `[REQUIRED_EXTENSION]`
- **أنظمة الألوان المتقدمة**:
  - الوضع الداكن الفاخر (Sleek Dark Mode): خلفيات بتركيبات `Slate-900` و `Zinc-950` مع لمسات زجاجية (Glassmorphism) وعناصر إضاءة محيطية خفيفة.
  - الوضع الفاتح الناصع (Clean Light Mode): خلفيات `Emerald-50/Off-White` بتباين مرتفع للقراءة.
- **التفاعل الديناميكي والأنيميشن**:
  - انتقالات سلسة (200ms Easing) مع مؤشرات مرئية لمستويات سلم التقييم (Rubric Chips Accent).

### 1.2. دعم اللغة العربية والربط ثنائي الاتجاه (Arabic RTL & BiDi Handling) `[REQUIRED_EXTENSION]`
- **المحاذاة الشاملة من اليمين لليسار (RTL System)**:
  - ضبط الاتجاه العربي الفصيح لكافة الأزرار والقوائم وعناصر الواجهة باستخدام خطوط عربية حديثة (Cairo / Inter).
- **معالجة النصوص ثنائية الاتجاه (BiDi Engine)**:
  - محاذاة النص العربي لليمين مع المحافظة التلقائية على محاذاة اليسار (LTR) للرموز البرمجية، الصيغ الرياضية، والأكواد.

---

## 2. تدفقات رحلة المستخدم التفصيلية (Core User Journeys) `[REQUIRED_EXTENSION]`

### 2.1. الرحلة الأولى: رحلة المصحح (Grader Journey - Queue to Submit) `[REQUIRED_EXTENSION]`

```
[طابور الإجابات (Queue)] ───(claim)───> [قفل مؤقت Lease Lock (TTL 15m)]
                                                  │ (حالة Assignment: CLAIMED)
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
                         [تحول حالة Response إلى SUBMITTED_FOR_REVIEW / حالة Assignment إلى SUBMITTED]
```

#### عناصر الواجهة المتقدمة للمصحح:
- **شريط الهيدر العلوي**: مؤشر الوقت المتبقي للقفل (Countdown Timer)، زر تجديد النشاط (Heartbeat Indicator)، حالة رمز المحاصرة (Fencing Token Badge)، وزر التحرير اليدوي (Release Claim).
- **لوحة عرض إجابة الطالب (Student Response Viewer)**: تكبير/تصغير الخط، دعم وضع العلامات التوضيحية، وإخفاء هوية الطالب بالكامل (Blind Token).
- **لوحة سلم التقييم (Rubric Panel)**: بنود تفاعلية لمسية تحدّث المجموع آلياً وتتحقق من الحدود ($0 \le \text{Score} \le \text{Max Score}$).
- **إرجاع التقييم للمراجعة**: في حال وجود ملاحظات توجيهية من المصحح الأول، يتم فتح شاشة التقييم بحالة `RETURNED_FOR_SECOND_REVIEW` وتنتقل عند التعديل إلى `IN_GRADING` لعرض الملاحظات والتصحيح قبل إعادة الإرسال (`RETURNED_FOR_SECOND_REVIEW` $→$ `IN_GRADING` $→$ `SUBMITTED_FOR_REVIEW`).

---

### 2.2. الرحلة الثانية: رحلة المحكّم المستقل (Independent Senior Grader Journey) `[REQUIRED_EXTENSION]`

```
[طابور المعايرة والتحكيم (Moderation & Arbitration Queue)]
       │
       ├── مسار أ: عينات ضبط الجودة العشوائية (QA Sampling 5%)
       └── مسار ب: حوادث انحراف التصحيح المزدوج (Double Mark Variance > 15%)
       │
       ▼
[شاشة التحكيم والمقارنة المزدوجة — Independent Senior Grader Only (Arbitration Interface)]
   ├── درجة وملاحظات المصحح الأول (Grader A Score)
   ├── درجة وملاحظات المصحح الثاني (Grader B Score)
   └── حساب التباين آلياً ومقارنة بنود Rubric
       │
       ├── خيار أ: إقرار الدرجة المعايرة المعتمدة ───> [حالة Response: SUBMITTED_FOR_REVIEW / READY_FOR_FINALIZATION ثم Finalization بواسطة Reviewer/Authorized Senior Grader]
       └── خيار ب: إعادة الإجابة للمراجعة الثانية ───> [حالة Response: RETURNED_FOR_SECOND_REVIEW]
```

#### ضوابط الواجهة والسلطات الحصرية (ODR-007 & ODR-008):
- **تقييد واجهة التحكيم**: واجهة التحكيم معنونة ومقيدة حصرياً بـ **Independent Senior Grader** (الذي لم يشارك كـ Primary Grader أو Counterpart Grader ولا توجد لديه تضارب مصالح COI).
- **دور المراجع والمدير**: يمكن للمراجع (Reviewer) أو مدير التصحيح (Grading Manager) متابعة الحالة التشغيلية ومؤشرات التباين دون إصدار قرار التحكيم.
- **الاعتماد النهائي (Finalization)**: يتم تنفيذ زر "اعتماد نهائي" حصرياً بواسطة **Reviewer** أو **Authorized Senior Grader**.

#### ميزات واجهة التحكيم والمعايرة:
- **مقارنة التقييمات الشاقولية (Side-by-Side Comparison)**: عرض التقييمين المستقلين جنبًا إلى جنب مع إبراز نقاط التباين بلون تنبيهي.
- **إعادة التوجيه (Return with Guidance)**: زر مخصص لإعادة المهمة بحالة `RETURNED_FOR_SECOND_REVIEW` متبوعاً بحقل توجيهي إجباري.

---

### 2.3. الرحلة الثالثة: رحلة مدير التصحيح (Grading Manager Journey - Operations Dashboard) `[REQUIRED_EXTENSION]`

```
[لوحة العمليات والتحكم المباشر (Operations Dashboard)]
       │
       ├── مؤشرات الأداء الحية (SLA Breach Metrics, Workload Capacity)
       ├── طابور التخصيص والتعيين اليدوي (Manual Dispatch / Reclaim)
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
       │ (تظهر النتائج للامتحانات الرسمية بعد BATCH_FINALIZED + RELEASED، وللتمارين التدريبية وفق مسارات TASK-MG-069)
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
      [تحول حالة Response إلى APPEALED والتخصيص لمراجع مستقل لا تربطه COI]
            │
            ▼
      [مراجعة التظلم بواسطة Authorized Appeal Reviewer وإصدار القرار عبر grading.appeal.process]
            │ (تطبيق proposed adjusted score + حفظ provenance/reason/audit event + CAS validation)
            ▼
      [تحول حالة Response إلى READY_FOR_FINALIZATION دون اعتماد تلقائي NO FINALIZED ودون إفراج/كشف]
            │
            ▼
      [تنفيذ الاعتماد النهائي اليدوي في خطوة منفصلة بواسطة Reviewer / Authorized Senior Grader عبر finalize_manual_grade]
            │
            ▼
      [تحول حالة Response إلى FINALIZED]
```

---

### 2.6. رحلات نتائج التمارين التدريبية الثلاث (Practice Result Flows - TASK-MG-069) `[REQUIRED_EXTENSION]`

تتم معالجة نتائج وإفراج أنشطة الممارسة التدريبية عبر ثلاث رحلات مستقلة وفق إعدادات النشاط بواسطة `TASK-MG-069 — Practice Release Policy Dispatcher`، مع تحديد اعتماداتها الفنية الموحدة والمشروطة صراحة:
- **الاعتمادات المشتركة لكافة المسارات (Common Dependencies)**: حالة الاعتماد النهائي اليدوي (`FINALIZED` بواسطة `Reviewer` / `Authorized Senior Grader`)، إعدادات إفراج النشاط (`activity.release_mode`)، التحقق من الصلاحية والتفويض (`Authorization`)، وسياسة الإشعارات والكشف (`Notification/reveal policy`).
- **الاعتمادات المشروطة حسب المسار (Conditional Dependencies)**:
  - **مسار IMMEDIATE**: لا توجد أي اعتمادية على اكتمال الدفعة (`No Batch Dependency`).
  - **مسار DELAYED**: اعتمادية المجدول والمعالج الزمني (`Scheduler/Worker Dependency`).
  - **مسار BATCH**: اعتمادية محرك إفراج الدفعة واكتمال كافة استجاباتها يدوياً (`Batch Release Engine Dependency`).

#### 2.6.1. رحلة الإفراج الفوري (Practice IMMEDIATE Result Flow)
- **المُحفّز (Trigger)**: تنفيذ الاعتماد النهائي اليدوي بواسطة Reviewer أو Authorized Senior Grader عبر `finalize_manual_grade`.
- **الفاعل (Actor)**: Reviewer / Authorized Senior Grader (Finalization Authority) & Outbox Engine.
- **الشروط المسبقة (Preconditions)**: ضبط النشاط على نمط `IMMEDIATE`؛ اعتماد الاستجابة نهائياً يدوياً (`FINALIZED`) مسبقاً بواسطة جهة مخولة؛ حظر مطلق لاعتماد المصحح العادي؛ لا يوجد أي اعتماد على اكتمال الدفعة (`No Batch Dependency`) ولا انتظار لإفراج الدفعة.
- **توقيت الإفراج والكشف (Release/Reveal Timing)**: إفراج حتمي فور الاعتماد النهائي المباشر وتطبيق إعدادات reveal الخاصة بالنشاط.
- **الإشعارات (Notifications)**: توليد وإدراج رسالة الإشعار حتمياً داخل `notification_outbox` بنفس معاملة الاعتماد النهائي.
- **السلوك بدون اتصال (Offline Behavior)**: يتلقى العميل غير المتصل (Offline client) الحالة المعتمدة والمرئية عند أول مزامنة تالية.
- **الأخطاء وإعادة المحاولة (Errors/Retry)**: ضمان عدم تكرار الإفراج عند إعادة محاولة الإشعار (`Idempotent release`) وتوليد إعادة المحاولة التلقائية للإشعارات المتعثرة عبر Outbox Worker دون مضاعفة الإفراج.
- **الحالة المرئية للطالب (Student-Visible State)**: تنتقل فوراً إلى مرئية للطالب (`RELEASED` / `STUDENT_VISIBLE`) وموثقة بـ timestamp الإفراج.

#### 2.6.2. رحلة الإفراج المؤجل (Practice DELAYED Result Flow)
- **المُحفّز (Trigger)**: حلول الموعد المحدد للإفراج `release_at` أو الكشف `reveal_at` المحفوظ بصيغة UTC واستدعاء Worker/Scheduler.
- **الفاعل (Actor)**: Scheduler / Worker system.
- **الشروط المسبقة (Preconditions)**: ضبط النشاط على نمط `DELAYED`؛ اعتماد كافة الاستجابات يدوياً (`FINALIZED`) مسبقاً بواسطة جهة مخولة؛ حفظ `release_at` / `reveal_at` بـ UTC؛ إنفاذ حارس عدم الإفراج المبكر (`Not-before-time guard`)؛ عدم وجود حاجة لاكتمال الدفعة (`No Batch Dependency`).
- **توقيت الإفراج والكشف (Release/Reveal Timing)**: الإفراج والكشف الحتمي فور حلول الوقت المحدد بـ UTC، مع تحويل التوقيت إلى المنطقة الزمنية المحلية للمستخدم عند العرض فقط (`Display-only Timezone Conversion`).
- **الإشعارات (Notifications)**: توليد رسائل الإشعار في `notification_outbox` وإرسالها عند انقضاء الوقت المحدد.
- **السلوك بدون اتصال (Offline Behavior)**: يتلقى العميل غير المتصل الحالة المرئية والدرجات فور إجراء المزامنة بعد حلول الموعد.
- **الأخطاء وإعادة المحاولة (Errors/Retry)**: معالجة تعثر المهمة المجدولة (`Stale job handling`) وإعادة المحاولة الحتمية مع ضمان عدم تكرار الإفراج (`Idempotence guard`) واستعادة النظام من الأعطال (`Failure recovery`).
- **الحالة المرئية للطالب (Student-Visible State)**: تظل النتيجة بحالة `PENDING_RELEASE` حتى انقضاء الوقت المحدد بـ UTC لتتحول إلى `RELEASED` معتمدة ومرئية للطالب.

#### 2.6.3. رحلة إفراج الدفعة التدريبية (Practice BATCH Result Flow)
- **المُحفّز (Trigger)**: استدعاء دالة الإفراج الجماعي `release_grading_batch` بواسطة مدير التصحيح المخول بعد التحقق من التكليف والتكامل.
- **الفاعل (Actor)**: Grading Manager (Release Authority) & Batch Release Engine (`TASK-MG-062` / `TASK-MG-069`).
- **الشروط المسبقة (Preconditions)**: ضبط النشاط على نمط `BATCH`؛ اعتماد **كافة** الاستجابات داخل الدفعة يدوياً (`FINALIZED`) مسبقاً بواسطة جهة مخولة (`Reviewer` / `Authorized Senior Grader`)؛ اجتياز فحص اكتمال الدفعة (`Batch completeness validation`)؛ يُحظر حظراً مطلقاً إفراج الدفعة أو قيام Batch Worker أو Manager باعتتماد أي استجابة غير معتمدة (`Worker/Manager cannot finalize Responses`, `no response finalization`).
- **توقيت الإفراج والكشف (Release/Reveal Timing)**: إفراج جماعي لكافة نتائج الدفعة دفعة واحدة فور صدور قرار المدير وتحديد توقيت الكشف المعتمد.
- **الإشعارات (Notifications)**: توليد رسائل الإشعار لكافة طلاب الدفعة دفعة واحدة داخل `notification_outbox`.
- **السلوك بدون اتصال (Offline Behavior)**: تزامن العميل غير المتصل وتلقي النتائج المعتمدة فور إجراء المزامنة بعد إفراج الدفعة.
- **الأخطاء وإعادة المحاولة (Errors/Retry)**: كبح الإفراج الجزئي عند وجود أي صف غير معتمد بـ `UNFINISHED_RESPONSES_IN_BATCH`، ومعالجة الفشل الجزئي التقني (`Partial failure handling`) وإعادة محاولة الدفعة بحتمية (`Idempotent retry`).
- **الحالة المرئية للطالب (Student-Visible State)**: تنتقل حالة الاستجابات والدفعة من `FINALIZATION_PENDING` / `RELEASE_PENDING` إلى `RELEASED` مرئية للطلاب.

---

## 3. مواصفات التجاوب وإمكانية الوصول (Accessibility & Mobile UX Specifications) `[REQUIRED_EXTENSION]`

| المكون (UI Component) | شاشات الهواتف (< 640px) | شاشات التابلت (640px - 1024px) | الشاشات الكبيرة (> 1024px) | إمكانية الوصول (WCAG 2.1 AA) |
| :--- | :--- | :--- | :--- | :--- |
| **تخطيط صفحة التصحيح** | عمودي كامل مع درج سفلي | تخطيط مقسوم 50% / 50% | تخطيط ثلاثي الأعمدة | دعم التنقل الكامل بـ Keyboard |
| **سلم التقييم (Rubric)** | Drawer يتم سحبه من الأسفل | Panel ثابت في الجانب الأيسر | Panel ممتد يمين الإجابة | تسميات ARIA Labels وتمركز Focus |
| **أزرار إدخال الدرجات** | أزرار لمسية كبيرة ($\ge 52\text{px}$) | أزرار لمسية ($\ge 48\text{px}$) | إدخال رقمي مباشر + Rubric | استعادة التركيز الذكي (Focus Restoration) |
| **إشعارات حالة القفل** | شريط سفلي ثابت يوضح TTL | شريط علوي بارز | تنبيه جانبي مع مؤشر صوتي | إشعارات قابلة للقراءة عبر قارئ الشاشة |

---
*نهاية الوثيقة MANUAL-GRADING-UX-FLOWS-01 (Canonical Correction 05)*


> [!NOTE]
> **التكامل مع آلات الحالات الـ 6 لرحلة المستخدم (UX State Integration):**
> تم ربط كافة واجهات ورحلات المستخدم بالأنماط البصرية المقابلة في آلات الحالات الـ 6:
> 1. `RESPONSE` | 2. `ASSIGNMENT` | 3. `REVIEW_ROW` | 4. `APPEAL` | 5. `BATCH` | 6. `OUTBOX`.
> تضمن الواجهات إظهار حالة التظلم `APPEALED` وحالة الدفعة `RELEASED` ومؤشرات إعادة المحاولة `RETRY_WAIT` والرسائل الميتة `DEAD_LETTER` بوضوح تام مع الالتزام بالنظام البصري العربي RTL وتجاوب الجوال.