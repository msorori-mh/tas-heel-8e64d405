# MANUAL-GRADING-TEST-MATRIX-01
## مصفوفة مواصفات حالات الاختبار والتحقق الشاملة لمحرك التصحيح اليدوي — التصحيح القانوني المعتمد 07

> **وثيقة مواصفات حالات الاختبار والجودة (Comprehensive Test Specification Document)**
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

## 1. استراتيجية مواصفات الاختبار وتصحيح التغطية (Testing Strategy & Canonical Scope) `[REQUIRED_EXTENSION]`

تنقسم مصفوفة مواصفات حالات الاختبار إلى سبع فئات هيكلية تحتوي على **95 مواصفة فريدة**:
1. **فئة A: الأمن الصارم، الصلاحيات، و RLS (TC-SEC-001 إلى TC-SEC-021)**: 21 مواصفة.
2. **فئة B: قواعد احتساب الدرجات والحدود المعتمدة (TC-SCR-001 إلى TC-SCR-007)**: 7 مواصفات.
3. **فئة C: طابور العمل، الأقفال المؤقتة، المحاصرة، و SLA (TC-QCL-001 إلى TC-QCL-012)**: 12 مواصفة.
4. **فئة D: التصحيح المزدوج، التحكيم، والتظلمات (TC-DMA-001 إلى TC-DMA-018)**: 18 مواصفة.
5. **فئة E: الاعتماد النهائي، الإفراج الجماعي، وتوقيت Reveal (TC-AFR-001 إلى TC-AFR-014, TC-NFX-001 إلى TC-NFX-003)**: 17 مواصفة.
6. **فئة F: التجاوب، إمكانية الوصول، والمرونة (TC-MUX-001 إلى TC-MUX-008)**: 8 مواصفات.
7. **فئة G: بوابات التحقق وآلات الحالات (TC-GATE / TC-SM / TC-SEC-022 / TC-E2E-010 / TC-OBS-001)**: 12 مواصفة.

---

## 2. جدول مواصفات حالات الاختبار التفصيلي الـ 95 (Detailed 95 Test Specifications Matrix) `[REQUIRED_EXTENSION]`

### 2.1. فئة A: الأمن الصارم، الصلاحيات، وسياسات RLS (Security & RLS) `[REQUIRED_EXTENSION]`

| ID | عنوان حالة الاختبار | الدور المستهدف | الشروط المسبقة | خطوات التنفيذ | النتيجة المتوقعة | التصنيف | Future Test Layer | Requires Migration | Requires Runtime | Owner Decision Dep. |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| **TC-SEC-001** | تصحيح إجابة غير مخصصة | `grader` | تسجيل الدخول بدون Claim نشط | استدعاء دالة تقديم درجة لإجابة غير معينة | رفض الطلب واستثناء `ASSIGNMENT_NOT_FOUND` | `REQUIRED_EXTENSION` | `RPC` | YES | YES | NO |
| **TC-SEC-002** | إعطاء درجة تفوق الحد الأقصى | `grader` | max_score = 10 في snapshot | تقديم درجة بقيمة 12.5 | رفض الإدخال واستثناء `SCORE_EXCEEDS_MAX_BOUND` | `REQUIRED_EXTENSION` | `RPC` | YES | YES | NO |
| **TC-SEC-003** | تقديم درجة بالسالب | `grader` | إجابة سؤال مقالي نشطة | إرسال قيمة -1.0 للدرجة | رفض القيد واستثناء `INVALID_NEGATIVE_SCORE` | `EXISTING_QB01` | `DB_CONTRACT` | YES | YES | NO |
| **TC-SEC-004** | تعديل درجة معتمدة بشكل مباشر | `grading manager` | صف مراجعة is_final = true | تشغيل أمر UPDATE مباشر على الصف | فشل التعديل بتريجر `append-only` | `EXISTING_QB01` | `DB_CONTRACT` | YES | NO | NO |
| **TC-SEC-005** | محاولة حذف سجل مراجعة سابق | `admin emergency` | وجود صفوف في reviews | تنفيذ أمر DELETE على السجل | منع الحذف واستثناء `DELETE_BLOCKED_APPEND_ONLY` | `EXISTING_QB01` | `DB_CONTRACT` | YES | NO | NO |
| **TC-SEC-006** | محاولة المصحح نشر سؤال | `grader` | حساب مصحح عادي | استدعاء دالة نشر محتوى بنك الأسئلة | رفض الصلاحية واستثناء `FORBIDDEN_CAPABILITY` | `EXISTING_QB01` | `RLS` | YES | YES | NO |
| **TC-SEC-007** | محاولة الطالب رؤية الحل قبل Reveal | `student` | الدفعة قيد التصحيح ولم تفرج | استعلام دالة `v_question_responses_unified` | إرجاع بيانات الاستجابة دون حقول الحل | `REQUIRED_EXTENSION` | `RLS` | YES | YES | ODR-010 |
| **TC-SEC-008** | محاولة استعراض إجابة طالب آخر | `grader` | إجابة مخصصة لمصحح آخر | استعلام الإجابة بـ UUID المباشر | إرجاع 0 rows بسبب سياسة RLS | `REQUIRED_EXTENSION` | `RLS` | YES | YES | NO |
| **TC-SEC-009** | تصحيح مادة خارج التخصص | `grader` | مصحح معتمد للغة العربية فقط | المطالبة (Claim) لإجابة في الفيزياء | رفض القفل واستثناء `SUBJECT_ACCESS_DENIED` | `REQUIRED_EXTENSION` | `RPC` | YES | YES | NO |
| **TC-SEC-010** | تقديم درجة بعد انقضاء مهلة القفل | `grader` | انقضاء TTL القفل (Lease Expired) | تقديم الدرجة بعد التحرير بـ 10 ثوانٍ | رفض التقديم واستثناء `ASSIGNMENT_LEASE_EXPIRED` | `REQUIRED_EXTENSION` | `CONCURRENCY` | YES | YES | ODR-001 |
| **TC-SEC-011** | تقديم درجات متزامنة بنفس المفتاح | `grader` | إرسال طلبين متوازيين بنفس idempotency_key | تشغيل الطلبين في ذات اللحظة | نجاح الأول ورفض الثاني بـ `DUPLICATE_KEY` | `REQUIRED_EXTENSION` | `CONCURRENCY` | YES | YES | NO |
| **TC-SEC-012** | التلاعب بالطابع الزمني للتدقيق | `grader` | تقديم مراجعة جديدة | إرسال قيمة مخصصة قديمة لـ created_at | تجاهل مدخل العميل وتوليد وقت السيرفر | `EXISTING_QB01` | `RPC` | YES | YES | NO |
| **TC-SEC-013** | فحص صدور إشعارات قبل الاعتماد | `student` | درجة مسودة غير معتمدة | فحص جدول Outbox للإشعارات | خلو Outbox من أي إشعار موجه للطالب | `REQUIRED_EXTENSION` | `DB_CONTRACT` | YES | YES | ODR-010 |
| **TC-SEC-014** | محاولة أدوار المحتوى التصحيح | `publisher` / `editor` | حساب يملك دور publisher | تقديم درجة أو المطالبة بإجابة | الرفض المطلق للصلاحية بـ DENY | `REQUIRED_EXTENSION` | `RLS` | YES | YES | NO |
| **TC-SEC-015** | محاولة حفظ الدرجات بالذاكرة المحلية | `grader` | انقطاع الشبكة أثناء التصحيح | فحص محتويات localStorage للمتصفح | خلو التخزين المحلي تماماً من أي درجات | `REQUIRED_EXTENSION` | `E2E` | NO | YES | NO |
| **TC-SEC-016** | فحص تضارب المصالح المباشر | `system` | مصحح تربطه قرابة بطالب | محاولة مطالبة أو تخصيص إجابة الطالب | منع التخصيص وتوسيم الحالة بـ `FLAGGED_COI` | `REQUIRED_EXTENSION` | `RPC` | YES | YES | NO |
| **TC-SEC-017** | فحص خلو تضارب المصالح | `system` | مصحح لا تربطه أي قرابة بالطالب | المطالبة بإجابة الطالب في المادة | تمكين التعيين بنجاح وتوثيق `CLEARED` | `REQUIRED_EXTENSION` | `RPC` | YES | YES | NO |
| **TC-SEC-018** | التجاوز الاستثنائي بالطوارئ | `admin emergency` | حالة عطل قاهر في النظام | تنفيذ RPC التجاوز مع رمز الطوارئ والسبب | نجاح التجاوز مع توثيق كلي في Audit Trail | `OWNER_DECISION` | `RPC` | YES | YES | ODR-009 |
| **TC-SEC-019** | عزل استجابات الطلاب (Student RLS) | `student A` | حساب طالب عادي نشط | محاولة استعلام استجابات `student B` | إرجاع 0 rows نهائياً | `REQUIRED_EXTENSION` | `RLS` | YES | YES | NO |
| **TC-SEC-020** | منع الوصول المتقاطع للمواد | `grader` | تخصيص في المادة 101 | محاولة استعلام طابور المادة 202 | رفض الاستعلام بـ `CROSS_SUBJECT_DENIAL` | `REQUIRED_EXTENSION` | `RLS` | YES | YES | NO |
| **TC-SEC-021** | حظر الوصول للإجابة النموذجية | `student` | استعلام API قبل وقت Reveal | محاولة طلب حقل correct_answer | إرجاع NULL ومنع تسريب نموذج الحل | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-010 |

---

### 2.2. فئة B: قواعد احتساب الدرجات والحدود المعتمدة (Scoring & Pinned Bounds) `[REQUIRED_EXTENSION]`

| ID | عنوان حالة الاختبار | الدور المستهدف | الشروط المسبقة | خطوات التنفيذ | النتيجة المتوقعة | التصنيف | Future Test Layer | Requires Migration | Requires Runtime | Owner Decision Dep. |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| **TC-SCR-001** | احتساب مجموع بنود Rubrics الآلي | `grader` | سؤال بـ 3 بنود سعة كل بند 2 درجة | اختيار ممتاز في بندين وجيد في بند | تحديث إجمالي الدرجة آلياً ليكون 5.5 / 6.0 | `EXISTING_QB01` | `UNIT` | NO | YES | NO |
| **TC-SCR-002** | تقريب الدرجات الجزئية المعايرة | `grader` | سياسة تقريب المقرر لـ 0.25 | تقديم درجة محتسبة بقيمة 3.333 | تقريب الدرجة آلياً لـ 3.25 حسب السياسة | `OWNER_DECISION` | `RPC` | YES | YES | ODR-004 |
| **TC-SCR-003** | تقديم درجة صفر مع ملاحظات توجيهية | `grader` / `reviewer` | إجابة غير مرتبطة بالسؤال | اختيار درجة 0 وتعبئة ملاحظات التقصير | قبول التسليم بحالة `SUBMITTED_FOR_REVIEW` وحظر Finalize لـ Grader، ثم الاعتماد النهائي بواسطة Reviewer / Authorized Senior Grader | `EXISTING_QB01` | `RPC` | YES | YES | ODR-007 |
| **TC-SCR-004** | إغلاق التقديم عند ترك بند إجباري | `grader` | بند Rubric إجباري غير محدد | محاولة تقديم الدرجة | منع التسليم وإظهار تنبيه الاستكمال | `REQUIRED_EXTENSION` | `E2E` | NO | YES | NO |
| **TC-SCR-005** | مطابقة الحدود مع snapshot | `grader` | snapshot_max_score = 8.0 | محاولة إدخال درجة 8.5 | رفض التقديم بـ `SCORE_EXCEEDS_SNAPSHOT_MAX` | `REQUIRED_EXTENSION` | `RPC` | YES | YES | NO |
| **TC-SCR-006** | إنفاذ الحد الأدنى المطلق | `grader` | إجابة مقالية ضعيفة جداً | تقديم قيمة درجة -0.01 | رفض القيد الصارم بـ `INVALID_NEGATIVE_SCORE` | `EXISTING_QB01` | `DB_CONTRACT` | YES | YES | NO |
| **TC-SCR-007** | منع التعديل اليدوي المتناقض مع Rubric | `grader` | اختيار بنود مجموعها 4 درجات | محاولة كتابة 7 درجات حقول يدوية | رفض التباين وتأكيد مجموع بنود Rubric | `REQUIRED_EXTENSION` | `RPC` | YES | YES | NO |

---

### 2.3. فئة C: طابور العمل، الأقفال، المحاصرة، و SLA (Queue, Lease & Fencing) `[REQUIRED_EXTENSION]`

| ID | عنوان حالة الاختبار | الدور المستهدف | الشروط المسبقة | خطوات التنفيذ | النتيجة المتوقعة | التصنيف | Future Test Layer | Requires Migration | Requires Runtime | Owner Decision Dep. |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| **TC-QCL-001** | فلترة الطابور حسب المادة والأولوية | `grader` | وجود إجابات للامتحانات والتمارين | فتح صفحة الطابور | ظهور الامتحانات في الأعلى حسب الأولوية | `REQUIRED_EXTENSION` | `RPC` | YES | YES | NO |
| **TC-QCL-002** | إنشاء قفل المطالبة (Lease Lock) | `grader` | إجابة متاحة في الطابور | النقر على "مطالبة وتصحيح" | تحول الحالة لـ `CLAIMED` وبدء العد التنازلي | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-001 |
| **TC-QCL-003** | التحرير اليدوي للإجابة | `grader` | إجابة بحوزة المصحح بقفل نشط | النقر على زر "تحرير" مع كتابة السبب | عودة الإجابة للطابور وإبطال القفل | `REQUIRED_EXTENSION` | `RPC` | YES | YES | NO |
| **TC-QCL-004** | التحرير التلقائي عند الخمول | `system` | قفل مضى عليه 15 دقيقة دون إرسال | تشغيل job انقضاء المهل الزمني | تحويل التعيين لـ `EXPIRED` وتوفير الإجابة | `OWNER_DECISION` | `CONCURRENCY` | YES | YES | ODR-015 |
| **TC-QCL-005** | التصعيد التلقائي لتجاوز المهلة | `grading manager` | إجابة تجاوزت 24 ساعة في الامتحان | فحص لوحة المتابعة | ظهور الوسم `SLA_BREACH` وتصعيد الإشعار | `OWNER_DECISION` | `RPC` | YES | YES | ODR-002 |
| **TC-QCL-006** | سباق المطالبة الذري (Claim Race) | `grader A` / `B` | إجابة واحدة متاحة في الطابور | ضغط زر المطالبة من المصححين في آن واحد | نجاح مصحح واحد بـ Lock ورفض الآخر | `REQUIRED_EXTENSION` | `CONCURRENCY` | YES | YES | NO |
| **TC-QCL-007** | انقضاء القفل أثناء تحرير الملاحظات | `grader` | انتهاء TTL أثناء كتابة التقييم | محاولة الضغط على "تسليم الدرجة" | رفض الحفظ واستثناء `ASSIGNMENT_LEASE_EXPIRED` | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-001 |
| **TC-QCL-008** | رفض التقديم بـ Fencing Token قديم | `grader` | إعادة تعيين الإجابة لمصحح جديد | محاولة المصحح القديم الحفظ برمز قديم | رفض التقديم واستثناء `STALE_FENCING_TOKEN` | `REQUIRED_EXTENSION` | `RPC` | YES | YES | NO |
| **TC-QCL-009** | تجديد القفل عبر Heartbeat | `grader` | مصحح يكتب ملاحظات قبل انتهاء TTL | استدعاء دالة `heartbeat_assignment` | تمديد القفل 5 دقائق إضافية بنجاح | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-001 |
| **TC-QCL-010** | استرداد التعيين بقرار إداري (Reclaim) | `grading manager` | تعيين بطيء لم ينهِ التقييم | استدعاء RPC `reclaim_assignment` | إلغاء التعيين السابق وزيادة generation | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-015 |
| **TC-QCL-011** | فقدان القفل أثناء التقديم الشبكي | `grader` | انقطاع الشبكة وانقضاء TTL قبل الإرسال | استعادة الشبكة ومحاولة التسليم | رفض الحفظ واستعادة حالة الطابور النظيف | `REQUIRED_EXTENSION` | `E2E` | YES | YES | ODR-001 |
| **TC-QCL-012** | حظر التعديل التكراري على التعيين | `grader` | تعيين مكتمل بحالة `COMPLETED` | محاولة إرسال heartbeat جديد | رفض الطلب واستثناء `ASSIGNMENT_ALREADY_CLOSED` | `REQUIRED_EXTENSION` | `RPC` | YES | YES | NO |

---

### 2.4. فئة D: التصحيح المزدوج، التحكيم، والتظلمات (Double Marking & Appeals) `[REQUIRED_EXTENSION]`

| ID | عنوان حالة الاختبار | الدور المستهدف | الشروط المسبقة | خطوات التنفيذ | النتيجة المتوقعة | التصنيف | Future Test Layer | Requires Migration | Requires Runtime | Owner Decision Dep. |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| **TC-DMA-001** | التصحيح المزدوج المستقل المعزول | `grader 1` / `2` | إجابة مخصصة للتصحيح المزدوج | تصحيح المصحح 1 ثم تصحيح المصحح 2 | إخفاء تقييم وملاحظات كل مصحح عن الآخر | `REQUIRED_EXTENSION` | `RLS` | YES | YES | ODR-014 |
| **TC-DMA-002** | رصد الانحراف وتحويل الإجابة للتحكيم | `system` | درجة الأول 9/10 والثاني 4/10 | تسجيل التقييمين في السجل | رصد تباين > 15% وتحويلها لـ `Arbitration` | `OWNER_DECISION` | `RPC` | YES | YES | ODR-004 |
| **TC-DMA-003** | قرار التحكيم المستقل من Senior Grader | `independent senior grader` | إجابة في طابور التحكيم (تباين > 15%)، المحكّم مستقل لم يشارك بالتصحيحين ولا COI وله scoped assignment وcapability صريحة | استعراض التقييمين وإصدار القرار المحكّم عبر `arbitrate_double_mark` | إنتاج الدرجة المحكّمة المقترحة بحالة `ARBITRATED_SCORE_READY_FOR_FINALIZATION` وعدم تنفيذ الاعتماد النهائي `FINALIZED` مباشرة | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-008 |
| **TC-DMA-004** | تقديم الطالب لتظلم خلال النافذة | `student` | نشر النتيجة وانقضاء أقل من 7 أيام | تقديم طلب تظلم مرفق بالمبررات | تسجيل التظلم بـ `APPEALED` وتعيينه لمراجع | `OWNER_DECISION` | `RPC` | YES | YES | ODR-006 |
| **TC-DMA-005** | مراجعة التظلم وتحديث الدرجة | `reviewer` | طلب تظلم مخصص للمراجع | استعراض الإجابة والاعتراض وإصدار القرار | إدراج صف تصحيحي جديد وتحديث النتيجة | `REQUIRED_EXTENSION` | `RPC` | YES | YES | NO |
| **TC-DMA-006** | حظر سرية التصحيح المزدوج (Blind) | `grader 1` | عدم تسليم تقييمه بعد | استعلام API لتقييم المصحح المناظر | إرجاع NULL ومنع رؤية تقييم المصحح الثاني | `REQUIRED_EXTENSION` | `RLS` | YES | YES | NO |
| **TC-DMA-007** | التسليم التزامني للمصححين المزدوجين | `grader 1` / `2` | تسليم التقييمين في ذات اللحظة | تشغيل RPC `submit` بشكل متوازٍ | حفظ التقييمين بنجاح دون تضارب مفاتيح | `REQUIRED_EXTENSION` | `CONCURRENCY` | YES | YES | NO |
| **TC-DMA-008** | التقييم المزدوج المتوافق (احتساب المتوسط دون اعتماد تلقائي) | `system` / `reviewer` | درجة الأول 8/10 والثاني 8.5/10 | تسليم التقييمين بحساب تباين 5% (ODR-004) | احتساب المتوسط 8.25 (ODR-013) وتحويل الحالة لـ `READY_FOR_FINALIZATION` ومنع الاعتماد التلقائي للنظام، ثم الاعتماد بواسطة Reviewer / Authorized Senior Grader | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-013 |
| **TC-DMA-009** | رفض تحكيم الإجابة من مصحح أولي | `grader 1` | لا يملك صلاحية `arbitrate` | محاولة استدعاء RPC التحكيم | رفض الصلاحية واستثناء `FORBIDDEN_CAPABILITY` | `REQUIRED_EXTENSION` | `RLS` | YES | YES | NO |
| **TC-DMA-010** | استقلالية مراجع الاعتراض (COI) | `grader 1` | قام بالتصحيح الأصلي للإجابة | محاولة تعيينه أو قبوله لمراجعة التظلم | منع التعيين آلياً بسبب تضارب المصالح | `REQUIRED_EXTENSION` | `RPC` | YES | YES | NO |
| **TC-DMA-011** | محاولة المراجع تنفيذ التحكيم | `reviewer` | إجابة في طابور التحكيم | محاولة المراجع استدعاء RPC التحكيم `arbitrate_double_mark` | رفض الطلب واستثناء `FORBIDDEN_CAPABILITY` | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-008 |
| **TC-DMA-012** | محاولة مدير التصحيح تنفيذ التحكيم | `grading manager` | إجابة في طابور التحكيم | محاولة المدير استدعاء RPC التحكيم `arbitrate_double_mark` | رفض الطلب واستثناء `FORBIDDEN_CAPABILITY` | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-008 |
| **TC-DMA-013** | محاولة مشغل الطوارئ تنفيذ التحكيم | `admin emergency` | إجابة في طابور التحكيم | محاولة مشغل الطوارئ استدعاء RPC التحكيم `arbitrate_double_mark` | رفض الطلب واستثناء `FORBIDDEN_CAPABILITY` | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-008 |
| **TC-DMA-014** | محاولة المصحح الأول الأصلي تنفيذ التحكيم | `primary grader` | قام بالتصحيح الأول للإجابة | محاولة المصحح الأول حسم التحكيم | رفض التعيين والتحكيم واستثناء `COI_ORIGINAL_GRADER` | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-008 |
| **TC-DMA-015** | محاولة المصحح الثاني المناظر تنفيذ التحكيم | `counterpart grader` | قام بالتصحيح الثاني للإجابة | محاولة المصحح المناظر حسم التحكيم | رفض التعيين والتحكيم واستثناء `COI_ORIGINAL_GRADER` | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-008 |
| **TC-DMA-016** | محاولة محكّم senior يملك تضارب مصالح | `senior grader` | وجود قرابة أو تضارب مصالح COI مع الطالب | محاولة المطالبة والتحكيم للإجابة | رفض التكليف والتحكيم واستثناء `FLAGGED_COI` | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-008 |
| **TC-DMA-017** | محاولة محكّم senior دون تكليف محدد | `senior grader` | عدم وجود تكليف scoped assignment محدد للمادة | محاولة استدعاء RPC التحكيم | رفض الطلب واستثناء `OUT_OF_SCOPE` | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-008 |
| **TC-DMA-018** | محاولة محكّم senior دون صلاحية تحكيم صريحة | `senior grader` | عدم تمكين capability التحكيم صراحة للمستخدم | محاولة حسم التباين عبر RPC التحكيم | رفض الطلب واستثناء `FORBIDDEN_CAPABILITY` | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-008 |

---

### 2.5. فئة E: الاعتماد النهائي، سجل التدقيق، وتوقيت الإفراج (Finalization & Outbox) `[REQUIRED_EXTENSION]`

| ID | عنوان حالة الاختبار | الدور المستهدف | الشروط المسبقة | خطوات التنفيذ | النتيجة المتوقعة | التصنيف | Future Test Layer | Requires Migration | Requires Runtime | Owner Decision Dep. |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| **TC-AFR-001** | الاعتماد النهائي الذري للدرجة | `reviewer` / `authorized senior grader` | إجابة مكتملة التصحيح | الضغط على "اعتماد نهائي" مع السبب | تحول is_final لـ true واشتراط reason | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-007 |
| **TC-AFR-002** | إعادة حساب مجموع الجلسة | `system` | اعتماد آخر إجابة مقالية في الامتحان | فحص مجموع درجات الجلسة | التحديث الآلي لـ final_score للجلسة | `EXISTING_QB01` | `DB_CONTRACT` | YES | YES | NO |
| **TC-AFR-003** | تتبع السجل التتابعي (Append-Only) | `grading manager` | إجراء عدة تصحيحات وتعديلات | استعلام جدول reviews المباشر | ظهور الصفوف بالتسلسل دون حذف أو تعديل | `EXISTING_QB01` | `DB_CONTRACT` | YES | NO | NO |
| **TC-AFR-004** | حظر كشف الحل قبل الإفراج المعتمد | `student` | درجة معتمدة والدفعة لم تفرج بعد | محاولة فتح نموذج الإجابة والشرح | بقاء الحل مخفياً حتى وقت Reveal المحدد | `REQUIRED_EXTENSION` | `RLS` | YES | YES | ODR-010 |
| **TC-AFR-005** | الإفراج الجماعي عن نتائج الدفعة | `grading manager` | اكتمال تصحيح الدفعة بالكامل | النقر على "اعتماد ونشر نتائج الدفعة" | تحول الدفعة لـ RELEASED وتوليد Outbox | `OWNER_DECISION` | `RPC` | YES | YES | ODR-010 |
| **TC-AFR-006** | الاعتماد النهائي للامتحان الرسمي | `reviewer` / `authorized senior grader` | امتحان رسمي نهائي مغلق | تنفيذ الاعتماد مع اشتراط السبب | قفل الدرجات وتحويل الدفعة للجاهزية | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-007 |
| **TC-AFR-007** | الإفراج الفوري المباشر لنتائج الممارسة التدريبية (Practice IMMEDIATE Release) | `grader` / `reviewer` / `student` | محاولة تدريب حرة بموجه IMMEDIATE | تقديم المصحح (Grader) للتقييم ثم اعتماد الدرجة نهائياً بواسطة (Reviewer / Authorized Senior Grader) | إتاحة النتيجة فوراً وتوليد Outbox دون انتظار الدفعة | `OWNER_DECISION` | `RPC` | YES | YES | ODR-016 |
| **TC-AFR-008** | التعديل التزامني الاستثنائي | `manager A` / `B` | محاولة فتح مراجعة استثنائية معاً | استدعاء RPC `reopen_review` متوازياً | حفظ الصفين التتابعيين بسلسلة supersession | `REQUIRED_EXTENSION` | `CONCURRENCY` | YES | YES | ODR-009 |
| **TC-AFR-009** | التعديل التتابعي بصف تصحيحي | `grading manager` | درجة معتمدة نهائياً مر عليها 3 أيام | إجراء تعديل استثنائي بسبب خطأ مادي | إضافة صف جديد بـ previous_score دون UPDATE | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-009 |
| **TC-AFR-010** | حد التوقيت الزمني لكشف الحل | `student` | انقضاء تاريخ Reveal بـ 1 ثانية | طلب استعلام الإجابة النموذجية | كشف نموذج الحل بنجاح للطالب | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-010 |
| **TC-AFR-011** | التثبت الزمني عبر UTC Boundary | `system` | اختلاف التوقيت المحلي للمستخدم | استعلام شروط Reveal بحسب وقت UTC | اعتماد توقيت UTC ومنع الالتفاف بالتوقيت | `REQUIRED_EXTENSION` | `RPC` | YES | YES | NO |
| **TC-AFR-012** | الإفراج المؤجل لنتائج الممارسة التدريبية (Practice DELAYED Release) | `system` / `scheduler` | محاولة تدريبية معتمدة بموجه DELAYED وزمن reveal_at مستقبلي | تشغيل المجدول/Worker عند انقضاء الوقت بـ UTC | الإفراج بـ reveal_at مع معالجة Timezone والموثوقية عدم التكرار | `OWNER_DECISION` | `WORKER` | YES | YES | ODR-016 |
| **TC-AFR-013** | إفراج دفعة الممارسة التدريبية (Practice BATCH Release) | `grading manager` | نشاط تدريبي بموجه BATCH واكتمال الدفعة | استدعاء RPC الإفراج الجماعي بواسطة Manager | التحقّق من التكليف واكتمال الدفعة وتغيير الحالة لـ RELEASED | `OWNER_DECISION` | `RPC` | YES | YES | ODR-016 |
| **TC-AFR-014** | حظر الاعتماد التلقائي للنظام والجهات غير المخولة | `system` / `manager` | إجابة بحالة SUBMITTED_FOR_REVIEW | محاولة الاعتماد المباشر من System أو Manager أو Emergency | رفض الاعتماد واستثناء FORBIDDEN_FINALIZATION_AUTHORITY | `REQUIRED_EXTENSION` | `RPC` | YES | YES | ODR-007 |
| **TC-NFX-001** | إعادة إرسال الإشعارات عند التعثر | `system` | تعثر موجه الإشعارات في المحاولة 1 | تشغيل job إعادة المحاولة (Backoff) | نجاح الإرسال في المحاولة 2 وتحديث Outbox | `REQUIRED_EXTENSION` | `CONCURRENCY` | YES | YES | NO |
| **TC-NFX-002** | كبح الإشعارات المكررة (Deduplication) | `system` | توليد حدثين بنفس idempotency_key | معالجة الرسالتين في Outbox | إرسال إشعار واحد فقط وكبح الثاني | `REQUIRED_EXTENSION` | `RPC` | YES | YES | NO |
| **TC-NFX-003** | إرسال إشعار تعديل الدرجة بعد التظلم | `student` | قبول التظلم وتعديل الدرجة بصف جديد | فحص رسائل Outbox المتولدة | إرسال إشعار تصحيحي مفصل للطالب | `REQUIRED_EXTENSION` | `RPC` | YES | YES | NO |

---

### 2.6. فئة F: التجاوب، إمكانية الوصول، والمرونة (Mobile UX, Accessibility & Resilience) `[REQUIRED_EXTENSION]`

| ID | عنوان حالة الاختبار | الدور المستهدف | الشروط المسبقة | خطوات التنفيذ | النتيجة المتوقعة | التصنيف | Future Test Layer | Requires Migration | Requires Runtime | Owner Decision Dep. |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: | :---: |
| **TC-MUX-001** | اتجاه الواجهة الفصيح من اليمين لليسار | `grader` | تصفح المنصة باللغة العربية | فتح شاشة التصحيح والطابور | محاذاة كافة العناصر من اليمين لليسار بدقة | `EXISTING_QB01` | `UX_ACCESSIBILITY` | NO | YES | NO |
| **TC-MUX-002** | عرض النصوص ثنائية الاتجاه (BiDi) | `grader` | إجابة تحتوي نص عربي وكود C++ | استعراض الإجابة المقالية | محاذاة النص العربي يميناً والكود يساراً | `EXISTING_QB01` | `UX_ACCESSIBILITY` | NO | YES | NO |
| **TC-MUX-003** | قياس أهداف اللمس على الجوال | `grader` | شاشة جوال بمقاس 375px | النقر على أزرار التقييم | استجابة لمسية سهلة لأزرار $\ge 48\text{px}$ | `EXISTING_QB01` | `UX_ACCESSIBILITY` | NO | YES | NO |
| **TC-MUX-004** | التفاعل مع الدرج السفلي لـ Rubric | `grader` | فتح شاشة التصحيح على الجوال | سحب الدرج السفلي Bottom Sheet | انزلاق الدرج بسلاسة واستعراض البنود | `EXISTING_QB01` | `UX_ACCESSIBILITY` | NO | YES | NO |
| **TC-MUX-005** | التعافي بعد انقطاع الشبكة المفاجئ | `grader` | انقطاع الشبكة أثناء كتابة الملاحظات | إعادة الاتصال والضغط على "حفظ" | استعادة الجلسة بنجاح بالحفاظ على المدخلات | `REQUIRED_EXTENSION` | `E2E` | NO | YES | NO |
| **TC-MUX-006** | التنقل الكامل عبر لوحة المفاتيح | `grader` | تصفح الواجهة بدون ماوس | التنقل باستخدام Tab / Shift+Tab / Enter | التنقل السلس بين البنود دون فقدان Focus | `REQUIRED_EXTENSION` | `UX_ACCESSIBILITY` | NO | YES | NO |
| **TC-MUX-007** | التسميات التوضيحية لقارئ الشاشة | `grader` | تفعيل قارئ الشاشة (NVDA / TalkBack) | المرور على أزرار Rubric ومؤقت القفل | قراءة التسميات ARIA Labels بوضوح تام | `REQUIRED_EXTENSION` | `UX_ACCESSIBILITY` | NO | YES | NO |
| **TC-MUX-008** | استعادة التركيز الذكي (Focus Restoration) | `grader` | إغلاق نافذة التحرير أو الدرج السفلي | إغلاق المودال بالضغط على Esc | استعادة التركيز للعنصر المحفز السابق | `REQUIRED_EXTENSION` | `UX_ACCESSIBILITY` | NO | YES | NO |

---


### 2.7. فئة G: بوابات التحقق وآلات الحالات (Gates & State Machines) `[REQUIRED_EXTENSION]`

| ID | عنوان حالة الاختبار | الاسم المعياري | المهمة المانعة | الأهمية | السلوك المتوقع / النتيجة | النتيجة |
| :--- | :--- | :--- | :--- | :---: | :--- | :---: |
| **TC-GATE-001** | فحص إنفاذ بوابات قرارات المالك قبل الإطلاق | Owner Gates Enforcement | `TASK-MG-080` | `HIGH` | وجود قرار مالك مفتوح يمنع صدور قرار الجاهزية PASS | `FAIL` |
| **TC-SEC-022** | فحص فشل البوابة الأمنية عند سقوط أي حالة اختبار إلزامية | Security Gate Failure on Mandatory Control | `TASK-MG-075` | `CRITICAL` | رسوب حالة واحدة من الـ 13 حالة يغير نتيجة TASK-MG-075 إلى FAIL | `FAIL` |
| **TC-E2E-010** | فحص فشل بوابة E2E عند تعثر أي حزمة اختبار | E2E Gate Failure on Mandatory Suite | `TASK-MG-079` | `CRITICAL` | تعثر مسار واحد من الـ 10 حزم يغير نتيجة TASK-MG-079 إلى FAIL | `FAIL` |
| **TC-OBS-001** | فحص حظر الإطلاق عند عدم تفعيل المراقبة والتنبيهات | Observability Inactive Blocks Launch | `TASK-MG-080` | `HIGH` | عدم تفعيل التنبيهات أو المؤشرات يمنع اعتماد الإطلاق | `FAIL` |
| **TC-GATE-002** | فحص حظر الإطلاق عند وجود ملاحظات عالية أو حرجة مفتوحة | High / Critical Findings Block Launch | `TASK-MG-080` | `CRITICAL` | وجود ثغرة أو انحراف حرج مفتوح يمنع الاعتماد | `FAIL` |
| **TC-GATE-003** | فحص حظر الإطلاق عند عدم إثبات مسار التراجع | Rollback Failure Blocks Launch | `TASK-MG-080` | `HIGH` | فشل التحقق من مسار التراجع يمنع الإطلاق | `FAIL` |
| **TC-SM-001** | فحص دورة حياة آلة حالات التظلمات والاعتراضات | Appeal Lifecycle Transitions | `TASK-MG-055` | `HIGH` | التحقق من كافة الانتقالات ومسارات الخروج للحالات غير النهائية | `PASS` |
| **TC-SM-002** | فحص دورة حياة آلة حالات الدفعة والإفراج | Batch Lifecycle Transitions | `TASK-MG-062` | `HIGH` | التحقق من انتقالات الدفعة والإعادة والإلغاء وفق الصلاحية | `PASS` |
| **TC-SM-003** | فحص دورة حياة آلة حالات صندوق الإشعارات Outbox | Outbox Lifecycle Transitions | `TASK-MG-064` | `HIGH` | التحقق من المطالبة والتأكيد والإعادة والحجز الزمني | `PASS` |
| **TC-SM-004** | فحص تحويل الإشعارات المتعثرة إلى DLQ وسلطة Replay | Outbox Dead-Letter & Replay Authority | `TASK-MG-065` | `HIGH` | التحقق من التحويل للـ DLQ بعد تجاوز المحاولات وحصر Replay بـ Admin | `PASS` |
| **TC-SM-005** | فحص رفض الانتقالات التنفيذية بين الكائنات المختلفة | Mixed-Machine Transition Rejection | `TASK-MG-075` | `CRITICAL` | حظر خلط حالات Response مع Review Row أو Assignment أو Appeal | `REJECTED` |
| **TC-SM-006** | فحص كشف وتجنيب الحالات غير النهائية الميتة | Non-Terminal State Dead-End Detection | `TASK-MG-080` | `HIGH` | إثبات وجود مسار خروج لكل حالة غير نهائية في آلات الحالات الـ 6 | `PASS` |

---

## 3. مراجعة وتأكيد إحصائيات مواصفات حالات الاختبار (Verification Summary Block) `[REQUIRED_EXTENSION]`

```
============================================================
           مصفوفة التثبت الإحصائي لمواصفات حالات الاختبار
============================================================
- إجمالي مواصفات حالات الاختبار (Specifications):   95 مواصفة فريدة
- حالات الاختبار البرمجية التنفيذية (Executable):  0
- حالة الأتمتة (Automation Status):               Planned in future implementation
- المعرفات الفريدة (Unique IDs):                    95 / 95
- حالات الاختبار المفقودة (Missing):                0
- حالات الاختبار المكررة (Duplicate):               0
- التغطية لكافة فئات الأمان والمنطق والـ UX:         100%
============================================================
```

---
*نهاية الوثيقة MANUAL-GRADING-TEST-MATRIX-01 (Canonical Correction 07)*