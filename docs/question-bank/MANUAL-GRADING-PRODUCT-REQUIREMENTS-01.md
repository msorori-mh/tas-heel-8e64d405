# MANUAL-GRADING-PRODUCT-REQUIREMENTS-01
## متطلبات منتج محرك التصحيح اليدوي وتجربة المراجعة الموحدة — التصحيح القانوني المعتمد 03

> **وثيقة تصميم المنتج والمعمارية الوظيفية (Product & Functional Requirements Document)**
> **الإصدار:** 3.0.0 (Canonical Correction 03)
> **الحالة:** مجمد للتصميم الوثائقي فقط (Design Frozen - Docs Only / No Code / No SQL Execution / No DB / No Deploy)
> **النظام:** منصة تسهيل التعليمية (Tas-heel Engine - Question Bank QB-01)

---

## 1. نظرة عامة ورسالة النظام (Product Vision & Executive Summary) `[EXISTING_QB01]`

هدف **محرك التصحيح اليدوي (Manual Grading Engine)** في منصة تسهيل هو تقديم بنية تحتية متكاملة عالية الأمان والنزاهة لإدارة وتصحيح الأسئلة المقالية، القصيرة، والمهام الأكاديمية التي تتطلب تخصصاً بشرياً لمراجعتها، مع الالتزام التام بمعمارية بنك الأسئلة الموحد **QB-01**.

### 1.1. قواعد توحيد نموذج الأدوار والصلاحيات (Role Model Unification & Boundaries) `[REQUIRED_EXTENSION]`

> [!IMPORTANT]
> **نص صريح بشأن نموذج أدوار التطبيق (app_role):**
> 1. أدوار التطبيق المعتمدة حالياً في النظام (`app_role`) تبقى كما هي دون تغيير:
>    - `admin`
>    - `moderator`
>    - `user`
>    - `content_manager`
> 2. **يُمنع منعاً باتاً توسيع enum `app_role`** لإضافة أي أدوار خاصة بالتصحيح اليدوي مثل: (`grader`, `senior grader`, `reviewer`, `grading manager`, `admin emergency operator`).
> 3. أدوار التصحيح اليدوي تُعرّف مفاهيمياً وتشغيلياً وفق العناصر الأربعة التالية:
>    - **شخصيات الطابور (Queue Personas)**: واجهات وسلوكيات مستخدم مخصصة حسب طبيعة العمل.
>    - **حزم القدرات (Capability Bundles)**: مجموعات صلاحيات أمنية دقيقة مبنية على `capabilities`.
>    - **التعيينات المحدودة بالنطاق (Scoped Assignments)**: قيود وصول مرتبطة بالمادة (`subject_scope`) وبطابور التعيين النشط.
>    - **السياسات التشغيلية (Operational Policies)**: قواعد وإجراءات إنفاذ المهل والجودة والتحكيم.
> 4. دور `content_manager` لا يصبح `grader` أو `publisher` تلقائياً، بل يتطلب منح صلاحيات صريحة مستقلة.
> 5. دور `admin` لا يملك تجاوزاً شاملاً تلقائياً (No Global Bypass)؛ بل تخضع كل عملية لقيود RLS والأختام الزمنية وشروط التوثيق الأكاديمي.

---

## 2. التكامل مع بنك الأسئلة QB-01 ونموذج القدرات (Capability Mapping & QB-01 Integration) `[REQUIRED_EXTENSION]`

### 2.1. مصادر استجابات الطلاب (Response Sources) `[EXISTING_QB01]`
يتعامل المحرك مع مصدرين أساسيين للإجابات عبر علاقة XOR المزدوجة (Dual FK Constraints):
- **`exam_session_answers`**: استجابات الطلاب أثناء الامتحانات الرسمية والمرحلية.
- **`practice_attempt_responses`**: استجابات الطلاب أثناء المحاولات التدريبية والتمارين الحرة.

### 2.2. جدول المراجعات والتصحيح (Append-Only Review Repository) `[EXISTING_QB01]`
- **`question_response_reviews`**: الجدول الرئيسي المقفل أمنياً بحظر الـ UPDATE/DELETE. يحتوي على: `id`, `exam_answer_id` / `practice_response_id` (XOR), `grader_id`, `score_awarded`, `feedback`, `previous_score`, `reason`, `is_final`, `action_id`, `idempotency_key`, `created_at`.

### 2.3. خريطة ربط الصلاحيات المقترحة بنموذج QB-01 الفعلي (Capability Mapping Table) `[REQUIRED_EXTENSION]`

تعتمد البنية الأمنية على القدرة الفعلية الموجودة في QB-01: **`GRADE_MANUAL_RESPONSE`**، وتربط بقية العمليات المقترحة بامتدادات جديدة واضحة دون ادعاء وجودها المسبق:

| Capability المقترحة | الوصف التشغيلي | الربط بنموذج QB-01 الفعلي | التصنيف الهيكلي |
| :--- | :--- | :--- | :--- |
| `grading.queue.read` | عرض وقراءة طابور الإجابات | مشتقة من `GRADE_MANUAL_RESPONSE` مع RLS | `REQUIRED_EXTENSION` |
| `grading.claim.execute` | المطالبة بقفل إجابة في الطابور | امتداد جديد لآلية التعيين الذاتي | `REQUIRED_EXTENSION` |
| `grading.release.execute` | تحرير قفل إجابة وإعادتها للطابور | امتداد جديد لإدارة أقفال التعيين | `REQUIRED_EXTENSION` |
| `grading.score.submit` | تقديم درجة أولية وملاحظات | **تطابق مباشر مع `GRADE_MANUAL_RESPONSE`** | `EXISTS_IN_QB01` |
| `grading.score.finalize` | الاعتماد النهائي للدرجة | امتداد لإنفاذ `is_final = true` | `REQUIRED_EXTENSION` |
| `grading.review.return` | إعادة الإجابة للتعديل للمصحح الأول | امتداد جديد لمراجعة الجودة | `REQUIRED_EXTENSION` |
| `grading.reopen.execute` | فتح مراجعة استثنائية لدرجة معتمدة | امتداد جديد مع قيد السبب الإجباري | `REQUIRED_EXTENSION` |
| `grading.appeal.process` | معالجة وتعديل التظلمات | امتداد جديد لمسار التظلمات المستقل | `REQUIRED_EXTENSION` |
| `grading.double_mark.arbitrate` | التحكيم في التصحيح المزدوج | امتداد جديد لحسم انحراف التقييم | `REQUIRED_EXTENSION` |
| `grading.audit.read` | قراءة سجل التدقيق التتابعي | امتداد لقراءة `question_response_reviews` | `REQUIRED_EXTENSION` |
| `grading.batch.release` | الاعتماد ونشر نتائج الدفعة | خاضع لقرار المالك والسياسة التشغيلية | `OWNER_DECISION` |
| `grading.emergency.override` | التجاوز الاستثنائي في الطوارئ | خاضع لقرار المالك وضوابط Audit | `OWNER_DECISION` |

---

## 3. نموذج التعيينات والقفل المؤقت (Assignments, Lease Locks & Fencing Token Model) `[REQUIRED_EXTENSION]`

### 3.1. كيان التعيين (`grading_assignments`) `[REQUIRED_EXTENSION]`
يتم إدارة عمليات التخصيص والمطالبة عبر الكيان الموحد `grading_assignments` الذي يشتمل على الحقول التالية:
- `id`: المعرف الفريد للتعيين (UUID).
- `response_id`: معرف الإجابة (مربوط بـ `exam_answer_id` أو `practice_response_id`).
- `grader_user_id`: معرف المصحح المخصص له المهمة.
- `assignment_role`: شخصية التعيين (`PRIMARY_GRADER`, `COUNTERPART_GRADER`, `ARBITRATOR`, `APPEAL_REVIEWER`).
- `assignment_generation`: رقم جيل التعيين (يتزايد عند كل إعادة تخصيص لمنع التضارب).
- `lease_token`: رمز القفل المؤقت المشفر الفريد.
- `lease_acquired_at`: الطابع الزمني لبدء القفل.
- `lease_expires_at`: الطابع الزمني لانتهاء القفل (TTL الافتراضي 15 دقيقة خاضع لقرار المالك).
- `heartbeat_at`: آخر طابع زمني لتأكيد النشاط.
- `released_at`: طابع زمني للتحرير في حال الإلغاء اليدوي أو التلقائي.
- `status`: حالة التعيين (`ASSIGNED`, `CLAIMED`, `EXPIRED`, `RELEASED`, `COMPLETED`).
- `subject_scope`: نطاق المادة الدراسية للمطابقة.
- `assigned_by`: معرف من قام بالتعيين (`SYSTEM_AUTO`, `GRADING_MANAGER_ID`).
- `conflict_of_interest_status`: نتيجة فحص تضارب المصالح (`CLEARED`, `FLAGGED_COI`).

### 3.2. عقود الدوال الذرية (Atomic RPC Contracts) `[REQUIRED_EXTENSION]`
تتم جميع العمليات التشغيلية عبر عقود RPC ذرية محصنة بالسيرفر:

1. **`claim_assignment(p_response_id, p_user_id)`**:
   - تحقق من عدم وجود قفل نشط ومن مطابقة التخصص وعدم وجود تضارب مصالح.
   - تنشئ/تحدث صف `grading_assignments` وتولد `lease_token` و `assignment_generation`.
   - ترجع: `{ lease_token, fencing_token, lease_expires_at, assignment_generation }`.

2. **`heartbeat_assignment(p_lease_token, p_fencing_token)`**:
   - تحقق من صحة `lease_token` و `fencing_token` وأن القفل لم ينقضِ.
   - تمدد `lease_expires_at` لمدة 5 دقائق إضافية (بما لا يتجاوز الحد الأقصى التراكمي).

3. **`release_assignment(p_lease_token, p_reason)`**:
   - تحرر القفل يدويّاً وتحول الحالة إلى `RELEASED` وتلغي صلاحية `lease_token`.

4. **`submit_graded_score(p_lease_token, p_fencing_token, p_score, p_rubric_items, p_feedback, p_idempotency_key)`**:
   - **التحقق الذري الصارم**: مطابقة `fencing_token` مع `assignment_generation` وتأكيد أن `lease_expires_at > now()`.
   - إدراج التقييم في `question_response_reviews` بشكل تتابعي Append-Only.

5. **`expire_assignments_job()`**:
   - دالة خلفية دورية تحول التعيينات المنتهية (`lease_expires_at < now() AND status = 'CLAIMED'`) إلى `EXPIRED` وتطلق الإجابات للطابور.

6. **`reclaim_assignment(p_response_id, p_manager_id, p_new_grader_id)`**:
   - إلغاء التعيين السابق وتوليد `assignment_generation` جديد لمنع أي تقديم متأخر من المصحح السابق.

### 3.3. آلية رمز المحاصرة (Fencing Token Mechanism) `[REQUIRED_EXTENSION]`
لمنع مشكلة تقديم التقييم بعد انتهاء القفل (Stale Write Condition)، يُولد النظام `fencing_token` مركب من التركيب التتابعي لـ `assignment_generation + lease_token`. إذا انقضت المهلة أو قام النظام بإعادة تعيين الإجابة لمصحح آخر، يتغير `assignment_generation` آلياً، مما يجعل أي رمز محاصرة قديم غير صالح ويؤدي لرفض عملية الحفظ فوراً باستثناء `STALE_FENCING_TOKEN`.

---

## 4. نموذج التصحيح المزدوج والتعمية (Double Marking Architecture & Blind Evaluation) `[REQUIRED_EXTENSION]`

لا يعتمد النظام على حقل `assigned_grader_id` المفرد للتصحيح المزدوج، بل يبني المعمارية التالية:

```
                  [استجابة مخصصة للتصحيح المزدوج]
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼                                               ▼
[تعيين مستقل 1: Grader A]                      [تعيين مستقل 2: Grader B]
(Gen: 1, Generation Lock)                      (Gen: 2, Generation Lock)
        │                                               │
        ▼ (Blind Grading - معزول تماماً)                 ▼ (Blind Grading - معزول تماماً)
[تقييم Grader A -> reviews]                   [تقييم Grader B -> reviews]
        │                                               │
        └───────────────────────┬───────────────────────┘
                                ▼
                   [حساب التباين آلياً (Variance)]
                                │
        ┌───────────────────────┴───────────────────────┐
        ▼ (|Diff| <= Threshold)                         ▼ (|Diff| > Threshold)
[اعتماد الدرجة النهائية (FINALIZED)]            [تحويل لطابور التحكيم (Arbitration)]
                                                        │
                                                        ▼
                                           [تعيين مستقل 3: Senior Grader]
                                           [حسم الدرجة والاعتماد (FINALIZED)]
```

- **تعيينان مستقلان على الأقل**: تعيين صفين مستقلين في `grading_assignments` بقيمتي `PRIMARY_GRADER` و `COUNTERPART_GRADER`.
- **عزل التقييم (Blind Grading Isolation)**: يُمنع المصحح الأول من رؤية درجة، ملاحظات، أو وجود المصحح الثاني حتى يستكمل تقييمه بالكامل ويُسجل في السجل التتابعي.
- **حساب الانحراف (Variance Calculation)**:
  $$\text{Variance} = \frac{|\text{Score}_1 - \text{Score}_2|}{\text{max\_score}} \times 100\%$$
- **إحالة التحكيم (Arbitration Assignment)**: إذا تجاوز التباين الحد المسموح (الافتراضي Proposed 15% - خاضع لقرار المالك)، تُحول الإجابة تلقائياً إلى شخصية `senior grader` للتحكيم.
- **حسم الدرجة النهائية والسجل التتابعي**: يصدر المحكم التقييم النهائي المستقل ويتم إدراجه كصف جديد بصفة `FINALIZED` دون مسح التقييمين السابقين.

---

## 5. آلة الحالات الموحدة مع بنك الأسئلة QB-01 (Unified State Machine) `[REQUIRED_EXTENSION]`

تم توحيد مسميات الحالات وانتقالاتها رسمياً مع معايير QB-01 وتجنب المصطلحات البديلة:

```
 [UNASSIGNED] ─────(claim)─────> [CLAIMED] ─────(submit)─────> [SUBMITTED]
      │                             │                              │
 (auto-assign)                      ▼ (lease expired)              ▼ (variance check / review)
      │                        [UNASSIGNED]            ┌───────────┴───────────┐
      ▼                                                ▼                       ▼
  [ASSIGNED] ───────────────────────────> [RETURNED_FOR_SECOND_REVIEW]  [FINALIZED]
                                                       │                       │
                                                 (re-evaluate)             (reopen/appeal)
                                                       │                       │
                                                       ▼                       ▼
                                                  [SUBMITTED]        [REOPENED] / [APPEALED]
                                                                               │
                                                                               ▼
                                                                          [SUPERSEDED]
```

### 5.1. مصفوفة mapping الحالات المعتمدة:
- **`UNASSIGNED`**: الإجابة جاهزة في الطابور العام ولم تُخصص لمصحح بعد.
- **`ASSIGNED`**: الإجابة مخصصة لمصحح محدد ولم يبدأ التحرير عليها بعد.
- **`CLAIMED`**: الإجابة محجوزة بقفل مؤقت نشط `lease_token`.
- **`SUBMITTED`**: تم تقديم التقييم الأولي وهو قيد فحص التباين أو المراجعة.
- **`RETURNED_FOR_SECOND_REVIEW`**: إعادة الإجابة للمراجعة الثانية/التعديل (اعتماد المسمى المعياري في QB-01 واستبعاد `RETURNED_FOR_REVIEW`).
- **`FINALIZED`**: الاعتماد النهائي الصارم للدرجة (استبعاد استخدام `GRADED` كبديل عن `FINALIZED`).
- **`REOPENED`**: فتح مراجعة استثنائية بقرار إداري.
- **`APPEALED`**: إجابة تحت معالجة اعتراض الطالب.
- **`SUPERSEDED`**: صف تقييم سابق تم استبداله بصف تصحيحي تتابعي جديد.

---

## 6. ضبط حدود الدرجات والتحقق الذري (Snapshot-Pinned Score Bounds) `[REQUIRED_EXTENSION]`

1. **التحقق داخل RPC الذري**: يتم فحص وتأكيد حدود الدرجة الممنوحة حصرياً داخل السيرفر عبر RPC المعالج، بالاعتماد المباشر على النسخة المعتمدة من السؤال المرتبطة بالاستجابة (`snapshot-pinned max_score`).
2. **قاعدة الحدود الصارمة**:
   $$0 \le \text{score\_awarded} \le \text{snapshot\_pinned\_max\_score}$$
3. **حظر الاعتماد على UI أو القيود غير المربوطة**: يُمنع منعاً باتاً الاعتماد على فحص واجهة العميل (Frontend) أو قيود `CHECK` العامة غير المرتبطة بلحظة أخذ اللقطة الامتحانية (Snapshot).
4. **التعديل بعد الاعتماد النهائي**: أي تعديل للدرجة بعد الوصول لحالة `FINALIZED` يتم حتماً بإدراج صف تصحيحي جديد في `question_response_reviews` يسجل `previous_score` وسلسلة `supersession_links` ويُمنع ممر `UPDATE` نهائياً.

---

## 7. نظام الاعتراضات وإعادة التقييم (Appeals & Regrading Engine) `[REQUIRED_EXTENSION]`

### 7.1. الكيانات والحالات المستقلة `[REQUIRED_EXTENSION]`
تم فصل مسار التظلمات كلياً بإنشاء الكيانات الهيكلية المستقلة التالية:
- **`appeals`**: سجل طلب الاعتراض والمبررات المرفوقة من الطالب.
- **`appeal_assignments`**: التعيين المستقل للمراجع المعتمد للتظلم.
- **`appeal_decisions`**: القرار الأكاديمي الصادر (قبول التعديل / تأكيد الدرجة).
- **`regrade_requests`**: الطلبات الاستثنائية لإعادة التصحيح الصادرة من الإدارة.
- **`score_corrections`**: صفوف التصحيح المالي والأكاديمي للدرجة.
- **`supersession_links`**: روابط التتبع السلسلي بين التقييم المعتمد السابق والتقييم المعدل الجديد.

### 7.2. قواعد الاستقلالية والأثر `[REQUIRED_EXTENSION]`
- **استقلالية مراجع التظلم**: حظر مطلق مشاركة أي مصحح قام بالتقييم الأول أو الثاني للإجابة في مراجعة التظلم الخاص بها (Conflict of Interest Policy).
- **أثر القرار على المجاميع والنشر**: عند قبول الاعتراض وتحديث الدرجة بصف تتابعي جديد، يتم آلياً:
  1. إعادة إشعال حساب مجموع الجلسة الامتحانية (`exam_session_answers` totals).
  2. تحديث الدرجة المنشورة للطالب بعد اعتماد التعديل.
  3. توليد حدث إشعار جديد مع حظر التكرار.
  4. الاحتفاظ الكامل بجميع صفوف التقييم والاعتراض السابقة دون مسح.

---

## 8. نشر النتائج الجماعي والإشعارات (Batch Release & Notification Outbox) `[REQUIRED_EXTENSION]`

### 8.1. البنية التحتية للإفراج والإشعارات `[REQUIRED_EXTENSION]`
- **`grading_batches`**: كيان إدارة الدفعات الامتحانية وتتبع مكتملات التصحيح.
- **`release_state`**: حالة الدفعة (`GRADING_IN_PROGRESS`, `BATCH_FINALIZED`, `RELEASED`).
- **`batch_finalized_at`**: الطابع الزمني المعتمد لإغلاق الدفعة.
- **`notification_outbox`**: جدول صندوق الرسائل الصادرة المحصن ضد الضياع والتكرار.
- **`idempotency_key`**: مفتاح كبح التكرار المشتق من `batch_id + user_id + event_type`.
- **سياسة الإعادة والتعافي**: retry policy بأس الفترات المتباعدة (Exponential Backoff) مع التعافي التلقائي عند تعثر موجه الإشعارات.

> [!CAUTION]
> **شرط إرسال الإشعارات الصارم:**
> يُحظر حظراً مطلقاً توليد أو إرسال أي إشعار بنتيجة الطالب قبل الوصول التام لحالتي: **`FINALIZED + RELEASED`**.

### 8.2. سلوك إعادة الإشعار (Re-Notification Policy) `[REQUIRED_EXTENSION]`
عند إجراء `regrade` أو `appeal` أو `score_correction` بعد الإفراج الأول، يتم توليد إشعار تصحيحي جديد عبر Outbox بمفتاح كبح تكرار مستقل يوضح للطالب أن النتيجة تم تعديلها رسمياً بناءً على طلب المراجعة مع إرفاق الرد المعتمد.

---

## 9. توقيت كشف الحلول وحماية الإجابة النموذجية (Reveal Timing & Solution Protection) `[REQUIRED_EXTENSION]`

### 9.1. الفصل بين الامتحانات والممارسة `[REQUIRED_EXTENSION]`
- **الامتحانات الرسمية (Exam Sessions)**: تُطبق سياسة الإفراج الجماعي المجدول (Batch Reveal Policy). لا تُكشف الإجابة النموذجية أو سلم التقييم إلا بعد انقضاء `batch_finalized_at + reveal_at`.
- **المحاولات التدريبية (Practice Attempts)**: تدعم الكشف الفوري (Immediate Reveal) أو المؤجل (Delayed Reveal) بحسب إعدادات النشاط التدريبي المعتمدة في بنك الأسئلة.

### 9.2. ضوابط حماية الحلول والمناظر (Solution Protection Controls) `[REQUIRED_EXTENSION]`
- يتم تحديد وحفظ الحقول: `reveal_policy`, `reveal_at`, `release_dependency`, `role_authorization`, `timezone_handling` (اعتماد UTC للتحقق الزمني).
- **تصحيح الادعاء السابق**: المنظر `v_question_responses_unified` بمفرده **لا يكفل** حماية الحلول؛ بل يتطلب التثبت الأمني الذري داخل RPCs مع فحص `security_invoker = true` ومطابقة صلاحية `grading.rubric.view` وحساب الوقت المسموح قبل إرجاع حقول `correct_answer` أو `rubric_details`.

---

## 10. سجل قرارات المالك (Owner Decision Register) `[OWNER_DECISION]`

تُدرج جميع القيم والسياسات التي تتطلب قراراً نهائياً من مالك المنتج في هذا السجل مع تحديد الخيارات والأثر والمخاطر والتوصية، وجميعها محددة بحالة `NEEDS_OWNER_DECISION`:

| ID القرار | موضوع القرار | الخيارات المتاحة | الأثر العملياتي | المخاطر المحتملة | التوصية الفنية | القيمة الافتراضية المقترحة | الحالة |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ODR-001** | مهلة القفل المؤقت (Lease TTL) | 10د / 15د / 30د | مدة احتجاز الإجابة عند المصحح | احتكار الإجابات عند الانقطاع | 15 دقيقة مع Heartbeat | **15 minutes** | `NEEDS_OWNER_DECISION` |
| **ODR-002** | مهل اتفاقية SLA للامتحانات | 12س / 24س / 48س | سرعة إعلان نتائج الطلاب | ضغط العمل على المصححين | 24 ساعة للامتحانات الرسمية | **24 hours (Exam)** | `NEEDS_OWNER_DECISION` |
| **ODR-003** | عتبة تنبيه SLA Alert | 50% / 75% / 90% | توقيت إرسال إشعارات التنبيه | كثرة التنبيهات المزعجة | 75% من المدى الزمني | **75%** | `NEEDS_OWNER_DECISION` |
| **ODR-004** | حد انحراف التصحيح المزدوج | 10% / 15% / 20% | نسبة تحويل الإجابات للتحكيم | زيادة عبء Senior Grader | 15% من الدرجة الكلية | **15%** | `NEEDS_OWNER_DECISION` |
| **ODR-005** | نسبة فحص الجودة (QA Sample) | 3% / 5% / 10% | حجم العينات الموجهة للمراجع | استهلاك وقت المراجعين | 5% من الإجابات المعتمدة | **5%** | `NEEDS_OWNER_DECISION` |
| **ODR-006** | نافذة تقديم التظلم (Appeal Window) | 3 أيام / 7 أيام / 14 يوم | الفترة المتاحة للطالب للاعتراض | تراكم طلبات الاعتراض القديمة | 7 أيام من نشر النتيجة | **7 days** | `NEEDS_OWNER_DECISION` |
| **ODR-007** | سلطة الاعتماد النهائى (FINALIZE) | Senior Grader / Manager | تحديد المسؤول عن `is_final` | اختناق العمليات الإدارية | منحها لـ `senior grader` | **senior grader & manager** | `NEEDS_OWNER_DECISION` |
| **ODR-008** | سلطة حسم التحكيم (ARBITRATE) | Senior Grader / Panel | الجهة الفاصلة عند تباين الدرجات | تأخر البت في النزاعات | منحها لـ `senior grader` | **senior grader** | `NEEDS_OWNER_DECISION` |
| **ODR-009** | سلطة الفتح الاستثنائي (REOPEN) | Manager / Emergency | من يملك إعادة فتح مراجعة معتمدة | التلاعب بونتائج معتمدة | حصرها بـ Manager و Emergency | **manager & emergency** | `NEEDS_OWNER_DECISION` |
| **ODR-010** | سلطة نشر الدفعة (BATCH_RELEASE) | Manager Only / System | الجهة المخولة بنشر النتائج | نشر نتائج غير مكتملة | حصرها بـ `grading manager` | **grading manager** | `NEEDS_OWNER_DECISION` |
| **ODR-011** | اشتراط Batch Release للتمارين | نعم (Required) / لا (Immediate) | توقيت ظهور نتائج التمارين | تأخير التغذية الراجعة للتدريب | الإفراج الفوري للتمارين | **No (Immediate for practice)** | `NEEDS_OWNER_DECISION` |
| **ODR-012** | نطاق تطبيق التصحيح المزدوج | جميع الأسئلة / عينة / امتحانات فقط | استهلاك الموارد البشرية | تضاعف التكلفة والوقت | تطبيقه على الامتحانات فقط | **Exams Only** | `NEEDS_OWNER_DECISION` |

---
*نهاية الوثيقة MANUAL-GRADING-PRODUCT-REQUIREMENTS-01 (Canonical Correction 03)*
