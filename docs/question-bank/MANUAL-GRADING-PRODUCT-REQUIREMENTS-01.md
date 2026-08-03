# MANUAL-GRADING-PRODUCT-REQUIREMENTS-01
## متطلبات منتج محرك التصحيح اليدوي وتجربة المراجعة الموحدة — التصحيح القانوني المعتمد 07

> **وثيقة تصميم المنتج والمعمارية الوظيفية (Product & Functional Requirements Document)**
> **الإصدار:** 7.0.0 (Canonical Correction 07)
> **الحالة:** مجمد للتصميم الوثائقي فقط (Design Frozen - Docs Only / No Code / No SQL Execution / No DB / No Deploy)
> **النظام:** منصة تسهيل التعليمية (Tas-heel Engine - Question Bank QB-01)

---


### 5.8. تصنيف الحالات النهائية وغير النهائية للآلات الست والتحقق من الانتهاء (State Machine Classification & Dead-End Audit) `[REQUIRED_EXTENSION]`

| اسم آلة الحالات (Machine) | الحالات غير النهائية (Non-Terminal States) | مسارات الخروج المؤكدة لكل حالة غیر نهائية | الحالات النهائية (Terminal States) | خلو Dead-End Non-Terminal |
| :--- | :--- | :--- | :--- | :---: |
| **`RESPONSE`** | `PENDING_MANUAL_GRADING`, `IN_GRADING`, `SUBMITTED_FOR_REVIEW`, `RETURNED_FOR_SECOND_REVIEW`, `FINALIZED`, `REOPENED`, `APPEALED` | `PENDING_MANUAL_GRADING` → `IN_GRADING`<br>`IN_GRADING` → `SUBMITTED_FOR_REVIEW`<br>`SUBMITTED_FOR_REVIEW` → `RETURNED_FOR_SECOND_REVIEW` / `FINALIZED`<br>`RETURNED_FOR_SECOND_REVIEW` → `IN_GRADING`<br>`FINALIZED` → `REOPENED` / `APPEALED`<br>`REOPENED` → `IN_GRADING`<br>`APPEALED` → `FINALIZED` | *لا يوجد حالات نهائية مطلقة* (قد يخضع أي سجل نهائي لتظلم أو فتح استثنائي) | **`0`** (PASS) |
| **`ASSIGNMENT`** | `ASSIGNED`, `CLAIMED`, `RELEASED`, `EXPIRED`, `RECLAIMED` | `ASSIGNED` → `CLAIMED`<br>`CLAIMED` → `SUBMITTED` / `RELEASED` / `EXPIRED` / `CANCELLED`<br>`RELEASED` → `CLAIMED`<br>`EXPIRED` → `RECLAIMED`<br>`RECLAIMED` → `CLAIMED` | `SUBMITTED`, `CANCELLED` | **`0`** (PASS) |
| **`REVIEW_ROW`** | `DRAFT`, `SUBMITTED` | `DRAFT` → `SUBMITTED`<br>`SUBMITTED` → `FINAL` / `SUPERSEDED` / `VOIDED` | `FINAL`, `SUPERSEDED`, `VOIDED` | **`0`** (PASS) |
| **`APPEAL`** | `CREATED`, `ELIGIBILITY_CHECKED`, `ASSIGNED`, `UNDER_REVIEW` | `CREATED` → `ELIGIBILITY_CHECKED`<br>`ELIGIBILITY_CHECKED` → `ASSIGNED` / `CANCELLED`<br>`ASSIGNED` → `UNDER_REVIEW`<br>`UNDER_REVIEW` → `DECIDED_UPHELD` / `DECIDED_REJECTED` / `DECIDED_REGRADE` | `DECIDED_UPHELD`, `DECIDED_REJECTED`, `DECIDED_REGRADE`, `CANCELLED` | **`0`** (PASS) |
| **`BATCH`** | `OPEN`, `GRADING_COMPLETE`, `FINALIZATION_PENDING`, `FINALIZED`, `RELEASE_PENDING`, `REOPENED` | `OPEN` → `GRADING_COMPLETE` / `CANCELLED`<br>`GRADING_COMPLETE` → `FINALIZATION_PENDING`<br>`FINALIZATION_PENDING` → `FINALIZED`<br>`FINALIZED` → `RELEASE_PENDING` / `REOPENED`<br>`RELEASE_PENDING` → `RELEASED`<br>`REOPENED` → `FINALIZATION_PENDING` | `RELEASED`, `CANCELLED` | **`0`** (PASS) |
| **`OUTBOX`** | `PENDING`, `CLAIMED`, `RETRY_WAIT` | `PENDING` → `CLAIMED`<br>`CLAIMED` → `SENT` / `RETRY_WAIT` / `DEAD_LETTER`<br>`RETRY_WAIT` → `CLAIMED` / `DEAD_LETTER` / `CANCELLED` | `SENT`, `DEAD_LETTER`, `CANCELLED` | **`0`** (PASS) |

> [!IMPORTANT]
> **إثبات عدم وجود أطراف ميتة (Zero Dead-Ends Audit Result):**
> - **إجمالي الآلات المراجعة:** 6
> - **إجمالي الحالات المحددة:** 41 حالة
> - **إجمالي الحالات غير النهائية (Non-Terminal):** 27 حالة (لديها جميعاً مسار خروج قانوني واحد على الأقل)
> - **إجمالي الحالات النهائية (Terminal):** 14 حالة (موسومة صراحة ومحمية من التعديل/إعادة الفتح على نفس السجل)
> - **عدد الحالات غير النهائية الميتة (Dead-end non-terminal states):** **`0`** (`PASS`)


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

## 1. نظرة عامة ورسالة النظام (Product Vision & Executive Summary) `[REQUIRED_EXTENSION]`

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
>    - **التعينات المحدودة بالنطاق (Scoped Assignments)**: قيود وصول مرتبطة بالمادة (`subject_scope`) وبطابور التعيين النشط.
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

### 2.3. خريطة ربط الصلاحيات بنموذج QB-01 الفعلي (Capability Mapping Table) `[REQUIRED_EXTENSION]`

تعتمد البنية الأمنية على القدرة الفعلية الوحيدة الموجودة في QB-01: **`GRADE_MANUAL_RESPONSE`**، وتربط بقية العمليات المقترحة بامتدادات جديدة واضحة دون ادعاء وجودها المسبق:

| Capability المقترحة | الوصف التشغيلي | الربط بنموذج QB-01 الفعلي | التصنيف الهيكلي |
| :--- | :--- | :--- | :--- |
| `grading.queue.read` | عرض وقراءة طابور الإجابات | مشتقة من `GRADE_MANUAL_RESPONSE` مع RLS | `REQUIRED_EXTENSION` |
| `grading.claim.execute` | المطالبة بقفل إجابة في الطابور | امتداد جديد لآلية التعيين الذاتي | `REQUIRED_EXTENSION` |
| `grading.release.execute` | تحرير قفل إجابة وإعادتها للطابور | امتداد جديد لإدارة أقفال التعيين | `REQUIRED_EXTENSION` |
| `grading.score.submit` | تقديم درجة أولية وملاحظات | **تطابق مباشر مع `GRADE_MANUAL_RESPONSE`** | `EXISTING_QB01` |
| `grading.score.finalize` | الاعتماد النهائي للدرجة | امتداد لإنفاذ `is_final = true` | `REQUIRED_EXTENSION` |
| `grading.review.return` | إعادة الإجابة للتعديل للمصحح الأول | امتداد جديد لمراجعة الجودة | `REQUIRED_EXTENSION` |
| `grading.reopen.execute` | فتح مراجعة استثنائية لدرجة معتمدة | امتداد جديد مع قيد السبب الإجباري | `REQUIRED_EXTENSION` |
| `grading.appeal.process` | معالجة وتعديل الاعتراضات | امتداد جديد لمسار التظلمات المستقل | `REQUIRED_EXTENSION` |
| `grading.double_mark.arbitrate` | التحكيم في التصحيح المزدوج | امتداد جديد لحسم انحراف التقييم | `REQUIRED_EXTENSION` |
| `grading.audit.read` | قراءة سجل التدقيق التتابعي | امتداد لقراءة `question_response_reviews` | `REQUIRED_EXTENSION` |
| `grading.batch.release` | الاعتماد ونشر نتائج الدفعة | خاضع لقرار المالك والسياسة التشغيلية | `OWNER_DECISION` |
| `grading.emergency.override` | التجاوز الاستثنائي في الطوارئ | خاضع لقرار المالك وضوابط Audit | `OWNER_DECISION` |

---

## 3. مصفوفة الكيانات المستقبلية (Future Implementation Entity Matrix) `[REQUIRED_EXTENSION]`

تحدد هذه المصفوفة كافة الكيانات المستقبلية المطلوبة لتشغيل محرك التصحيح اليدوي مع تصنيف وجودها في QB-01 ومتطلبات البناء المستقبلية:

| Entity (الكيان) | Exists in QB-01 | New table | Migration | RLS | RPC | Audit | Runtime |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `grading_assignments` | **NO** | YES | YES | YES | YES | YES | YES |
| `grading_assignment_events` | **NO** | YES | YES | YES | YES | YES | YES |
| `grading_assignment_leases` | **NO** | YES | YES | YES | YES | YES | YES |
| `grading_reviews` | **NO** (موجود باسم `question_response_reviews`) | NO | YES | YES | YES | YES | YES |
| `grading_review_supersessions` | **NO** | YES | YES | YES | YES | YES | YES |
| `grading_batches` | **NO** | YES | YES | YES | YES | YES | YES |
| `grading_batch_responses` | **NO** | YES | YES | YES | YES | YES | YES |
| `appeals` | **NO** | YES | YES | YES | YES | YES | YES |
| `appeal_assignments` | **NO** | YES | YES | YES | YES | YES | YES |
| `appeal_decisions` | **NO** | YES | YES | YES | YES | YES | YES |
| `regrade_requests` | **NO** | YES | YES | YES | YES | YES | YES |
| `score_corrections` | **NO** | YES | YES | YES | YES | YES | YES |
| `notification_outbox` | **NO** | YES | YES | YES | YES | YES | YES |
| `conflict_of_interest_declarations` | **NO** | YES | YES | YES | YES | YES | YES |
| `emergency_access_grants` | **NO** | YES | YES | YES | YES | YES | YES |

---

## 4. مصفوفة عقود RPC المستقبلية (Future RPC Contracts Matrix) `[REQUIRED_EXTENSION]`

تُدار جميع العمليات التشغيلية للتصحيح اليدوي عبر 18 عقد RPC مستقبلي محصن بالسيرفر:

| RPC Name | Authority | Required Capability | Scope | Input Parameters | Preconditions | Locking | Idempotency Key | Fencing Token | Transaction Boundary | Audit Event | Result | Failure Codes | Migration Req. | Runtime Consumer |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- |
| `claim_grading_assignment` | Grader / Senior | `grading.claim.execute` | Subject | `p_response_id, p_role` | No active lease, no COI | `FOR UPDATE NOWAIT` | Optional | Generated | Atomic | `ASSIGNMENT_CLAIMED` | `{ lease_token, fencing_token, expires_at }` | `ALREADY_CLAIMED, COI_FLAGGED, OUT_OF_SCOPE` | YES | Grader UI / Queue Engine |
| `heartbeat_grading_assignment` | Current Grader | `grading.claim.execute` | Active Lease | `p_lease_token, p_fencing_token` | Active unexpired lease | Row Lock | N/A | Verified | Atomic | `LEASE_EXTENDED` | `{ new_expires_at }` | `LEASE_EXPIRED, INVALID_FENCING_TOKEN` | YES | Grader UI Timer |
| `release_grading_assignment` | Current Grader / Manager | `grading.release.execute` | Active Lease | `p_lease_token, p_reason` | Claimed lease | Row Lock | N/A | Verified | Atomic | `ASSIGNMENT_RELEASED` | `{ status: 'RELEASED' }` | `LEASE_NOT_FOUND, UNAUTHORIZED_RELEASE` | YES | Grader UI / Dispatch |
| `expire_grading_assignment` | Scheduler / System | `system.cron` | System | `p_batch_limit` | `lease_expires_at < NOW()` | Bulk Row Lock | Job Run ID | N/A | Batch Transaction | `ASSIGNMENTS_EXPIRED` | `{ expired_count }` | `EXPIRE_JOB_FAILED` | YES | Expiry Worker Job |
| `reclaim_grading_assignment` | Manager | `grading.release.execute` | System | `p_assignment_id, p_new_grader_id` | Stale or unresponsive | Row Lock | Admin Ref | Increments Gen | Atomic | `ASSIGNMENT_RECLAIMED` | `{ new_generation, new_lease_token }` | `ASSIGNMENT_CLOSED, INVALID_MANAGER` | YES | Manager Dashboard |
| `submit_manual_grade` | Current Grader | `GRADE_MANUAL_RESPONSE` | Assigned Slot | `p_lease_token, p_fencing_token, p_score, p_rubric, p_feedback, p_idempotency_key` | Unexpired lease, matching fencing token, valid score bounds | Strict Partial Unique Index | `p_idempotency_key` | Verified | Single Transaction | `SCORE_SUBMITTED` | `{ review_id, action_id, status }` | `STALE_FENCING_TOKEN, SCORE_OUT_OF_BOUNDS, DUPLICATE_IDEMPOTENCY` | YES | Grader UI Submission |
| `return_for_second_review` | Senior / Reviewer | `grading.review.return` | Subject | `p_response_id, p_guidance_notes` | Status `SUBMITTED_FOR_REVIEW` | Row Lock | Action Key | Required | Atomic | `REVIEW_RETURNED` | `{ status: 'RETURNED_FOR_SECOND_REVIEW' }` | `INVALID_RESPONSE_STATE, MISSING_GUIDANCE` | YES | Senior Review UI |
| `finalize_manual_grade` | Senior / Manager | `grading.score.finalize` | Subject | `p_response_id, p_final_score, p_reason` | Valid review, reason provided | Row Lock | Action Key | Required | Atomic + Outbox Insert | `GRADE_FINALIZED` | `{ response_state: 'FINALIZED' }` | `MISSING_REASON, ALREADY_FINALIZED` | YES | Senior / Manager UI |
| `reopen_manual_grade` | Manager / Emergency | `grading.reopen.execute` | System | `p_response_id, p_reason` | Status `FINALIZED`, reason >= 20 chars | Row Lock CAS | Action Key | Required | Atomic | `GRADE_REOPENED` | `{ new_review_id, status: 'REOPENED' }` | `REASON_TOO_SHORT, NOT_FINALIZED` | YES | Manager / Emergency UI |
| `create_appeal` | Student | `student.appeal.create` | Own Session | `p_response_id, p_reason, p_disputed_points` | Status `FINALIZED + RELEASED`, within appeal window | Unique Pending Appeal Constraint | Unique Student Key | N/A | Atomic | `APPEAL_CREATED` | `{ appeal_id, status: 'APPEALED' }` | `APPEAL_WINDOW_EXPIRED, DUPLICATE_APPEAL` | YES | Student Portal |
| `assign_appeal_reviewer` | Manager / System | `grading.appeal.process` | Subject | `p_appeal_id, p_reviewer_id` | No COI with initial graders | Row Lock | N/A | N/A | Atomic | `APPEAL_ASSIGNED` | `{ assignment_id }` | `COI_VIOLATION, REVIEWER_BUSY` | YES | Appeals Manager UI |
| `decide_appeal` | Appeal Reviewer | `grading.appeal.process` | Assigned Appeal | `p_appeal_id, p_decision ('UPHELD'/'REJECTED'), p_new_score, p_justification` | Claimed appeal assignment | Row Lock | Action Key | Required | Atomic + Session Rescore + Outbox | `APPEAL_DECIDED` | `{ decision_id, final_score }` | `INVALID_SCORE, MISSING_JUSTIFICATION` | YES | Appeals Reviewer UI |
| `create_regrade_request` | Manager | `grading.reopen.execute` | System | `p_response_id, p_target_grader_id, p_reason` | Admin audit trigger | Row Lock | Admin Key | Required | Atomic | `REGRADE_REQUESTED` | `{ regrade_id }` | `UNAUTHORIZED_REGRADE` | YES | Manager Dashboard |
| `arbitrate_double_mark` | Senior Grader | `grading.double_mark.arbitrate` | Variance Flagged | `p_response_id, p_arbitrated_score, p_justification` | Variance > 15%, both submissions completed | Row Lock | Action Key | Required | Atomic + Finalize | `DOUBLE_MARK_ARBITRATED` | `{ review_id, final_score }` | `NOT_READY_FOR_ARBITRATION` | YES | Senior Arbitrator UI |
| `release_grading_batch` | Manager | `grading.batch.release` | Batch Scope | `p_batch_id` | All responses in batch `FINALIZED` | Batch Lock | Batch Key | N/A | Transaction + Outbox Enqueue | `BATCH_RELEASED` | `{ batch_status: 'RELEASED', released_count }` | `UNFINISHED_RESPONSES_IN_BATCH` | YES | Manager Release UI |
| `enqueue_grading_notification` | Internal System | `system.outbox` | Outbox | `p_event_type, p_user_id, p_payload, p_dedup_key` | Status `FINALIZED + RELEASED` | Outbox Lock | `p_dedup_key` | N/A | Atomic inside caller tx | `NOTIFICATION_ENQUEUED` | `{ outbox_id }` | `DUPLICATE_NOTIFICATION_KEY` | YES | Internal Triggers / RPCs |
| `grant_emergency_grading_access` | Admin Emergency | `grading.emergency.override` | System | `p_operator_id, p_scope, p_reason_doc` | Multi-Factor Emergency Session, reason >= 30 chars | Admin Lock | Emergency Token | Required | Single Transaction | `EMERGENCY_ACCESS_GRANTED` | `{ grant_token, expires_at }` | `INVALID_EMERGENCY_TOKEN` | YES | Emergency Audit Center |
| `revoke_emergency_grading_access` | Admin / System | `grading.emergency.override` | System | `p_grant_token` | Active emergency grant | Admin Lock | N/A | Revoked | Atomic | `EMERGENCY_ACCESS_REVOKED` | `{ status: 'REVOKED' }` | `GRANT_NOT_FOUND` | YES | Emergency Monitor Worker |

---

## 5. آلات الحالات المنفصلة وعقود الانتقال (Separate State Machines & Operational Transitions) `[REQUIRED_EXTENSION]`

تم فصل آلات الحالات إلى 6 كائنات مستقلة تماماً منعاً للتداخل المفاهيمي (Response, Assignment, Review Row, Appeal, Batch, Outbox):

### 5.1. آلة حالات تصحيح الإجابة (Response Grading State Machine) `[RESPONSE]`
- **`PENDING_MANUAL_GRADING`**: الإجابة متوفرة في الطابور تنتظر التعيين/المطالبة.
- **`IN_GRADING`**: الإجابة محجوزة بقفل مؤقت نشط وتحت التقييم.
- **`SUBMITTED_FOR_REVIEW`**: تم إرسال التقييم الأولي وتنتظر التحكيم أو فحص التباين.
- **`RETURNED_FOR_SECOND_REVIEW`**: أعيدت الإجابة للمصحح التعديلي بطلب مراجعة ثانية (حالة غير نهائية تنتقل حتماً إلى `IN_GRADING` عند بدء إعادة التصحيح).
- **`FINALIZED`**: اعتمدت الدرجة نهائياً وأقفلت.
- **`REOPENED`**: فتحت المراجعة استثنائياً بعد الاعتماد (حالة غير نهائية تنتقل حتماً إلى `IN_GRADING` عند البدء في إعادة التقييم).
- **`APPEALED`**: الإجابة تحت معالجة تظلم قائم من الطالب.

### 5.2. آلة حالات التعيين وقفل المهمة (Assignment / Lease State Machine) `[ASSIGNMENT]`
- **`ASSIGNED`**: الإجابة مخصصة لمصحح ولم يطالب بقفلها بعد.
- **`CLAIMED`**: المصحح حصل على القفل المؤقت النشط `lease_token`.
- **`RELEASED`**: حرر القفل يدوياً أو إدارياً وعادت الإجابة للطابور.
- **`EXPIRED`**: انقضت مهلة القفل آلياً دون تقديم.
- **`RECLAIMED`**: سحب التعيين إدارياً وأبطل الرمز القديم.
- **`SUBMITTED`**: استكمل المصحح المهمة وسلم الدرجة بنجاح (حالة نهائية Terminal في آلة ASSIGNMENT لا تجيز Heartbeat أو Release/Reclaim وكل إعادة عمل تنشئ Assignment جديداً).
- **`CANCELLED`**: ألغي التعيين بسبب إلغاء المحاولة الامتحانية أو COI.

### 5.3. آلة حالات صف المراجعة السلسلي (Review Row State Machine) `[REVIEW_ROW]`
- **`DRAFT`**: مسودة تقييم غير مؤكدة (في الذاكرة النشطة حصراً).
- **`SUBMITTED`**: صف تقييم مقدم ومسجل تتابعياً.
- **`FINAL`**: صف تقييم اعتمد كدرجة نهائية (`is_final = true`).
- **`SUPERSEDED`**: صف تقييم سابق تم إبطال درجاته بصف تصحيحي جديد.
- **`VOIDED`**: صف تقييم ألغي بقرار طوارئ/تحكيم.

### 5.4. آلة حالات التظلمات والاعتراضات (Appeal State Machine) `[APPEAL]`
- **`CREATED`**: تم تقديم طلب التظلم من الطالب وهو بانتظار التحقق من الأهلية.
- **`ELIGIBILITY_CHECKED`**: تم التحقق من استيفاء شروط النافذة الزمنية والأهلية الجغرافية/الأكاديمية.
- **`ASSIGNED`**: خصص التظلم لمراجع مستقل دون وجود تعارض مصالح (COI).
- **`UNDER_REVIEW`**: التظلم تحت الدراسة والمراجعة الفعلية من المحكم.
- **`DECIDED_UPHELD`**: تم قبول التظلم واعتماد تعديل الدرجة لصالح الطالب (حالة نهائية).
- **`DECIDED_REJECTED`**: تم رفض التظلم وتأكيد الدرجة النهائية السابقة (حالة نهائية).
- **`DECIDED_REGRADE`**: صدر قرار بإحالة الإجابة لإعادة تصحيح كاملة عبر مسار مستقل (حالة نهائية).
- **`CANCELLED`**: تم إلغاء طلب التظلم بطلب من الطالب قبل بدء المراجعة (حالة نهائية).

> [!NOTE]
> جميع الحالات غير النهائية في آلة `APPEAL` لها مسارات خروج صريحة محددة في مصفوفة الانتقالات.

### 5.5. آلة حالات الدفعة والإفراج (Batch State Machine) `[BATCH]`
- **`OPEN`**: الدفعة امتحانية نشطة ويجري تجميع نتائج تصحيحها اليدوي.
- **`GRADING_COMPLETE`**: اكتمل تصحيح كافة إجابات الدفعة وتنتظر الاعتماد النهائي.
- **`FINALIZATION_PENDING`**: جاري معالجة الاعتماد الذري الشامل لكافة الدرجات.
- **`FINALIZED`**: تم اعتماد جميع درجات الدفعة وتجميد التعديلات الفردية المباشرة.
- **`RELEASE_PENDING`**: الدفعة مجدولة للإفراج وتجهيز الإشعارات في Outbox.
- **`RELEASED`**: تم إفراج الدفعة ونشر النتائج للطلاب وإرسال الإشعارات (حالة نهائية).
- **`REOPENED`**: تم إعادة فتح الدفعة استثنائياً بقرار إداري مصرح (حالة غير نهائية تنتقل إلى `FINALIZATION_PENDING` بعد تسوية المراجعات وإعادة احتساب النتائج).
- **`CANCELLED`**: تم إلغاء الدفعة أو المحاولة وفق سياسة المؤسسة (حالة نهائية).

### 5.6. آلة حالات صندوق الإشعارات الصادرة (Outbox State Machine) `[OUTBOX]`
- **`PENDING`**: الإشعار مسجل في Outbox وبانتظار المطالبة من Worker.
- **`CLAIMED`**: تم حجز الإشعار بواسطة Worker عبر `claim_token` وتحديد `visibility_timeout`.
- **`SENT`**: تم تسليم الإشعار بنجاح إلى مزود الخدمة/الطالب (حالة نهائية).
- **`RETRY_WAIT`**: تعثرت المحاولة الأولى وتنتظر إعادة المحاولة (`next_attempt_at` مع Exponential Backoff).
- **`DEAD_LETTER`**: تجاوزت المحاولات الحد الأقصى (`attempt_count > max`) وحولت لصندوق الرسائل الميتة للمراجعة.
- **`CANCELLED`**: تم إلغاء الإشعار بسبب إلغاء الدفعة أو التظلم (حالة نهائية).

> [!IMPORTANT]
> **محددات التشغيل لـ OUTBOX:**
> - `claim_token`: رمز حجز فريد يمنع المعالجة المزدوجة.
> - `visibility_timeout`: مهلة الرؤية لإعادة المعالجة عند الانقطاع.
> - `attempt_count` / `next_attempt_at`: حساب المحاولات والتجديد الزمني.
> - `deduplication_key`: مفتاح منع التكرار لضمان عدم إرسال نفس الإشعار مرتين.
> - `idempotency`: معالجة متكافئة الأثر تماماً.
> - `transaction_coupling`: اقتران المعاملة الذرية بجدول العمليات الأساسي.
> - `replay_authority`: سلطة إعادة التشغيل المحصورة بـ System Admin.

### 5.7. جدول الانتقالات التنفيذية الكاملة (Operational Transitions Matrix) `[REQUIRED_EXTENSION]`

| From State | To State | Target Machine | Actor / Role | Required Capability | Preconditions | Concurrency Guard | Expected Version / Token | Lock Type | Idempotency Key | Transaction Boundary | Audit Event | Failure Code | Retry / Downstream Effect |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `ASSIGNED` | `CLAIMED` | `ASSIGNMENT` | Grader | `grading.claim.execute` | No active lease, no COI | Partial unique index | `assignment_gen` | `FOR UPDATE NOWAIT` | Optional | `Single Atomic RPC Transaction` | `ASSIGNMENT_CLAIMED` | `ALREADY_CLAIMED` | User Retry |
| `CLAIMED` | `RELEASED` | `ASSIGNMENT` | Grader / Manager | `grading.release.execute` | Active lease held by actor | Match `lease_token` | `lease_token` | Row Lock | N/A | `Single Atomic RPC Transaction` | `ASSIGNMENT_RELEASED` | `LEASE_NOT_FOUND` | No Retry |
| `CLAIMED` | `EXPIRED` | `ASSIGNMENT` | Worker System | `system.cron` | `lease_expires_at < NOW()` | Bulk status check | Status `CLAIMED` | Batch Row Lock | Job Run ID | `Batch Worker Transaction` | `ASSIGNMENT_EXPIRED` | `EXPIRE_FAILED` | Auto Job Retry |
| `EXPIRED` | `RECLAIMED` | `ASSIGNMENT` | Manager | `grading.release.execute` | Unresponsive grader | Increment `assignment_gen` | Stale `generation` | Row Lock | Admin Ref | `Single Atomic RPC Transaction` | `ASSIGNMENT_RECLAIMED` | `ASSIGNMENT_CLOSED` | Admin Retry |
| `RELEASED` | `CLAIMED` | `ASSIGNMENT` | Grader | `grading.claim.execute` | Unclaimed response in queue | Partial unique index | `assignment_gen` | `FOR UPDATE NOWAIT` | Optional | `Single Atomic RPC Transaction` | `ASSIGNMENT_CLAIMED` | `ALREADY_CLAIMED` | User Retry |
| `RECLAIMED` | `CLAIMED` | `ASSIGNMENT` | New Grader | `grading.claim.execute` | Assignment reclaimed by admin | Increment `assignment_gen` | `new_generation` | Row Lock | Optional | `Single Atomic RPC Transaction` | `ASSIGNMENT_RECLAIMED_CLAIM` | `ALREADY_CLAIMED` | User Retry |
| `CLAIMED` | `CANCELLED` | `ASSIGNMENT` | System / Manager | `grading.release.execute` | Session cancelled or COI flagged | Atomic status CAS | `lease_token` | Row Lock | Admin ID | `Single Atomic RPC Transaction` | `ASSIGNMENT_CANCELLED` | `CANCEL_DENIED` | No Retry |
| `CLAIMED` | `SUBMITTED` | `ASSIGNMENT` | Grader | `grading.submit.execute` | Active lease held by actor, score submitted | Match `lease_token` | `lease_token` | Row Lock | Submit UUID | `Single Atomic RPC Transaction` | `ASSIGNMENT_SUBMITTED` | `INVALID_LEASE` | Terminal State / Next Stage |
| `PENDING_MANUAL_GRADING` | `IN_GRADING` | `RESPONSE` | Grader | `grading.claim.execute` | Response in queue, no final score | Response status check | `response_version` | Row Lock | Claim ID | `Single Atomic RPC Transaction` | `RESPONSE_CLAIMED_FOR_GRADING` | `RESPONSE_NOT_AVAILABLE` | User Retry |
| `IN_GRADING` | `SUBMITTED_FOR_REVIEW` | `RESPONSE` | Grader | `grading.submit.execute` | Active lease, score within max_score | Check `lease_token` | `lease_token` | Row Lock | Submit UUID | `Single Atomic RPC Transaction` | `RESPONSE_GRADED` | `INVALID_SCORE_OR_LEASE` | User Retry |
| `SUBMITTED_FOR_REVIEW` | `RETURNED_FOR_SECOND_REVIEW` | `RESPONSE` | Score Variance Engine | `system.cron` | Variance > threshold or QA sample | Variance evaluation | `review_id` | Row Lock | System Job ID | `Single Atomic RPC Transaction` | `RESPONSE_RETURNED_FOR_REVIEW` | `VARIANCE_CHECK_FAILED` | Auto Job Retry |
| `RETURNED_FOR_SECOND_REVIEW` | `IN_GRADING` | `RESPONSE` | Second Grader / Reassigned Grader | `grading.claim.execute` | Mandatory return_reason / guidance_notes mandatory & new slot assigned; CREATE new grading_assignment row; previous assignment remains immutable; only the explicitly assigned grader_user_id may claim the new assignment (assigned-grader-only claim authority); Ref: `NEW_GRADING_ASSIGNMENT_AFTER_RETURN_OR_REOPEN` | Atomic CAS on expected_response_version & generation increment (`assignment_generation = previous_generation + 1`); compare-and-swap failure aborts the entire transaction | `new_assignment_id` generated server-side, `expected_response_version` required & `new unique lease_token` (old lease_token is invalid and rejected) | Row Lock (`FOR UPDATE NOWAIT`) | `idempotency_key` mandatory and replay-safe (Claim UUID / Return Action Key) | `assignment creation + generation increment + lease creation + response transition + audit event occur in one atomic transaction` | `RESPONSE_SECOND_REVIEW_STARTED` | `ASSIGNMENT_CREATION_FAILED`, `ASSIGNMENT_ID_COLLISION`, `RESPONSE_VERSION_MISMATCH`, `CAS_CONFLICT`, `ASSIGNMENT_GENERATION_MISMATCH`, `LEASE_TOKEN_COLLISION`, `STALE_LEASE_PRESENTED`, `ASSIGNEE_MISMATCH`, `UNAUTHORIZED_CLAIM`, `MISSING_MANDATORY_REASON`, `REOPEN_UNAUTHORIZED`, `DUPLICATE_IDEMPOTENCY_REQUEST`, `AUDIT_INSERTION_FAILED` | User Retry / New assignment active; old assignment immutable (`SUBMITTED`), previous review row remains append-only and immutable |
| `SUBMITTED_FOR_REVIEW` | `FINALIZED` | `RESPONSE` | Senior Grader / RPC | `grading.finalize.execute` | Agreed scores or Senior arbitrated | `is_final = false` | `response_version` | Row Lock | Finalize UUID | `Single Atomic RPC Transaction` | `RESPONSE_FINALIZED` | `FINALIZATION_DENIED` | Admin Retry |
| `FINALIZED` | `REOPENED` | `RESPONSE` | Manager / Emergency | `grading.reopen.execute` | Authorized emergency reopen | Audit log required | `response_version` | Row Lock | Emergency Ref | `Single Atomic RPC Transaction` | `RESPONSE_REOPENED` | `REOPEN_UNAUTHORIZED` | Admin Retry |
| `REOPENED` | `IN_GRADING` | `RESPONSE` | Manager / Assigned Grader | `grading.reopen.execute` (authority/capability mandatory) | Reopen authorized with reopen_reason mandatory; CREATE new grading_assignment row; no reopening of previous SUBMITTED assignment; previous assignment remains immutable; only the explicitly assigned grader_user_id may claim the new assignment (assigned-grader-only claim authority); Ref: `NEW_GRADING_ASSIGNMENT_AFTER_RETURN_OR_REOPEN` | Atomic CAS on expected_response_version & monotonic generation increment (`assignment_generation = previous_generation + 1`); compare-and-swap failure aborts the entire transaction | `new_assignment_id` generated server-side, `expected_response_version` required & `new unique lease_token` (old lease_token is invalid and rejected) | Row Lock (`FOR UPDATE NOWAIT`) | `idempotency_key` mandatory and replay-safe (Reopen UUID / Action Key) | `assignment creation + generation increment + lease creation + response transition + audit event occur in one atomic transaction` | `RESPONSE_REOPENED_TO_IN_GRADING` | `ASSIGNMENT_CREATION_FAILED`, `ASSIGNMENT_ID_COLLISION`, `RESPONSE_VERSION_MISMATCH`, `CAS_CONFLICT`, `ASSIGNMENT_GENERATION_MISMATCH`, `LEASE_TOKEN_COLLISION`, `STALE_LEASE_PRESENTED`, `ASSIGNEE_MISMATCH`, `UNAUTHORIZED_CLAIM`, `MISSING_MANDATORY_REASON`, `REOPEN_UNAUTHORIZED`, `DUPLICATE_IDEMPOTENCY_REQUEST`, `AUDIT_INSERTION_FAILED` | Admin Retry / New assignment created, previous finalized review remains append-only and immutable, supersession chain created only upon submitting new correction |
| `FINALIZED` | `APPEALED` | `RESPONSE` | Student / System | `student.appeal.create` | Batch `RELEASED`, in window | Unique appeal check | `response_version` | Row Lock | Appeal UUID | `Single Atomic RPC Transaction` | `RESPONSE_APPEALED` | `OUTSIDE_WINDOW` | User Retry |
| `APPEALED` | `FINALIZED` | `RESPONSE` | Appeal Reviewer | `grading.appeal.process` | Appeal decided and applied | Appeal decision logged | `appeal_id` | Row Lock | Decision UUID | `Single Atomic RPC Transaction` | `RESPONSE_APPEAL_RESOLVED` | `APPEAL_DENIED` | Admin Retry |
| `DRAFT` | `SUBMITTED` | `REVIEW_ROW` | Grader | `grading.submit.execute` | Valid rubric selection | Active lease held | N/A | Memory State | Draft ID | `Single Atomic RPC Transaction` | `REVIEW_ROW_SUBMITTED` | `DRAFT_INVALID` | User Retry |
| `SUBMITTED` | `FINAL` | `REVIEW_ROW` | Finalize RPC | `grading.finalize.execute` | Final grade selection | `is_final = false` | `review_row_id` | Row Lock | Finalize ID | `Single Atomic RPC Transaction` | `REVIEW_ROW_FINALIZED` | `ALREADY_FINAL` | No Retry |
| `SUBMITTED` | `SUPERSEDED` | `REVIEW_ROW` | Re-grade RPC | `grading.regrade.execute` | New review row inserted | Supersession link | `review_row_id` | Row Lock | Regrade ID | `Single Atomic RPC Transaction` | `REVIEW_ROW_SUPERSEDED` | `SUPERSEDE_FAILED` | No Retry |
| `SUBMITTED` | `VOIDED` | `REVIEW_ROW` | Manager / System | `grading.void.execute` | Emergency void or COI | Audit entry required | `review_row_id` | Row Lock | Void Ref | `Single Atomic RPC Transaction` | `REVIEW_ROW_VOIDED` | `VOID_UNAUTHORIZED` | No Retry |
| `CREATED` | `ELIGIBILITY_CHECKED` | `APPEAL` | System / Worker | `system.cron` | New appeal record created | Single active appeal check | `appeal_id` | Row Lock | Check Job ID | `Single Atomic RPC Transaction` | `APPEAL_ELIGIBILITY_VERIFIED` | `INELIGIBLE_APPEAL` | Auto Job Retry |
| `ELIGIBILITY_CHECKED` | `ASSIGNED` | `APPEAL` | Manager / Dispatcher | `grading.appeal.process` | Eligible appeal, no COI | Assignment unique index | `appeal_id` | Row Lock | Assign UUID | `Single Atomic RPC Transaction` | `APPEAL_ASSIGNED` | `NO_AVAILABLE_REVIEWER` | System Retry |
| `ELIGIBILITY_CHECKED` | `CANCELLED` | `APPEAL` | Student / System | `student.appeal.create` | Cancel requested before review | Status check `ELIGIBILITY_CHECKED` | `appeal_id` | Row Lock | Cancel UUID | `Single Atomic RPC Transaction` | `APPEAL_CANCELLED` | `CANCEL_DENIED` | User Retry |
| `ASSIGNED` | `UNDER_REVIEW` | `APPEAL` | Appeal Reviewer | `grading.appeal.process` | Reviewer claimed appeal | Reviewer ID match | `appeal_id` | Row Lock | Claim UUID | `Single Atomic RPC Transaction` | `APPEAL_UNDER_REVIEW` | `ALREADY_CLAIMED` | User Retry |
| `UNDER_REVIEW` | `DECIDED_UPHELD` | `APPEAL` | Appeal Reviewer | `grading.appeal.process` | Review completed, score adjusted | Active appeal review | `appeal_id` | Row Lock | Decision UUID | `Single Atomic RPC Transaction` | `APPEAL_DECIDED_UPHELD` | `DECISION_FAILED` | User Retry |
| `UNDER_REVIEW` | `DECIDED_REJECTED` | `APPEAL` | Appeal Reviewer | `grading.appeal.process` | Review completed, score maintained | Active appeal review | `appeal_id` | Row Lock | Decision UUID | `Single Atomic RPC Transaction` | `APPEAL_DECIDED_REJECTED` | `DECISION_FAILED` | User Retry |
| `UNDER_REVIEW` | `DECIDED_REGRADE` | `APPEAL` | Appeal Reviewer | `grading.appeal.process` | Review completed, full regrade mandated | Active appeal review | `appeal_id` | Row Lock | Decision UUID | `Single Atomic RPC Transaction` | `APPEAL_DECIDED_REGRADE` | `DECISION_FAILED` | User Retry |
| `OPEN` | `GRADING_COMPLETE` | `BATCH` | System / Worker | `system.cron` | All responses in batch graded | Unfinalized count == 0 | `batch_id` | Row Lock | Batch Check ID | `Single Atomic RPC Transaction` | `BATCH_GRADING_COMPLETED` | `UNFINISHED_RESPONSES` | Auto Job Retry |
| `GRADING_COMPLETE` | `FINALIZATION_PENDING` | `BATCH` | Manager / RPC | `grading.batch.finalize` | Batch complete, no open conflicts | Status `GRADING_COMPLETE` | `batch_id` | Row Lock | Finalize Batch ID | `Single Atomic RPC Transaction` | `BATCH_FINALIZATION_INITIATED` | `BATCH_NOT_READY` | User Retry |
| `FINALIZATION_PENDING` | `FINALIZED` | `BATCH` | Finalize RPC | `grading.batch.finalize` | All responses set to `FINALIZED` | Atomic batch finalize | `batch_id` | Row Lock | Finalize Execution ID | `Single Atomic RPC Transaction` | `BATCH_FINALIZED` | `FINALIZATION_FAILED` | Auto Retry |
| `FINALIZED` | `RELEASE_PENDING` | `BATCH` | Manager / Release RPC | `release.batch.execute` | Authorized release trigger | Status `FINALIZED` | `batch_id` | Row Lock | Release Trigger ID | `Single Atomic RPC Transaction` | `BATCH_RELEASE_PENDING` | `RELEASE_DENIED` | Admin Retry |
| `RELEASE_PENDING` | `RELEASED` | `BATCH` | Outbox Dispatcher | `system.cron` | Outbox notifications generated | Status `RELEASE_PENDING` | `batch_id` | Row Lock | Dispatch Run ID | `Single Atomic RPC Transaction` | `BATCH_RELEASED` | `DISPATCH_FAILED` | Auto Job Retry |
| `FINALIZED` | `REOPENED` | `BATCH` | Manager / Emergency | `grading.reopen.execute` | Authorized emergency batch reopen | Manager capability check | `batch_id` | Row Lock | Reopen Ref ID | `Single Atomic RPC Transaction` | `BATCH_REOPENED` | `REOPEN_DENIED` | Admin Retry |
| `RELEASED` | `REOPENED` | `BATCH` | Manager / Emergency | `grading.reopen.execute` | Authorized post-release reopen | Emergency audit required | `batch_id` | Row Lock | Reopen Ref ID | `Single Atomic RPC Transaction` | `BATCH_REOPENED_POST_RELEASE` | `REOPEN_DENIED` | Admin Retry |
| `REOPENED` | `FINALIZATION_PENDING` | `BATCH` | Manager / System | `grading.batch.finalize` | Reopen issues resolved, all responses finalized, release blocked during reopen | CAS on `batch_version` | `expected_batch_version` | Row Lock | Batch Reopen Finalize UUID | `Single Atomic RPC Transaction` | `BATCH_REOPENED_TO_FINALIZATION_PENDING` | `BATCH_NOT_READY` | Admin Retry |
| `OPEN` | `CANCELLED` | `BATCH` | Manager | `grading.batch.cancel` | Session cancelled by institutional policy | Status `OPEN` | `batch_id` | Row Lock | Cancel Ref ID | `Single Atomic RPC Transaction` | `BATCH_CANCELLED` | `CANCEL_DENIED` | Admin Retry |
| `PENDING` | `CLAIMED` | `OUTBOX` | Outbox Worker | `system.cron` | Unclaimed notification in outbox | Claim token generation | `outbox_id` | `FOR UPDATE NOWAIT` | Claim Token UUID | `Single Atomic RPC Transaction` | `OUTBOX_CLAIMED` | `ALREADY_CLAIMED` | Auto Job Retry |
| `CLAIMED` | `SENT` | `OUTBOX` | Outbox Worker | `system.cron` | External provider accepted delivery | Active claim token match | `claim_token` | Row Lock | Delivery Msg ID | `Single Atomic RPC Transaction` | `OUTBOX_DELIVERED` | `DELIVERY_FAILED` | Auto Job Retry |
| `CLAIMED` | `RETRY_WAIT` | `OUTBOX` | Outbox Worker | `system.cron` | Temporary provider failure | `attempt_count < max_attempts` | `claim_token` | Row Lock | Retry Ref ID | `Single Atomic RPC Transaction` | `OUTBOX_RETRY_SCHEDULED` | `RETRY_FAILED` | Auto Job Retry |
| `RETRY_WAIT` | `CLAIMED` | `OUTBOX` | Outbox Worker | `system.cron` | `NOW() >= next_attempt_at` | Claim token generation | `outbox_id` | `FOR UPDATE NOWAIT` | Re-claim Token UUID | `Single Atomic RPC Transaction` | `OUTBOX_RECLAIMED` | `NOT_DUE_YET` | Auto Job Retry |
| `CLAIMED` | `DEAD_LETTER` | `OUTBOX` | Outbox Worker | `system.cron` | `attempt_count >= max_attempts` | Max retries exceeded | `claim_token` | Row Lock | DLQ Ref ID | `Single Atomic RPC Transaction` | `OUTBOX_MOVED_TO_DLQ` | `DELIVERY_FAILED` | System Admin Review |
| `RETRY_WAIT` | `DEAD_LETTER` | `OUTBOX` | System Admin | `outbox.dlq.manual` | Manual transfer to DLQ | Admin capability check | `outbox_id` | Row Lock | Manual DLQ Ref | `Single Atomic RPC Transaction` | `OUTBOX_MANUAL_DLQ` | `TRANSFER_DENIED` | Admin Retry |
| `PENDING` | `CANCELLED` | `OUTBOX` | System / Manager | `outbox.cancel.execute` | Associated batch or appeal cancelled | Status `PENDING` or `RETRY_WAIT` | `outbox_id` | Row Lock | Cancel Ref ID | `Single Atomic RPC Transaction` | `OUTBOX_CANCELLED` | `CANCEL_DENIED` | No Retry |
| `RETRY_WAIT` | `CANCELLED` | `OUTBOX` | System / Manager | `outbox.cancel.execute` | Associated batch or appeal cancelled | Status `PENDING` or `RETRY_WAIT` | `outbox_id` | Row Lock | Cancel Ref ID | `Single Atomic RPC Transaction` | `OUTBOX_CANCELLED` | `CANCEL_DENIED` | No Retry |

> [!IMPORTANT]
> **خلاصة فحص ومطابقة مصفوفة الانتقالات التنفيذية:**
> - **إجمالي عدد آلات الحالات الموثقة:** 6 (`RESPONSE`, `ASSIGNMENT`, `REVIEW_ROW`, `APPEAL`, `BATCH`, `OUTBOX`)
> - **الصفوف المختلطة (Mixed-machine rows):** 0 (كل صف يحدد آلة واحدة فقط بشكل صريح في حقل `Target Machine`)
> - **الحالات غير الصالحة (Invalid states):** 0
> - **الحالات غير النهائية بدون مسار خروج (Dead-end non-terminal states):** 0
> - **توفر حدود المعاملة الذرية (Transaction Boundary):** محدد في 100% من الصفوف
> - **توفر الفاعل والصلاحية (Actor & Capability):** محدد في 100% من الصفوف
> - **توفر مفتاح التكافؤ (Idempotency Key):** محدد في 100% من الصفوف
> - **توفر حدث التدقيق وكود الفشل (Audit Event & Failure Code):** محدد في 100% من الصفوف

### 5.9. العقد المرجعي المشترك لإنشاء تعيين جديد بعد الإعادة أو إعادة الفتح (`NEW_GRADING_ASSIGNMENT_AFTER_RETURN_OR_REOPEN`) `[REQUIRED_EXTENSION]`

> [!IMPORTANT]
> **العقد التنفيذي الإجباري لإنشاء تعيين جديد بعد الإعادة أو إعادة الفتح (New Assignment Lifecycle Contract):**
> عند انتقال الإجابة من `RETURNED_FOR_SECOND_REVIEW` → `IN_GRADING` أو من `REOPENED` → `IN_GRADING`، يُطبق العقد المرجعي المشترك التالي صراحة داخل النظام:
>
> 1. **إنشاء Assignment جديد بالكامل (`new_assignment_id generated server-side`)**: لا يُعاد فتح أو تعديل سجل `grading_assignment` السابق الذي وصل لحالة نهائية (`SUBMITTED` / `RECLAIMED` / `EXPIRED`). يتم إنشاء سجل تعيين فريد جديد بنطاق معزول (`CREATE new grading_assignment row`).
> 2. **التزايد الرتيب للجيل (`monotonic assignment_generation`)**: يزداد رقم الجيل آلياً بمقدار 1 (`assignment_generation = previous_generation + 1`) لإبطال كافة الرموز والطلبات السابقة (`generation increment`).
> 3. **إصدار رمز حجز جديد وفريد (`new unique lease_token`)**: يُصنع رمز `lease_token` فريد وجديد للمصاحبة؛ بينما يُرفض ويبطل رمز الحجز القديم نهائياً (`old lease_token is invalid and rejected`).
> 4. **ثبات السجلات السابقة (Immutable & Append-Only History)**: تبقى التكليفات وصفوف المراجعات النهائية السابقة ثنائية الثبات وغير قابلة للتعديل (`previous assignment remains immutable`, `previous review rows are append-only and immutable`).
> 5. **فحص النسخة المتوقعة ذرياً ومجرد المصحح المعيّن (`atomic CAS on expected_response_version & assigned-grader-only claim`)**: يُنفذ الشرط الذري لمطابقة `expected_response_version required` لحظر التضارب التزامني (`compare-and-swap failure aborts the entire transaction / atomic CAS`)؛ ومجرد المصحح المعين أو المعاد تعيينه صراحة فقط هو من يستطيع المطالبة والتقييم (`only explicitly assigned grader_user_id may claim / assigned-grader-only claim`).
> 6. **السبب الإجباري وحد المعاملة والتدقيق (`Mandatory Reason, Single Atomic RPC Transaction & Audit Provenance`)**: تشترط العملية وجود سبب إجباري للإعادة أو إعادة الفتح (`return_reason / guidance_notes mandatory` أو `reopen_reason mandatory`)، ومفتاح تكافؤ إجباري (`idempotency_key mandatory and replay-safe`)، وتُنفذ المعاملة ذرياً بالكامل: `assignment creation + generation increment + lease creation + response transition + audit event occur in one atomic transaction` مع تسجيل حدث تدقيق موثق (`RESPONSE_SECOND_REVIEW_STARTED` أو `RESPONSE_REOPENED_TO_IN_GRADING`).
> 7. **سلسلة التجاوز والتتبع لاحقاً (`Supersession Chain & Provenance`)**: يُحفظ التقييم النهائي السابق بالكامل، ويتم إنشاء سلسلة تجاوز تتابعية (`supersession chain created only upon submitting new correction`) عند تقديم التصحيح الجديد لاحقاً.

#### 5.9.1. دلالات الفشل وقواعد الإلغاء الذري (Failure Semantics & Atomic Rollback Rules)

> [!CAUTION]
> **قواعد ومحددات الفشل والإلغاء الذري المعيارية (Failure Semantics Constraints):**
> 1. **الإلغاء التام للمعاملة عند الفشل (`Atomic Transaction Rollback`)**: أي فشل في أي خطوة من المعاملة يؤدي فوراً إلى تراجع المعاملة بالكامل (`Rollback entire transaction`).
> 2. **منع انتقال الحالة الجزئي (`No Partial Response Transition`)**: لا تنتقل حالة الإجابة إلى `IN_GRADING` عند حدوث أي فشل في إنشاء التعيين أو تسجيل التدقيق.
> 3. **عدم إنشاء Assignment بلا Audit Event (`No Assignment without Audit Event`)**: لا ينشأ سجل `grading_assignment` جديد دون إدراج حدث التدقيق المقابل ذرياً.
> 4. **عدم تسجيل Audit Event بلا Assignment ناجح (`No Audit Event without Successful Assignment`)**: لا يُسجل حدث تدقيق في حال فشل المعاملة أو تراجعها.
> 5. **إبطال الـLease القديم صراحة (`No New Lease Active while Old Lease Remains Active`)**: لا يبدأ Lease جديد إلا مع إبطال القديم تماماً؛ وفي حال فشل العملية يبقى التكليف السابق ثابتاً وتلغى رموز الحجز الجديدة.
> 6. **ربط زيادة الجيل بنجاح المعاملة (`No Generation Change without Successful Assignment`)**: لا تتغير قيمة `assignment_generation` إلا عند إتمام المعاملة بنجاح.
> 7. **حظر Claim على المصحح غير المعيّن (`Assigned-Grader-Only Claim`)**: لا يُسمح للمستخدم غير المعيّن بالـClaim أو الاستلام إطلاقاً (`only the explicitly assigned grader_user_id may claim the new assignment`).
> 8. **تكرار طلب التكافؤ بنفس المفتاح (`Replay-Safe Idempotency Behavior`)**: الاستدعاء المتكرر بنفس `idempotency_key` والمحتوى يُرجع النتيجة الأصيلة السابقة ولا ينشئ Assignment إضافياً (`replay-safe idempotency behavior`).
> 9. **رفض التكرار بمحتوى مختلف (`Payload Conflict Rejection`)**: الاستدعاء المتكرر بنفس `idempotency_key` ولكن بمحتوى مختلف يُرفض كلياً بـ `DUPLICATE_IDEMPOTENCY_REQUEST`.
> 10. **توحيد أكواد الفشل القانونية (`Unified Canonical Failure Codes`)**: تستخدم مسارات `RETURNED` و`REOPENED` الأكواد المعيارية الموحدة ذاتها عند تماثل الشرط لمنع الازدواجية واختبار السلوك مستقبلاً.

| Failure condition | Canonical code | Transaction result | Retryable | Audit result |
| :--- | :--- | :--- | :---: | :--- |
| فشل إنشاء سجل التعيين (`new grading_assignment creation failure`) | `ASSIGNMENT_CREATION_FAILED` | Transaction Rollback | YES | No Audit Event |
| تعارض أو تكرار معرف التعيين (`new_assignment_id collision/conflict`) | `ASSIGNMENT_ID_COLLISION` | Transaction Rollback | YES | No Audit Event |
| عدم مطابقة نسخة الإجابة المتوقعة (`response version mismatch`) | `RESPONSE_VERSION_MISMATCH` | Transaction Rollback | YES | No Audit Event |
| فشل شرط المقارنة والتبديل (`CAS failure / conflict`) | `CAS_CONFLICT` | Transaction Rollback | YES | No Audit Event |
| عدم مطابقة جيل التعيين (`assignment_generation mismatch`) | `ASSIGNMENT_GENERATION_MISMATCH` | Transaction Rollback | YES | No Audit Event |
| تعارض رمز الحجز الجديد (`lease token collision`) | `LEASE_TOKEN_COLLISION` | Transaction Rollback | YES | No Audit Event |
| تقديم رمز حجز قديم أو منتهي (`stale/old lease presented`) | `STALE_LEASE_PRESENTED` | Transaction Rollback | NO | No Audit Event |
| عدم مطابقة المصحح المعيّن (`assignee mismatch / unassigned claim`) | `ASSIGNEE_MISMATCH` | Transaction Rollback | NO | No Audit Event |
| طلب غير مصرح به للمطالبة (`unauthorized claim / authority missing`) | `UNAUTHORIZED_CLAIM` | Transaction Rollback | NO | No Audit Event |
| غياب السبب الإجباري (`missing mandatory guidance_notes / reopen_reason`) | `MISSING_MANDATORY_REASON` | Transaction Rollback | NO | No Audit Event |
| غياب صلاحية إعادة الفتح (`reopen capability / authority missing`) | `REOPEN_UNAUTHORIZED` | Transaction Rollback | NO | No Audit Event |
| تكرار مفتاح التكافؤ بمحتوى مختلف (`duplicate idempotency request with payload conflict`) | `DUPLICATE_IDEMPOTENCY_REQUEST` | Transaction Rollback | NO | No Audit Event |
| فشل إدراج سجل التدقيق (`audit event insertion failure`) | `AUDIT_INSERTION_FAILED` | Transaction Rollback | YES | No Audit Event |

---

## 6. إغلاق السباقات وحالات التنافس (Race Conditions Resolution) `[REQUIRED_EXTENSION]`

تم إغلاق كافة السباقات التزامنية بضوابط ذرية صارمة على مستوى السيرفر:

1. **`claim` مقابل `claim`**:
   - قيد فرادة جزئي فريد (Unique Partial Constraint) على `grading_assignments (response_id, assignment_role) WHERE status = 'CLAIMED'`.
   - استخدام قفل الصف الذري `FOR UPDATE NOWAIT` يضمن نجاح المطالب الأول ورفض الثاني فوراً بـ `ALREADY_CLAIMED`.
2. **`heartbeat` مقابل `expire`**:
   - يفحص الـ RPC حالة الصف والوقت تزامناً؛ إذا سبقت وظيفة الخلفية وشكلت `EXPIRED` يفشل الـ heartbeat باستثناء `LEASE_EXPIRED`.
3. **`submit` مقابل `reclaim`**:
   - عند إجراء `reclaim` يزيد السيرفر قيمة `assignment_generation` آلياً.
   - عند التقديم يفحص الـ RPC مطابقة `fencing_token` مع `assignment_generation`؛ فإذا تم السحب يُرفض التقديم بـ `STALE_FENCING_TOKEN`.
4. **`release` مقابل `submit`**:
   - ينفذ `submit` معاملة ذرية تلغي الـ Lease؛ وإذا تم التحرير أولاً تصبح حالة التعيين `RELEASED` فيفشل التقديم لعدم وجود قفل نشط.
5. **`finalize` مقابل `finalize`**:
   - يعتمد الاعتماد النهائي على تقنية Compare-And-Swap (CAS) عبر فحص `expected_version`. الأول يغير `is_final = true` والصفة لـ `FINALIZED` والثاني يفشل بـ `ALREADY_FINALIZED`.
6. **`finalize` مقابل `reopen`**:
   - لا يمكن تشغيل `reopen` إلا على إجابة بحالة `FINALIZED` مؤكدة في المعاملة. إذا تزامنا، يُحظر الفتح حتى تكتمل معاملة الاعتماد أولاً.
7. **`reopen` مقابل `reopen`**:
   - يمنع قيد CAS التفرع المزدوج؛ حيث يشترط كل طلب ربط الصف الجديد بالصف النهائي الأخير (`previous_review_id`). الأول ينجح والآخر يفشل ويطلب إعادة الاستعلام.
8. **`appeal` مقابل `regrade`**:
   - يمنع قيد الفرادة المزدوج فتح مسارين متوازيين لنفس الإجابة؛ حيث تُربط حالة الإجابة بـ `APPEALED` وتُجمد أي طلبات `regrade` أخرى حتى البت في الاعتراض.
9. **`correction` مقابل `correction`**:
   - تتم كل إضافة لصف تصحيحي داخل معاملة تسلسلية ذرية تحدث مؤشر `supersession_links` خطياً دون توازٍ.
10. **`outbox enqueue` مقابل `transaction rollback`**:
    - يتم إدراج رسالة الإشعار في `notification_outbox` داخل معاملة الاعتماد النهائي نفسها (`FINALIZED + RELEASED`). إذا تراجعت المعاملة (Rollback)، تلتغي رسالة Outbox آلياً لمنع التسريب.
11. **`batch release` مقابل `unfinished response`**:
    - يفحص RPC نشر الدفعة `release_grading_batch` عدم وجود أي إجابة بحالة غير `FINALIZED`؛ وفي حال وجود إجابة واحدة غير معتمدة تفشل العملية كلياً بـ `UNFINISHED_RESPONSES_IN_BATCH`.
12. **`emergency override` مقابل `normal claim`**:
    - يُجمد التجاوز الطارئ القفل العادي ويزيد `assignment_generation` تتابعياً (Monotonically Increasing Generation) بمقدار 1 مع فحص الجيل المتوقع (Expected Generation Check) وتنفيذ معاملة Compare-And-Swap (CAS) الذرية، مما يبطل قفل المصحح العادي فوراً عند محاولة التقديم برمز قديم مع التوثيق الكامل في Audit Trail.

---

## 7. سياسة الدرجة النهائية والتصحيح المزدوج وحماية الخصوصية (Final Score Policy & Blind Privacy) `[REQUIRED_EXTENSION]`

### 7.1. قواعد التقييم الأحادي والمزدوج والتحكيم
1. **التصحيح الأحادي (Single Grading)**: تقديم درجة واحدة من المصحح المعتمد وتتحول لـ `FINALIZED` عند استيفاء الضوابط.
2. **التصحيح المزدوج مع التطابق التام (Exact Agreement)**: إذا كانت $\text{Score}_1 = \text{Score}_2$ تتأكد الدرجة آلياً وتتحول لـ `FINALIZED`.
3. **التصحيح المزدوج فوق عتبة الانحراف (Above Threshold > 15%)**: التحكيم الإجباري (Arbitration Mandatory) عبر `senior grader`.
4. **التصحيح المزدوج ضمن عتبة الانحراف (Within Threshold $\le 15\%$):**
   - **معتمدة بقرار المالك `ODR-013` (APPROVED)**.
   - السياسة المعتمدة: المتوسط الحسابي للتقييمين (Arithmetic Mean).

### 7.2. حماية خصوصية التصحيح المزدوج (Double Marking Blind Privacy) `[REQUIRED_EXTENSION]`
- كل مصحح يحصل على `assignment` مستقل كلياً.
- يُمنع المصحح من معرفة وجود أو هوية المصحح الثاني.
- يُمنع المصحح من رؤية درجات أو ملاحظات المصحح الثاني قبل إرسال تقييمه المكتمل.
- يُمنع المصحح من رؤية هوية الطالب (Blind Token).
- يُمنع المصحح من استعلام صف التقييم الموازي (`counterpart review row`).
- المحكم (`Senior Arbitrator`) يرى التقييمين المستقلين فقط بعد اكتمالهما معاً.
- مدير التصحيح يرى البيانات التشغيلية فقط (Operational Metadata) قبل الوصول لـ `FINALIZED`.
- **إنفاذ الخصوصية يتم عبر RLS وRPC Projection حصرياً، وليس عبر واجهة المستخدم UI فقط**.

---

## 8. دورة حياة صندوق الإشعارات (Notification Outbox Lifecycle) `[REQUIRED_EXTENSION]`

### 8.1. حالات Outbox السلسلية:
- **`PENDING`**: إشعار متولد داخل المعاملة ينتظر المعالجة.
- **`CLAIMED`**: الرسالة محجوزة بواسطة موجه الإشعارات عبر `claim_token`.
- **`SENT`**: تم تسليم الإشعار بنجاح للمزود الخارجي/الطالب.
- **`RETRY_WAIT`**: تعثر تسليم مؤقت وتحت انتظار إعادة المحاولة (Exponential Backoff).
- **`DEAD_LETTER`**: بلغت المحاولات حدها الأقصى وتتطلب تدخل يدوي.
- **`CANCELLED`**: تم إلغاء الإشعار بسبب تعديل لاحق أو تراجع إداري.

### 8.2. الضوابط التشغيلية لـ Outbox:
- **المعلمات**: `claim_token`, `visibility_timeout` (5 دقائق), `attempt_count` (Max 5), `next_attempt_at`, `deduplication_key`, `idempotency_key`.
- **التعافي**: دعم Replay اليدوي للإشعارات المعطلة في `DEAD_LETTER` مع توثيق السجل.
- **شرط الإرسال الحتمي**: **يُحظر إرسال أو معالجة أي إشعار قبل الوصول التام لحالتي: `FINALIZED + RELEASED`**.

---

## 9. سجل قرارات المالك الشامل

### 9.1. جدول تتبع هوية قرارات المالك والأسماء المستعارة (Owner Decisions Traceability & Alias Mapping Table) `[REQUIRED_EXTENSION]`

| Original ID | Canonical ID | Subject | Status | Gate task | Approved by | Approved on | Approval basis |
| ----------- | ------------ | ------------------------------------- | -------- | ----------- | ----------- | ----------- | ------------------------------------ |
| OD-MG-13 | ODR-013 | Within-threshold final score rule | APPROVED | TASK-MG-046 | PROJECT_OWNER | 2026-08-03 | OWNER_APPROVAL_BY_REGISTERED_SUBJECT |
| OD-MG-14 | ODR-014 | Double-marking assignment slot policy | APPROVED | TASK-MG-045 | PROJECT_OWNER | 2026-08-03 | OWNER_APPROVAL_BY_REGISTERED_SUBJECT |
| OD-MG-15 | ODR-015 | Expiry/reclaim authority policy | APPROVED | TASK-MG-023 | PROJECT_OWNER | 2026-08-03 | OWNER_APPROVAL_BY_REGISTERED_SUBJECT |
| OD-MG-16 | ODR-016 | Practice batch-release policy | APPROVED | TASK-MG-069 | PROJECT_OWNER | 2026-08-03 | OWNER_APPROVAL_BY_REGISTERED_SUBJECT |

> [!NOTE]
> **قواعد التتبع والهوية القانونية:**
> - **المعرفات القديمة (Original IDs)**: تبقى أسماء مستعارة (Documented Aliases) موثقة قانونياً لضمان التتبع التاريخي (`OD-MG-13` → `ODR-013`, `OD-MG-14` → `ODR-014`, `OD-MG-15` → `ODR-015`, `OD-MG-16` → `ODR-016`).
> - **المعرفات القانونية الموحدة (Canonical IDs)**: هي `ODR-001` إلى `ODR-016`.
> - **حالة القرارات (Decision Status)**: تم اعتماد كافة القرارات الـ 16 رسمياً بقرار المالك (`Approved = 16`).
> - **القرارات المفتوحة (Open Decisions)**: `0` قرار مفتوح (`NEEDS_OWNER_DECISION = 0`).

### 9.2. سجل قرارات المالك المعتمدة (Owner Decision Register - 16 Decisions) `[OWNER_DECISION]`

يشتمل هذا السجل على كافة القرارات الـ 16 المعتمدة رسمياً من مالك المنتج (PROJECT_OWNER) بتاريخ 2026-08-03 وفق أساس الاعتماد موضوعياً (OWNER_APPROVAL_BY_REGISTERED_SUBJECT)، وحالتها جميعاً `APPROVED`:

| ID القرار | موضوع القرار | الخيارات المتاحة | الأثر العملياتي | المخاطر المحتملة | التوصية الفنية / القرار المعتمد | الأثر الهيكلي (Schema) | الأثر التنفيذي (Runtime) | الإرجاء المسموح | المرحلة الحاكمة | الحالة |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ODR-001** | مهلة القفل المؤقت (Lease TTL) | 10د / 15د / 30د | احتجاز الإجابة | احتكار عند الانقطاع | 15د مع Heartbeat وتجديد أثناء النشاط | إضافة حقل TTL | ضبط مؤقتات UI | حتى MVP | MVP | `APPROVED` |
| **ODR-002** | مهل SLA للامتحانات | 12س / 24س / 48س | سرعة النتائج | ضغط المصححين | 24س عادي / 48س للحالات المصعّدة | جداول التنبيهات | مجدول التصعيد | حتى MVP | MVP | `APPROVED` |
| **ODR-003** | عتبة تنبيه SLA Alert | 50% / 75% / 90% | توقيت التنبيه | كثرة الإزعاج | 75% من مهلة SLA | حقول العتبات | خدمة التنبيهات | حتى MVP | P1 | `APPROVED` |
| **ODR-004** | حد انحراف التصحيح المزدوج | 10% / 15% / 20% | نسبة التحكيم | عبء المحكمين | 15% من snapshot-pinned max_score | حقل Variance | شرط RPC التحكيم | حتى P1 | P1 | `APPROVED` |
| **ODR-005** | نسبة عينة الجودة (QA Sample) | 3% / 5% / 10% | حجم العينات | استهلاك الوقت | 5% عشوائي | جدول العينات | مجدول العينات | حتى P1 | P2 | `APPROVED` |
| **ODR-006** | نافذة تقديم التظلم | 3د / 7د / 14د | فترة الاعتراض | تراكم الطلبات | 7 calendar days من نشر النتيجة | حقل Window | شرط RPC الاعتراض | حتى P1 | P1 | `APPROVED` |
| **ODR-007** | سلطة الاعتماد النهائي | Senior / Manager | مسؤولية `is_final` | اختناق الإدارة | Reviewer أو Authorized Senior Grader فقط (ممنوع Ordinary Grader وManager وEmergency وSystem) | قيود RPC | فحص الصلاحية | حتى MVP | MVP | `APPROVED` |
| **ODR-008** | سلطة حسم التحكيم | Senior / Panel | حسم النزاعات | تأخر البت | Independent Senior Grader فقط (لم يشارك بالتقييمين ولا COI) | RLS policy | RPC التحكيم | حتى P1 | P1 | `APPROVED` |
| **ODR-009** | سلطة الفتح الاستثنائي | Manager / Emergency | إعادة الفتح | التلاعب بالنتائج | Grading Manager والطوارئ بتفويض مؤقت | Audit Table | RPC الفتح | حتى P1 | P1 | `APPROVED` |
| **ODR-010** | سلطة نشر الدفعة | Manager / System | نشر النتائج | نشر غير مكتمل | Batch release mandatory للامتحانات عبر Manager | Batch table | RPC الإفراج | حتى MVP | MVP | `APPROVED` |
| **ODR-011** | Batch Release للتمارين | نعم / لا | توقيت التمارين | تأخير التدريب | IMMEDIATE أو DELAYED أو BATCH حسب النشاط | Flag في النشاط | مسار التدريب | حتى MVP | MVP | `APPROVED` |
| **ODR-012** | نطاق التصحيح المزدوج | الكل / امتحانات فقط | استهلاك الموارد | مضاعفة التكلفة | PRIMARY_GRADER + COUNTERPART_GRADER مستقلان | Schema flags | شرط التوزيع | حتى P1 | P1 | `APPROVED` |
| **ODR-013** | قاعدة الدرجة ضمن الانحراف | المتوسط/الأعلى/الأقل/الأول/الثاني | احتساب النهائي | اعتراضات الخلاف | المتوسط الحسابي للتقييمين (Arithmetic Mean) | Formula Column | RPC Calculation | حتى P1 | P1 | `APPROVED` |
| **ODR-014** | تعيين شقوق التصحيح المزدوج | التزامن / التتابع | طريقة التكليف | تأخير التقييم الثاني | التزامن المستقل (Independent dual slots) | Slots Enum | Auto Dispatch | حتى P1 | P1 | `APPROVED` |
| **ODR-015** | سلطة الانقضاء والسحب | آلي / يدوي / مختلط | إطلاق المهام | إرجاع مبكر جداً | آلي عبر Worker وتدخل يدوي لمدير التصحيح | Job Config | Expiry Worker | حتى MVP | MVP | `APPROVED` |
| **ODR-016** | إفراج دفعة الممارسة التدريبية | تجميعي / فوري | إظهار الحلول | تسريب التمارين | Reveal policy: الامتحان بعد Final release، الممارسة حسب الإعداد | Practice Flags | Immediate Outbox | حتى MVP | MVP | `APPROVED` |


#### مصفوفة التحقق من علاقات بوابات القرارات (Verifiable Owner Decisions Gate Matrix)

| Decision | Gate task | Affected tasks | Direct/Transitive dependency | Valid |
| :--- | :--- | :--- | :--- | :--- |
| **ODR-001** | `TASK-MG-022` | `TASK-MG-021`, `TASK-MG-023`, `TASK-MG-024`, `TASK-MG-025`, `TASK-MG-026`, `TASK-MG-030` | Transitive via `TASK-MG-022` | `YES` |
| **ODR-002** | `TASK-MG-017` | `TASK-MG-027` | Direct | `YES` |
| **ODR-003** | `TASK-MG-027` | `TASK-MG-070` | Direct | `YES` |
| **ODR-004** | `TASK-MG-046` | `TASK-MG-047`, `TASK-MG-050` | Direct | `YES` |
| **ODR-005** | `TASK-MG-048` | `TASK-MG-050` | Direct | `YES` |
| **ODR-006** | `TASK-MG-056` | `TASK-MG-055`, `TASK-MG-057` | Direct | `YES` |
| **ODR-007** | `TASK-MG-051` | `TASK-MG-052`, `TASK-MG-053`, `TASK-MG-061` | Direct | `YES` |
| **ODR-008** | `TASK-MG-047` | `TASK-MG-051`, `TASK-MG-058` | Direct / Transitive | `YES` |
| **ODR-009** | `TASK-MG-054` | `TASK-MG-075`, `TASK-MG-080` | Direct / Transitive | `YES` |
| **ODR-010** | `TASK-MG-062` | `TASK-MG-063`, `TASK-MG-064` | Direct | `YES` |
| **ODR-011** | `TASK-MG-069` | `TASK-MG-064` | Direct | `YES` |
| **ODR-012** | `TASK-MG-045` | `TASK-MG-046`, `TASK-MG-047` | Direct | `YES` |
| **ODR-013** | `TASK-MG-046` | `TASK-MG-034`, `TASK-MG-051` | Direct | `YES` |
| **ODR-014** | `TASK-MG-045` | `TASK-MG-046` | Direct | `YES` |
| **ODR-015** | `TASK-MG-023` | `TASK-MG-028` | Direct | `YES` |
| **ODR-016** | `TASK-MG-069` | `TASK-MG-063`, `TASK-MG-064`, `TASK-MG-067` | Direct | `YES` |

> [!IMPORTANT]
> **خلاصة القبول الشامل لبوابات قرارات المالك:**
> - **إجمالي قرارات المالك:** 16
> - **إجمالي ربط القرارات بالبوابات (Decision mappings):** 16
> - **عدد بوابات القرارات الفريدة (Unique gate tasks):** 14
> - **الربط الصحيح القابل للتحقق (Valid mappings):** 16/16 (`Valid = YES`)
> - **الربط الخاطئ (Invalid mappings):** 0
> - **الربط المفقود (Missing mappings):** 0
> - **القرارات المعتمدة حالياً (Approved decisions):** 16 (`APPROVED`)
> - **القرارات المفتوحة المنتظرة (Open decisions):** 0 (`NEEDS_OWNER_DECISION` resolved)

### 9.3. مصفوفة بوابات قرارات المالك واعتماديات المهام (Owner Decision Gates Matrix) `[REQUIRED_EXTENSION]`

تربط هذه المصفوفة كل قرار من القرارات الـ 16 المعتمدة بحالة `APPROVED` بعقد بوابة تنفيذي محدد (`Gate Task`) تعتمد عليه المهمات التطبيقية المتأثرة صراحةً، مع بقاء كافة البوابات التطبيقية بحالة غير منفذة (`NOT_IMPLEMENTED`):

| Decision ID | Gate Task | Dependent Tasks | Blocking Phase | Status | Owner Decision Gate |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ODR-001** | `TASK-MG-022` (Lease Lock Model) | `TASK-MG-021`, `TASK-MG-023`, `TASK-MG-024`, `TASK-MG-025`, `TASK-MG-026`, `TASK-MG-030` | `MVP` | `APPROVED` | `SATISFIED_BY_OWNER_APPROVAL` |
| **ODR-002** | `TASK-MG-017` (SLA Warning Filter) | `TASK-MG-027` | `MVP` | `APPROVED` | `SATISFIED_BY_OWNER_APPROVAL` |
| **ODR-003** | `TASK-MG-027` (Escalation Alert Dispatch) | `TASK-MG-070` | `P1` | `APPROVED` | `SATISFIED_BY_OWNER_APPROVAL` |
| **ODR-004** | `TASK-MG-046` (Score Variance Check) | `TASK-MG-047`, `TASK-MG-050` | `P1` | `APPROVED` | `SATISFIED_BY_OWNER_APPROVAL` |
| **ODR-005** | `TASK-MG-048` (Random QA Sampling) | `TASK-MG-050` | `P2` | `APPROVED` | `SATISFIED_BY_OWNER_APPROVAL` |
| **ODR-006** | `TASK-MG-056` (Appeals Window Control) | `TASK-MG-055`, `TASK-MG-057` | `P1` | `APPROVED` | `SATISFIED_BY_OWNER_APPROVAL` |
| **ODR-007** | `TASK-MG-051` (Atomic Finalize RPC) | `TASK-MG-052`, `TASK-MG-053`, `TASK-MG-061` | `MVP` | `APPROVED` | `SATISFIED_BY_OWNER_APPROVAL` |
| **ODR-008** | `TASK-MG-047` (Senior Arbitration View) | `TASK-MG-051`, `TASK-MG-058` | `P1` | `APPROVED` | `SATISFIED_BY_OWNER_APPROVAL` |
| **ODR-009** | `TASK-MG-054` (Emergency Reopen RPC) | `TASK-MG-075`, `TASK-MG-080` | `P1` | `APPROVED` | `SATISFIED_BY_OWNER_APPROVAL` |
| **ODR-010** | `TASK-MG-062` (Batch Release Trigger) | `TASK-MG-063`, `TASK-MG-064` | `MVP` | `APPROVED` | `SATISFIED_BY_OWNER_APPROVAL` |
| **ODR-011** | `TASK-MG-069` (Practice Immediate Release) | `TASK-MG-064` | `MVP` | `APPROVED` | `SATISFIED_BY_OWNER_APPROVAL` |
| **ODR-012** | `TASK-MG-045` (Dual Independent Assignment) | `TASK-MG-046`, `TASK-MG-047` | `P1` | `APPROVED` | `SATISFIED_BY_OWNER_APPROVAL` |
| **ODR-013** | `TASK-MG-046` (Score Variance & Arithmetic Mean) | `TASK-MG-034`, `TASK-MG-051` | `P1` | `APPROVED` | `SATISFIED_BY_OWNER_APPROVAL` |
| **ODR-014** | `TASK-MG-045` (Dual Independent Assignment) | `TASK-MG-046` | `P1` | `APPROVED` | `SATISFIED_BY_OWNER_APPROVAL` |
| **ODR-015** | `TASK-MG-023` (Auto-Release Expired Job) | `TASK-MG-028` | `MVP` | `APPROVED` | `SATISFIED_BY_OWNER_APPROVAL` |
| **ODR-016** | `TASK-MG-069` (Practice Immediate Release) | `TASK-MG-063`, `TASK-MG-064`, `TASK-MG-067` | `MVP` | `APPROVED` | `SATISFIED_BY_OWNER_APPROVAL` |


> [!IMPORTANT]
> **خلاصة القبول الشامل لبوابات قرارات المالك والتنفيذ:**
> - **إجمالي قرارات المالك:** 16
> - **القرارات المعتمدة حالياً (Approved decisions):** 16 (`APPROVED`)
> - **القرارات المفتوحة المنتظرة (Open decisions):** 0
> - **Owner decision gate:** `SATISFIED_BY_OWNER_APPROVAL`
> - **Schema implementation:** `NOT_IMPLEMENTED`
> - **Runtime implementation:** `NOT_IMPLEMENTED`
> - **Security verification:** `NOT_EXECUTED`
> - **E2E verification:** `NOT_EXECUTED`
> - **Launch readiness:** `BLOCKED_UNTIL_IMPLEMENTATION_AND_VERIFICATION`

---

## 10. سجل اعتماد قرارات المالك الرسمي (MANUAL_GRADING_OWNER_DECISIONS_APPROVAL_25) `[REQUIRED_EXTENSION]`

- **Approval Date:** 2026-08-03
- **Authority:** PROJECT_OWNER
- **Approval Basis:** OWNER_APPROVAL_BY_REGISTERED_SUBJECT
- **Scope:** 16 Canonical Owner Decisions (`ODR-001` .. `ODR-016`)

### 10.1. جدول الاعتمادات الرسمية الموثقة (Documented Owner Decision Approvals Table)

| Canonical ID | Exact Registered Subject | Approved Value | Historical Alias | Gate Task | Decision Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ODR-001** | مهلة القفل المؤقت (Lease TTL) | 15 minutes مع Heartbeat وتجديد أثناء النشاط | N/A | `TASK-MG-022` | `APPROVED` |
| **ODR-002** | مهل SLA للامتحانات | 24 hours عادي، 48 hours للحالات المصعّدة | N/A | `TASK-MG-017` | `APPROVED` |
| **ODR-003** | عتبة تنبيه SLA Alert | عند 75% | N/A | `TASK-MG-027` | `APPROVED` |
| **ODR-004** | حد انحراف التصحيح المزدوج | 15% من snapshot-pinned max_score | N/A | `TASK-MG-046` | `APPROVED` |
| **ODR-005** | نسبة عينة الجودة (QA Sample) | 5% | N/A | `TASK-MG-048` | `APPROVED` |
| **ODR-006** | نافذة تقديم التظلم | 7 calendar days من نشر النتيجة | N/A | `TASK-MG-056` | `APPROVED` |
| **ODR-007** | سلطة الاعتماد النهائي | Reviewer أو Authorized Senior Grader فقط (ممنوع Grader وManager وEmergency وSystem) | N/A | `TASK-MG-051` | `APPROVED` |
| **ODR-008** | سلطة حسم التحكيم | Independent Senior Grader فقط (لم يشارك في التقييمين ولا COI) | N/A | `TASK-MG-047` | `APPROVED` |
| **ODR-009** | سلطة الفتح الاستثنائي | Grading Manager فقط (والطوارئ بتفويض مؤقت ومسبب ومدقق) | N/A | `TASK-MG-054` | `APPROVED` |
| **ODR-010** | سلطة نشر الدفعة | Batch release mandatory للامتحانات بواسطة Grading Manager بعد استيفاء المتطلبات | N/A | `TASK-MG-062` | `APPROVED` |
| **ODR-011** | Practice Release Mode | IMMEDIATE أو DELAYED أو BATCH حسب إعداد النشاط (Batch غير إلزامي افتراضياً) | N/A | `TASK-MG-069` | `APPROVED` |
| **ODR-012** | نطاق التصحيح المزدوج | PRIMARY_GRADER + COUNTERPART_GRADER مستقلان (ولا يشغلهما المستخدم نفسه) مقتصر على الامتحانات / الإعدادات المستهدفة | N/A | `TASK-MG-045` | `APPROVED` |
| **ODR-013** | قاعدة الدرجة ضمن الانحراف | المتوسط الحسابي للتقييمين (Arithmetic Mean) | `OD-MG-13` | `TASK-MG-046` | `APPROVED` |
| **ODR-014** | تعيين شقوق التصحيح المزدوج | التزامن المستقل (PRIMARY_GRADER + COUNTERPART_GRADER) | `OD-MG-14` | `TASK-MG-045` | `APPROVED` |
| **ODR-015** | سلطة الانقضاء والسحب | آلي عبر Worker وتدخل يدوي لمدير التصحيح بسبب وتدقيق | `OD-MG-15` | `TASK-MG-023` | `APPROVED` |
| **ODR-016** | إفراج دفعة الممارسة التدريبية | Reveal policy: الامتحان بعد Final release؛ الممارسة حسب إعداد النشاط (فوري بعد التسليم أو حسب الإعداد) | `OD-MG-16` | `TASK-MG-069` | `APPROVED` |

### 10.2. قيود وشروط الحوكمة الصارمة (Governance Restrictions & Disclaimers)

> [!CAUTION]
> **قيود واعتبارات عدم التنفيذ الصريحة (Explicit Non-Execution Governance Constraints):**
> 1. **No implementation authorization**: اعتماد القرارات المكتوبة لا يُعتبر ترخيصاً بتنفيذ الكود التشغيلي أو الـ RPCs أو الشاشات في هذا PR.
> 2. **No migration authorization**: اعتماد القرارات المكتوبة لا يُعتبر ترخيصاً بتطبيق أو إنشاء ملفات SQL/Migrations تنفيذية في داتابيز هذا PR.
> 3. **No deploy authorization**: لا يجوز إجراء أي نشر (Deploy) أو دمج (Merge) بناءً على هذا الاعتماد المكتوبي.
> 4. **Gate Status Isolation**: بوابات الاعتماد تحولت إلى `SATISFIED_BY_OWNER_APPROVAL` على مستوى الحوكمة فقط، بينما تظل بوابات البرمجة والـ Schema والـ Runtime والـ Security والـ E2E بحالة `NOT_IMPLEMENTED` / `NOT_EXECUTED` والإطلاق محظور `BLOCKED_UNTIL_IMPLEMENTATION_AND_VERIFICATION`.

---
*نهاية الوثيقة MANUAL-GRADING-PRODUCT-REQUIREMENTS-01 (Canonical Correction 07)*