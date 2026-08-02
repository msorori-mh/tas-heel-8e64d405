# MANUAL-GRADING-PRODUCT-REQUIREMENTS-01
## متطلبات منتج محرك التصحيح اليدوي وتجربة المراجعة الموحدة — التصحيح القانوني المعتمد 05

> **وثيقة تصميم المنتج والمعمارية الوظيفية (Product & Functional Requirements Document)**
> **الإصدار:** 5.0.0 (Canonical Correction 05)
> **الحالة:** مجمد للتصميم الوثائقي فقط (Design Frozen - Docs Only / No Code / No SQL Execution / No DB / No Deploy)
> **النظام:** منصة تسهيل التعليمية (Tas-heel Engine - Question Bank QB-01)

---

## 0. تمييز النطاق والتنفيذ المستقبلي (Scope Distinction Block)

> [!IMPORTANT]
> **التصحيح القانوني لنطاق الحزمة الحالية مقابل التنفيذ المستقبلي:**
>
> **Current PR (الحزمة الحالية):**
> - **Documentation only**: وثائق تصميمية وتحليلية فقط.
> - **Migration changes = ZERO**: لا توجد أي ملفات migrations أو تعديلات داتابيز في هذا PR.
> - **Runtime changes = ZERO**: لا يوجد أي كود تنفيذي أو شاشات تشغيلية في هذا PR.
> - **SQL = NO**: لا توجد استعلامات أو أوامر SQL تنفيذية في هذا PR.
>
> **Future Implementation (التنفيذ المستقبلي عند الاعتماد):**
> - قد يتطلب Migrations جديدة لبناء الجداول والـ RLS والأنواع.
> - قد يتطلب RLS Policies لحماية الوصول على مستوى الصفوف.
> - قد يتطلب RPCs ذريّة لحماية العمليات وقواعد الأعمال.
> - قد يتطلب Runtime workers/UI لتشغيل الطوابير والواجهات والمؤقتات.
> - يحتاج حزم تنفيذ مستقلة ومراجعة أمنية شاملة قبل أي دمج.
>
> *ملاحظة حظر:* يُمنع استخدام عبارة "Migration Required: NO" بمعيار ينفي حاجة الميزة المستقبلية لقواعد Migrations؛ بل تصف الحزمة الحالية فقط.

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
| `return_for_second_review` | Senior / Reviewer | `grading.review.return` | Subject | `p_response_id, p_guidance_notes` | Status `SUBMITTED` | Row Lock | Action Key | Required | Atomic | `REVIEW_RETURNED` | `{ status: 'RETURNED_FOR_SECOND_REVIEW' }` | `INVALID_RESPONSE_STATE, MISSING_GUIDANCE` | YES | Senior Review UI |
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

تم فصل آلات الحالات إلى ثلاث كائنات مستقلة تماماً منعاً للتداخل المفاهيمي:

### 5.1. آلة حالات تصحيح الإجابة (Response Grading State Machine)
- **`PENDING_MANUAL_GRADING`**: الإجابة متوفرة في الطابور تنتظر التعيين/المطالبة.
- **`IN_GRADING`**: الإجابة محجوزة بقفل مؤقت نشط وتحت التقييم.
- **`SUBMITTED_FOR_REVIEW`**: تم إرسال التقييم الأولي وتنتظر التحكيم أو فحص التباين.
- **`RETURNED_FOR_SECOND_REVIEW`**: أعيدت الإجابة للمصحح التعديلي بطلب مراجعة ثانية.
- **`FINALIZED`**: اعتمدت الدرجة نهائياً وأقفلت.
- **`REOPENED`**: فتحت المراجعة استثنائياً بعد الاعتماد.
- **`APPEALED`**: الإجابة تحت معالجة تظلم قائم من الطالب.

### 5.2. آلة حالات التعيين وقفل المهمة (Assignment / Lease State Machine)
- **`ASSIGNED`**: الإجابة مخصصة لمصحح ولم يطالب بقفلها بعد.
- **`CLAIMED`**: المصحح حصل على القفل المؤقت النشط `lease_token`.
- **`RELEASED`**: حرر القفل يدوياً أو إدارياً وعادت الإجابة للطابور.
- **`EXPIRED`**: انقضت مهلة القفل آلياً دون تقديم.
- **`RECLAIMED`**: سحب التعيين إدارياً وأبطل الرمز القديم.
- **`SUBMITTED`**: استكمل المصحح المهمة وسلم الدرجة بنجاح.
- **`CANCELLED`**: ألغي التعيين بسبب إلغاء المحاولة الامتحانية أو COI.

### 5.3. آلة حالات صف المراجعة السلسلي (Review Row State Machine)
- **`DRAFT`**: مسودة تقييم غير مؤكدة (في الذاكرة النشطة حصراً).
- **`SUBMITTED`**: صف تقييم مقدم ومسجل تتابعياً.
- **`FINAL`**: صف تقييم اعتمد كدرجة نهائية (`is_final = true`).
- **`SUPERSEDED`**: صف تقييم سابق تم إبطال درجاته بصف تصحيحي جديد.
- **`VOIDED`**: صف تقييم ألغي بقرار طوارئ/تحكيم.

> [!CAUTION]
> **قاعدة فصل الحالات:** لا تُعد حالة `SUPERSEDED` حالة عامة للإجابة (`Response`)؛ بل هي حالة خاصة بصف المراجعة الفردي (`Review Row`) داخل السجل التتابعي.

### 5.4. جدول الانتقالات التنفيذية الكاملة (Operational Transitions Matrix) `[REQUIRED_EXTENSION]`

| From State | To State | Target Machine | Actor / Role | Required Capability | Preconditions | Concurrency / Concurrency Guard | Expected Version / Token | Lock Type | Idempotency Key | Audit Event | Failure Code | Retry Behavior |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `ASSIGNED` | `CLAIMED` | Assignment | Grader | `grading.claim.execute` | No active lease, no COI | Partial unique index on active lease | `assignment_gen` | `FOR UPDATE NOWAIT` | Optional | `ASSIGNMENT_CLAIMED` | `ALREADY_CLAIMED` | User Retry |
| `CLAIMED` | `RELEASED` | Assignment | Grader / Manager | `grading.release.execute` | Active lease held by actor | Match `lease_token` | `lease_token` | Row Lock | N/A | `ASSIGNMENT_RELEASED` | `LEASE_NOT_FOUND` | No Retry |
| `CLAIMED` | `EXPIRED` | Assignment | Worker System | `system.cron` | `lease_expires_at < NOW()` | Bulk status check | Status `CLAIMED` | Batch Row Lock | Job Run ID | `ASSIGNMENT_EXPIRED` | `EXPIRE_FAILED` | Auto Job Retry |
| `EXPIRED` | `RECLAIMED` | Assignment | Manager | `grading.release.execute` | Unresponsive grader | Increment `assignment_gen` | Stale `generation` | Row Lock | Admin Ref | `ASSIGNMENT_RECLAIMED` | `ASSIGNMENT_CLOSED` | Admin Retry |
| `CLAIMED` | `SUBMITTED` | Assignment & Response | Grader | `GRADE_MANUAL_RESPONSE` | Valid lease & score bounds | Match `fencing_token` & `gen` | `fencing_token` | Strict Partial Unique | `p_idempotency_key` | `SCORE_SUBMITTED` | `STALE_FENCING_TOKEN` | Re-fetch & Retry |
| `SUBMITTED` | `RETURNED_FOR_SECOND_REVIEW` | Response | Senior / Reviewer | `grading.review.return` | Review submitted, non-final | Status `SUBMITTED` | `review_version` | Row Lock CAS | Action Key | `REVIEW_RETURNED` | `INVALID_RESPONSE_STATE` | User Retry |
| `SUBMITTED` | `FINALIZED` | Response & Review | Senior / Manager | `grading.score.finalize` | Score verified, reason present | Match `expected_version` | `expected_version` | Row Lock | Action Key | `GRADE_FINALIZED` | `MISSING_REASON` | User Retry |
| `FINALIZED` | `REOPENED` | Response | Manager / Emergency | `grading.reopen.execute` | Status `FINALIZED`, reason >= 20c | Compare-And-Swap CAS | Current `final_review_id` | Row Lock CAS | Action Key | `GRADE_REOPENED` | `REASON_TOO_SHORT` | Admin Retry |
| `FINALIZED` | `APPEALED` | Response | Student / System | `student.appeal.create` | Batch `RELEASED`, in window | Single active appeal per response | `batch_finalized_at` | Unique Appeal Index | Student Key | `APPEAL_CREATED` | `APPEAL_WINDOW_EXPIRED` | No Retry |
| `APPEALED` | `FINALIZED` | Response & Review | Appeal Reviewer | `grading.appeal.process` | Appeal claimed, no COI | Single decision CAS | `appeal_id` | Row Lock CAS | Action Key | `APPEAL_DECIDED` | `COI_VIOLATION` | User Retry |
| `FINAL` | `SUPERSEDED` | Review Row | System / RPC | Internal RPC | New correction row inserted | Linear chain linking | `previous_review_id` | Append-Only Lock | Transaction Key | `REVIEW_SUPERSEDED` | `CHAIN_BROKEN` | Transaction Rollback |

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
    - يُجمد التجاوز الطارئ القفل العادي ويزيد `assignment_generation` بـ 1000، مما يبطل قفل المصحح العادي فوراً مع التوثيق الكامل في Audit Trail.

---

## 7. سياسة الدرجة النهائية والتصحيح المزدوج وحماية الخصوصية (Final Score Policy & Blind Privacy) `[REQUIRED_EXTENSION]`

### 7.1. قواعد التقييم الأحادي والمزدوج والتحكيم
1. **التصحيح الأحادي (Single Grading)**: تقديم درجة واحدة من المصحح المعتمد وتتحول لـ `FINALIZED` عند استيفاء الضوابط.
2. **التصحيح المزدوج مع التطابق التام (Exact Agreement)**: إذا كانت $\text{Score}_1 = \text{Score}_2$ تتأكد الدرجة آلياً وتتحول لـ `FINALIZED`.
3. **التصحيح المزدوج فوق عتبة الانحراف (Above Threshold > 15%)**: التحكيم الإجباري (Arbitration Mandatory) عبر `senior grader`.
4. **التصحيح المزدوج ضمن عتبة الانحراف (Within Threshold $\le 15\%$)**:
   - **تخضع لقرار المالك `OD-MG-13` (NEEDS_OWNER_DECISION)**.
   - الخيارات المتاحة: المتوسط الحسابي، الأعلى، الأقل، تقييم المصحح الأول، تقييم المصحح الثاني، مراجعة إضافية.
   - **يُمنع فرض قيمة نهائية نيابة عن المالك**.

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

## 9. سجل قرارات المالك الشامل (Owner Decision Register - 16 Decisions) `[OWNER_DECISION]`

يشتمل هذا السجل على كافة القرارات الـ 16 التي تتطلب قراراً رسمياً من مالك المنتج، وتُصنف جميعها بـ `NEEDS_OWNER_DECISION`:

| ID القرار | موضوع القرار | الخيارات المتاحة | الأثر العملياتي | المخاطر المحتملة | التوصية الفنية | الأثر الهيكلي (Schema) | الأثر التنفيذي (Runtime) | الإرجاء المسموح | المرحلة الحاكمة | الحالة |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **ODR-001** | مهلة القفل المؤقت (Lease TTL) | 10د / 15د / 30د | احتجاز الإجابة | احتكار عند الانقطاع | 15د مع Heartbeat | إضافة حقل TTL | ضبط مؤقتات UI | حتى MVP | MVP | `NEEDS_OWNER_DECISION` |
| **ODR-002** | مهل SLA للامتحانات | 12س / 24س / 48س | سرعة النتائج | ضغط المصححين | 24 ساعة | جداول التنبيهات | مجدول التصعيد | حتى MVP | MVP | `NEEDS_OWNER_DECISION` |
| **ODR-003** | عتبة تنبيه SLA Alert | 50% / 75% / 90% | توقيت التنبيه | كثرة الإزعاج | 75% | حقول العتبات | خدمة التنبيهات | حتى MVP | P1 | `NEEDS_OWNER_DECISION` |
| **ODR-004** | حد انحراف التصحيح المزدوج | 10% / 15% / 20% | نسبة التحكيم | عبء المحكمين | 15% من الدرجة | حقل Variance | شرط RPC التحكيم | حتى P1 | P1 | `NEEDS_OWNER_DECISION` |
| **ODR-005** | نسبة عينة الجودة (QA Sample) | 3% / 5% / 10% | حجم العينات | استهلاك الوقت | 5% عشوائي | جدول العينات | مجدول العينات | حتى P1 | P2 | `NEEDS_OWNER_DECISION` |
| **ODR-006** | نافذة تقديم التظلم | 3د / 7د / 14د | فترة الاعتراض | تراكم الطلبات | 7 أيام من النشر | حقل Window | شرط RPC الاعتراض | حتى P1 | P1 | `NEEDS_OWNER_DECISION` |
| **ODR-007** | سلطة الاعتماد النهائي | Senior / Manager | مسؤولية `is_final` | اختناق الإدارة | منحها لـ Senior | قيود RPC | فحص الصلاحية | حتى MVP | MVP | `NEEDS_OWNER_DECISION` |
| **ODR-008** | سلطة حسم التحكيم | Senior / Panel | حسم النزاعات | تأخر البت | Senior Grader | RLS policy | RPC التحكيم | حتى P1 | P1 | `NEEDS_OWNER_DECISION` |
| **ODR-009** | سلطة الفتح الاستثنائي | Manager / Emergency | إعادة الفتح | التلاعب بالنتائج | Manager & Emergency | Audit Table | RPC الفتح | حتى P1 | P1 | `NEEDS_OWNER_DECISION` |
| **ODR-010** | سلطة نشر الدفعة | Manager / System | نشر النتائج | نشر غير مكتمل | Grading Manager | Batch table | RPC الإفراج | حتى MVP | MVP | `NEEDS_OWNER_DECISION` |
| **ODR-011** | Batch Release للتمارين | نعم / لا | توقيت التمارين | تأخير التدريب | الإفراج الفوري | Flag في النشاط | مسار التدريب | حتى MVP | MVP | `NEEDS_OWNER_DECISION` |
| **ODR-012** | نطاق التصحيح المزدوج | الكل / امتحانات فقط | استهلاك الموارد | مضاعفة التكلفة | الامتحانات فقط | Schema flags | شرط التوزيع | حتى P1 | P1 | `NEEDS_OWNER_DECISION` |
| **OD-MG-13** | قاعدة الدرجة ضمن الانحراف | المتوسط/الأعلى/الأقل/الأول/الثاني | احتساب النهائي | اعتراضات الخلاف | المتوسط الحسابي | Formula Column | RPC Calculation | حتى P1 | P1 | `NEEDS_OWNER_DECISION` |
| **OD-MG-14** | تعيين شقوق التصحيح المزدوج | التزامن / التتابع | طريقة التكليف | تأخير التقييم الثاني | التزامن المستقل | Slots Enum | Auto Dispatch | حتى P1 | P1 | `NEEDS_OWNER_DECISION` |
| **OD-MG-15** | سلطة الانقضاء والسحب | آلي / يدوي / مختلط | إطلاق المهام | إرجاع مبكر جداً | مختلط (آلي+يدوي) | Job Config | Expiry Worker | حتى MVP | MVP | `NEEDS_OWNER_DECISION` |
| **OD-MG-16** | إفراج دفعة الممارسة التدريبية | تجميعي / فوري | إظهار الحلول | تسريب التمارين | فوري بعد التسليم | Practice Flags | Immediate Outbox | حتى MVP | MVP | `NEEDS_OWNER_DECISION` |

---
*نهاية الوثيقة MANUAL-GRADING-PRODUCT-REQUIREMENTS-01 (Canonical Correction 05)*
