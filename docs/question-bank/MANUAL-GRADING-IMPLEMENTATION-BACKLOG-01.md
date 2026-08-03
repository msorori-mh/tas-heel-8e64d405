# MANUAL-GRADING-IMPLEMENTATION-BACKLOG-01
## سجل المهمات والخطة التنفيذية لمحرك التصحيح اليدوي — التصحيح القانوني المعتمد 07

> **وثيقة سجل المهمات والخطة التنفيذية (Detailed Backlog Specification - 80 Tasks & Semantic DAG)**
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

## 1. الهيكلية المنهجية لـ Backlog (Backlog Methodology & Taxonomy) `[REQUIRED_EXTENSION]`

تم هيكلة سجل المهمات التنفيذي في **8 الملاحم التطويرية (Epics)** التي تغطي جميع متطلبات المحرك عبر **80 مهمة تفصيلية فريدة**، مع تزويد كل مهمة بـ 11 بنداً إجبارياً:

1. **Phase**: `FOUNDATION` / `MVP` / `P1` / `P2`
2. **Dependencies**: `TASK-MG-XXX` أو `NONE`
3. **Security Prerequisite**: المتطلب الأمني المسبق
4. **Migration Required**: `YES` / `NO` (في التنفيذ المستقبلي)
5. **Runtime Required**: `YES` / `NO` (في التنفيذ المستقبلي)
6. **UI Required**: `YES` / `NO`
7. **Worker/Scheduler Required**: `YES` / `NO`
8. **Owner Decision Status**: APPROVED BY ODR-XXX / `NO`
9. **Existing QB-01 Dependency**: `YES` / `NO` (أو الكيان المعني)
10. **Acceptance Test**: `TC-XXX-YYY`
11. **Deliverable Type**: واحد أو أكثر من [`DOCS`, `SCHEMA`, `CONSTRAINT`, `INDEX`, `RLS`, `GRANT`, `RPC`, `TRIGGER`, `AUDIT`, `WORKER`, `UI`, `NOTIFICATION`, `TEST`, `OBSERVABILITY`]

---

## 2. قائمة المهمات الـ 80 التفصيلية (Detailed 80 Backlog Tasks) `[REQUIRED_EXTENSION]`

### Epic 1: Data Model, Security & Snapshot Infrastructure (البنية التحتية)

- **TASK-MG-001: التثبت المعماري لقواعد `question_response_reviews` الهيكلية** `[EXISTING_QB01]`
  - **Phase**: `FOUNDATION` | **Dependencies**: `NONE`
  - **Security Prerequisite**: تفعيل التشفير والتحقق الذري لقواعد RLS.
  - **Migration Required**: `YES` | **Runtime Required**: `NO` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `question_response_reviews`
  - **Acceptance Test**: `TC-SEC-001` | **Deliverable Type**: `DOCS`, `SCHEMA`, `CONSTRAINT`

- **TASK-MG-002: تفعيل تريجر منع الحذف والتعديل المباشر على جدول المراجعات** `[EXISTING_QB01]`
  - **Phase**: `FOUNDATION` | **Dependencies**: `TASK-MG-001`
  - **Security Prerequisite**: حظر عمليات `UPDATE` و `DELETE` كلياً على جدول المراجعات.
  - **Migration Required**: `YES` | **Runtime Required**: `NO` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `question_response_reviews`
  - **Acceptance Test**: `TC-SEC-004`, `TC-SEC-005` | **Deliverable Type**: `TRIGGER`, `CONSTRAINT`

- **TASK-MG-003: دعم مفتاح كبح التكرار `idempotency_key` المزدوج** `[REQUIRED_EXTENSION]`
  - **Phase**: `FOUNDATION` | **Dependencies**: `TASK-MG-001`
  - **Security Prerequisite**: منع هجمات إعادة الإرسال والتكرار الشبكي.
  - **Migration Required**: `YES` | **Runtime Required**: `NO` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-SEC-011` | **Deliverable Type**: `SCHEMA`, `CONSTRAINT`

- **TASK-MG-004: بناء المنظر الموحد `v_question_responses_unified` مع Security Invoker** `[REQUIRED_EXTENSION]`
  - **Phase**: `FOUNDATION` | **Dependencies**: `TASK-MG-001`
  - **Security Prerequisite**: تفعيل `security_invoker = true` وإنفاذ سياسات RLS.
  - **Migration Required**: `YES` | **Runtime Required**: `NO` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `exam_session_answers`, `practice_attempt_responses`
  - **Acceptance Test**: `TC-SEC-007` | **Deliverable Type**: `SCHEMA`, `RLS`

- **TASK-MG-005: الربط مع حدود الدرجات المعتمدة في snapshot بنك الأسئلة** `[REQUIRED_EXTENSION]`
  - **Phase**: `FOUNDATION` | **Dependencies**: `TASK-MG-001`
  - **Security Prerequisite**: ربط `max_score` بنسخة snapshot لمنع التجاوز.
  - **Migration Required**: `YES` | **Runtime Required**: `NO` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `question_revisions`
  - **Acceptance Test**: `TC-SCR-005` | **Deliverable Type**: `CONSTRAINT`, `RPC`

- **TASK-MG-006: ربط معرف التقييم السلسلي `action_id` لجميع العمليات** `[EXISTING_QB01]`
  - **Phase**: `FOUNDATION` | **Dependencies**: `TASK-MG-002`
  - **Security Prerequisite**: التوليد التلقائي لـ UUID من السيرفر.
  - **Migration Required**: `YES` | **Runtime Required**: `NO` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `question_response_reviews`
  - **Acceptance Test**: `TC-SEC-012` | **Deliverable Type**: `SCHEMA`, `AUDIT`

- **TASK-MG-007: عزل جداول التصحيح عن أدوار المحتوى (`publisher`, `editor`)** `[REQUIRED_EXTENSION]`
  - **Phase**: `FOUNDATION` | **Dependencies**: `TASK-MG-001`
  - **Security Prerequisite**: إنفاذ مبدأ الفصل الصارم بين الواجبات (Separation of Duties).
  - **Migration Required**: `YES` | **Runtime Required**: `NO` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-SEC-014` | **Deliverable Type**: `RLS`, `GRANT`

- **TASK-MG-008: إنفاذ قيد الدرجة الموجبة الصارم `score_awarded >= 0`** `[EXISTING_QB01]`
  - **Phase**: `FOUNDATION` | **Dependencies**: `TASK-MG-005`
  - **Security Prerequisite**: حماية المنطق الرياضي من ثغرات الدرجات السالبة.
  - **Migration Required**: `YES` | **Runtime Required**: `NO` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `question_response_reviews`
  - **Acceptance Test**: `TC-SEC-003`, `TC-SCR-006` | **Deliverable Type**: `CONSTRAINT`

- **TASK-MG-009: هيكلة حقل `reason` الإجباري عند الاعتماد النهائي** `[REQUIRED_EXTENSION]`
  - **Phase**: `FOUNDATION` | **Dependencies**: `TASK-MG-002`
  - **Security Prerequisite**: توثيق الأسباب القانونية والأكاديمية للاعتماد النهائي.
  - **Migration Required**: `YES` | **Runtime Required**: `NO` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-AFR-001` | **Deliverable Type**: `CONSTRAINT`, `SCHEMA`

- **TASK-MG-010: تهيئة فهارس الأداء المزدوجة لتسريع استعلامات الطوابير** `[REQUIRED_EXTENSION]`
  - **Phase**: `FOUNDATION` | **Dependencies**: `TASK-MG-004`
  - **Security Prerequisite**: حماية البيئة من هجمات الحرمان من الخدمة (DoS).
  - **Migration Required**: `YES` | **Runtime Required**: `NO` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-001` | **Deliverable Type**: `INDEX`

---

### Epic 2: Queue Engine & Dynamic Assignment Dispatch (طابور العمل والتوزيع)

- **TASK-MG-011: بناء طابور الإجابات غير المصححة حسب المادة** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-004`, `TASK-MG-007`, `TASK-MG-010`
  - **Security Prerequisite**: مطابقة المادة المصرحة للمصحح بنطاق `subject_scope`.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-SEC-009` | **Deliverable Type**: `RPC`, `UI`

- **TASK-MG-012: ترتيب الطابور بحسب أولوية الامتحانات الرسمية** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-011`
  - **Security Prerequisite**: إنفاذ ترتيب الأولويات الأكاديمية الرسمية.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-001` | **Deliverable Type**: `RPC`, `UI`

- **TASK-MG-013: خوارزمية التوزيع التلقائي المتوازن (Auto-Dispatch)** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-011`
  - **Security Prerequisite**: فحص السعة القصوى المسموحة للمصحح.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `NO` | **Worker/Scheduler Required**: `YES`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-001` | **Deliverable Type**: `WORKER`, `RPC`

- **TASK-MG-014: التخصيص اليدوي للدفعات من قبل مدير التصحيح** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-011`
  - **Security Prerequisite**: التحقق من صلاحية `grading.claim.execute` الإدارية.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-010` | **Deliverable Type**: `RPC`, `UI`

- **TASK-MG-015: تحديد السعة القصوى لعمليات التصحيح النشطة** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-011`
  - **Security Prerequisite**: منع احتكار الطوابير وتراكم المهام.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-001` | **Deliverable Type**: `CONSTRAINT`, `RPC`

- **TASK-MG-016: استبعاد الإجابات الملغاة أو المهجورة من الطابور** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-011`
  - **Security Prerequisite**: تنظيف الطوابير التلقائي ومنع استهلاك جهود المصححين.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `NO` | **Worker/Scheduler Required**: `YES`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-001` | **Deliverable Type**: `WORKER`, `RPC`

- **TASK-MG-017: فلترة الطابور بحسب حالة اتفاقية SLA** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-012`
  - **Security Prerequisite**: وسم المهمات المقتربة من تجاوز الموعد المعتمد.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Status**: APPROVED BY ODR-002 (Gate: `TASK-MG-017`) | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-005` | **Deliverable Type**: `RPC`, `UI`

- **TASK-MG-018: إنشاء منظر الجلسات الجاهزة للتصحيح اليدوي** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-011`
  - **Security Prerequisite**: حصر الاستعلام بالجلسات المغلقة رسمياً.
  - **Migration Required**: `YES` | **Runtime Required**: `NO` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `exam_sessions`
  - **Acceptance Test**: `TC-AFR-002` | **Deliverable Type**: `SCHEMA`

- **TASK-MG-019: دعم خيار التوزيع الدائري (Round-Robin Distribution)** `[FUTURE_P1]`
  - **Phase**: `P2` | **Dependencies**: `TASK-MG-013`
  - **Security Prerequisite**: تحقيق العدالة المتوازية في توزيع المهام.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `NO` | **Worker/Scheduler Required**: `YES`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-001` | **Deliverable Type**: `WORKER`, `RPC`

- **TASK-MG-020: تسجيل أحداث تغيير حالة التخصيص في سجل الأحداث** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-014`
  - **Security Prerequisite**: التوثيق التتابع التام لحركات التعيين والإلغاء.
  - **Migration Required**: `YES` | **Runtime Required**: `NO` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-AFR-003` | **Deliverable Type**: `AUDIT`, `TRIGGER`

---

### Epic 3: Lease Locks, Heartbeat, Fencing Token & SLA (الأقفال والمهل)

- **TASK-MG-021: بناء دالة المطالبة الذرية `claim_grading_assignment`** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-001`, `TASK-MG-011`, `TASK-MG-022`
  - **Security Prerequisite**: أقفال الصفوف الذرية `FOR UPDATE NOWAIT` لمنع سباق التنافس بعد وجود النموذج والقفل.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-006` | **Deliverable Type**: `RPC`, `SCHEMA`

- **TASK-MG-022: إنشاء نموذج القفل المؤقت `lease_expires_at`** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-001`, `TASK-MG-011`
  - **Security Prerequisite**: تحديد مهلة القفل الإجبارية وبنية Lease Schema لمنع الاحتكار الأبدي.
  - **Migration Required**: `YES` | **Runtime Required**: `NO` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Status**: APPROVED BY ODR-001 (Gate: `TASK-MG-022`) | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-002` | **Deliverable Type**: `SCHEMA`, `CONSTRAINT`

- **TASK-MG-023: التحرير التلقائي للقفل المنتهي عبر Background Job** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-022`
  - **Security Prerequisite**: إطلاق المهام المنتهية ومنع التقديمات المتأخرة.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `NO` | **Worker/Scheduler Required**: `YES`
  - **Owner Decision Status**: APPROVED BY ODR-015 (Gate: `TASK-MG-023`) | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-004` | **Deliverable Type**: `WORKER`, `RPC`

- **TASK-MG-024: بناء دالة التحرير اليدوي الصريح `release_grading_assignment`** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-021`, `TASK-MG-022`
  - **Security Prerequisite**: التحقق من ملكية المصحح للقفل النشط قبل التحرير.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-003` | **Deliverable Type**: `RPC`, `UI`

- **TASK-MG-025: آلية تمديد القفل عبر النبضات التفاعلية `heartbeat_grading_assignment`** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-022`
  - **Security Prerequisite**: فحص صحة `lease_token` و عدم انقضاء المهلة الأساسية.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-009` | **Deliverable Type**: `RPC`, `UI`

- **TASK-MG-026: إنفاذ رمز المحاصرة `fencing_token` في دالة تقديم الدرجات** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-021`, `TASK-MG-022`
  - **Security Prerequisite**: حظر الكتابة المنتهية وتطابق `assignment_generation`.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-008` | **Deliverable Type**: `RPC`, `CONSTRAINT`

- **TASK-MG-027: محرك تنبيهات المهل وتصعيد تجاوزات SLA** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-017`
  - **Security Prerequisite**: إرسال إشعارات التنبيه عند 75% والتصعيد عند 100%.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `NO` | **Worker/Scheduler Required**: `YES`
  - **Owner Decision Status**: APPROVED BY ODR-003 (Gate: `TASK-MG-027`) | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-005` | **Deliverable Type**: `WORKER`, `NOTIFICATION`

- **TASK-MG-028: بناء دالة الاسترداد الإداري للتعيين `reclaim_grading_assignment`** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-023`, `TASK-MG-026`
  - **Security Prerequisite**: زيادة `assignment_generation` آلياً لإبطال الرموز القديمة.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-010` | **Deliverable Type**: `RPC`, `UI`

- **TASK-MG-029: حظر المطالبة المزدوجة التزامنية عبر أقفال DB الذرية** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-021`
  - **Security Prerequisite**: حماية المعاملات بـ `NOWAIT` الذرية وقيد الفرادة الجزئي.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-006` | **Deliverable Type**: `CONSTRAINT`, `RPC`

- **TASK-MG-030: المعالجة الشبكية المنقطعة وحظر الحفظ بعد استعادة الاتصال مع انقضاء Lease** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-026`
  - **Security Prerequisite**: فحص `lease_expires_at > now()` داخل RPC عند التسليم الشبكي.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-QCL-011` | **Deliverable Type**: `RPC`, `UI`

---

### Epic 4: Rubrics Evaluator & Pinned Score Bounds (سلم التقييم والدرجات)

- **TASK-MG-031: عرض بنود Rubric المعتمدة في snapshot بنك الأسئلة** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-005`, `TASK-MG-007`
  - **Security Prerequisite**: جلب البنود المعتمدة في `question_revisions` حصراً.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `question_revisions`
  - **Acceptance Test**: `TC-SCR-001` | **Deliverable Type**: `RPC`, `UI`

- **TASK-MG-032: الجمع الآلي لنقاط بنود Rubric الفرعية** `[EXISTS_IN_QB01]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-031`
  - **Security Prerequisite**: حظر إدخال مجموع يدوي يختلف عن مجموع بنود Rubric.
  - **Migration Required**: `NO` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-SCR-007` | **Deliverable Type**: `UI`

- **TASK-MG-033: إنفاذ حدود الدرجة المعتمدة $0 \le \text{Score} \le \text{Max}$ عبر RPC** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-005`, `TASK-MG-008`
  - **Security Prerequisite**: التحقق الذري المباشر من لقطة Snapshot في السيرفر.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `question_response_reviews`
  - **Acceptance Test**: `TC-SCR-005` | **Deliverable Type**: `RPC`, `CONSTRAINT`

- **TASK-MG-034: تطبيق قواعد تقريب الدرجات الجزئية للمؤسسة** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-032`
  - **Security Prerequisite**: معايرة تقريب الكسور لـ 0.25 أو 0.50 حسب سياسة المؤسسة على نتيجة المتوسط أو التقييم اليدوي.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Status**: APPROVED BY INSTITUTION_ROUNDING_POLICY (Downstream Dependency) | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-SCR-002` | **Deliverable Type**: `RPC`

- **TASK-MG-035: التحكم في إدخال ملاحظات الطالب والتعقيم الأمني (Sanitizations)** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-031`
  - **Security Prerequisite**: تعقيم النصوص المدخلة من وسوم XSS والروابط الضارة.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `REQUIRED_EXTENSION`
  - **Acceptance Test**: `TC-SCR-003` | **Deliverable Type**: `UI`, `RPC`

- **TASK-MG-036: بناء حقل الملاحظات السرية للمراجعين (Internal Notes)** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-035`
  - **Security Prerequisite**: حجب الحقل السري تماماً عن استعلامات الطلاب بـ RLS.
  - **Migration Required**: `YES` | **Runtime Required**: `NO` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-SCR-003` | **Deliverable Type**: `SCHEMA`, `RLS`

- **TASK-MG-037: معجم الملاحظات والردود المعيارية الجاهزة (Preset Snippets)** `[FUTURE_P1]`
  - **Phase**: `P2` | **Dependencies**: `TASK-MG-035`
  - **Security Prerequisite**: اختيار الملاحظات المعيارية المعتمدة من القائمة.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-SCR-003` | **Deliverable Type**: `SCHEMA`, `UI`

- **TASK-MG-038: قبول حفظ تقييم الدرجة الصفرية `score_awarded = 0` بالشروط** `[EXISTS_IN_QB01]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-033`
  - **Security Prerequisite**: اشتراط تحديد بند التقصير وملاحظة التوضيح.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `question_response_reviews`
  - **Acceptance Test**: `TC-SCR-003` | **Deliverable Type**: `RPC`, `CONSTRAINT`

- **TASK-MG-039: التحقق من استكمال تقييم جميع البنود الإجبارية قبل التسليم** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-031`
  - **Security Prerequisite**: حظر التقييم الناقص أو الجزئي غير المكتمل.
  - **Migration Required**: `NO` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-SCR-004` | **Deliverable Type**: `UI`

- **TASK-MG-040: دعم عرض المرفقات المرجعية المعايرة في سلم التقييم** `[FUTURE_P1]`
  - **Phase**: `P2` | **Dependencies**: `TASK-MG-031`
  - **Security Prerequisite**: فحص حجم ونوع المرفقات المرجعية لمنع الملفات الضارة.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-SCR-001` | **Deliverable Type**: `SCHEMA`, `UI`

---

### Epic 5: Double Marking, Blind Grading & Arbitration (النزاهة والحياد)

- **TASK-MG-041: تطبيق التصحيح المجهول وتشفير هوية الطالب (Blind Grading)** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-004`
  - **Security Prerequisite**: إخفاء الاسم والبيانات الشخصية واستبدالها بـ Token عشوائي.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-DMA-006` | **Deliverable Type**: `RPC`, `RLS`

- **TASK-MG-042: إخفاء هوية المصحح عن الطالب في جميع الواجهات** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-041`
  - **Security Prerequisite**: حجب اسم وبيانات المصحح عن الطالب لمنع التواصل المباشر.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-DMA-006` | **Deliverable Type**: `RLS`, `UI`

- **TASK-MG-043: فحص تضارب المصالح الآلي وحظر الأقارب (COI Protection)** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-011`
  - **Security Prerequisite**: مطابقة قائمة الأقارب وحظر الإجابات تلقائياً.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `NO` | **Worker/Scheduler Required**: `YES`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-SEC-016` | **Deliverable Type**: `SCHEMA`, `RPC`

- **TASK-MG-044: التصريح الذاتي للمصحح باستبعاد إجابة لتضارب المصالح** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-043`
  - **Security Prerequisite**: تمكين المصحح من الاستبعاد الذاتي مع التوثيق.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-SEC-017` | **Deliverable Type**: `RPC`, `UI`

- **TASK-MG-045: هيكلة التعيينات المستقلة المزدوجة (Dual Independent Marking)** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-021`, `TASK-MG-041`
  - **Security Prerequisite**: تعيين صفين مستقلين بحالة عزل تام (Blind Isolation).
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Status**: APPROVED BY ODR-012, ODR-014 (Gate: `TASK-MG-045`) | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-DMA-001` | **Deliverable Type**: `SCHEMA`, `RPC`

- **TASK-MG-046: محرك حساب التباين، احتساب المتوسط الحسابي، والتحويل التلقائي للتحكيم** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-045`, `TASK-MG-034`
  - **Security Prerequisite**: رصد التباين $\le 15\%$ (ODR-004) واحتساب المتوسط الحسابي للدرجتين (ODR-013) وحفظه كـ proposed final score مع تجهيز حالة READY_FOR_FINALIZATION دون اعتماد تلقائي، أو تحويل الإجابة لطابور التحكيم عند التباين $> 15\%$.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `NO` | **Worker/Scheduler Required**: `YES`
  - **Owner Decision Status**: APPROVED BY ODR-004, ODR-013 (Gate: `TASK-MG-046`) | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-DMA-002`, `TC-DMA-008` | **Deliverable Type**: `RPC`, `WORKER`

- **TASK-MG-047: بناء واجهة التحكيم وحسم الدرجة المعايرة النهائي `arbitrate_double_mark` (Independent Senior Grader Only)** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-046`
  - **Security Prerequisite**: تمكين المحكّم المستقل (Independent Senior Grader حصرياً) من حسم الدرجة بصف تتابعي معتمد، وحظر التحكيم على Reviewer وOrdinary Grader وManager وEmergency Operator والمصححين الأصليين.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Status**: APPROVED BY ODR-008 (Gate: `TASK-MG-047`) | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-DMA-003`, `TC-DMA-009` | **Deliverable Type**: `RPC`, `UI`

- **TASK-MG-048: محرك سحب العينات العشوائية لضبط الجودة (QA Sampling 5%)** `[FUTURE_P1]`
  - **Phase**: `P2` | **Dependencies**: `TASK-MG-045`
  - **Security Prerequisite**: توجيه 5% من الإجابات المعتمدة للمراجع بشكل عشوائي.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `NO` | **Worker/Scheduler Required**: `YES`
  - **Owner Decision Status**: APPROVED BY ODR-005 (Gate: `TASK-MG-048`) | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-DMA-001` | **Deliverable Type**: `WORKER`, `RPC`

- **TASK-MG-049: نظام الإبلاغ عن العلامات الاستدلالية والشبهات في الإجابة** `[FUTURE_P1]`
  - **Phase**: `P2` | **Dependencies**: `TASK-MG-041`
  - **Security Prerequisite**: رفع بلاغ أمني فور وجود أسماء صريحة أو علامات داخل النص.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-DMA-001` | **Deliverable Type**: `SCHEMA`, `UI`

- **TASK-MG-050: تقرير قياس تباين المصححين والعدالة المعيارية** `[FUTURE_P1]`
  - **Phase**: `P2` | **Dependencies**: `TASK-MG-046`, `TASK-MG-048`
  - **Security Prerequisite**: تحليل معدلات انحراف درجات المصححين عن المتوسط.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-DMA-002` | **Deliverable Type**: `RPC`, `OBSERVABILITY`

---

### Epic 6: State Machine, Appeals & Regrading Engine (الاعتماد والتظلمات)

- **TASK-MG-051: تنفيذ الاعتماد النهائي الذري للدرجة `finalize_manual_grade` (`is_final = true`)** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-002`, `TASK-MG-007`, `TASK-MG-034`, `TASK-MG-047`
  - **Security Prerequisite**: اقتصار الاعتماد النهائي على Reviewer و Authorized Senior Grader فقط، مع فحص Scoped Assignment وحظر Grader وManager وEmergency وSystem والتحقق من حقل السبب `reason` وتوليد سجل تدقيق غير قابل للتزوير مع منع الاعتماد التلقائي.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Status**: APPROVED BY ODR-007 (Gate: `TASK-MG-051`) | **Existing QB-01 Dependency**: `question_response_reviews`
  - **Acceptance Test**: `TC-AFR-001`, `TC-AFR-006` | **Deliverable Type**: `RPC`, `TRIGGER`

- **TASK-MG-052: تحديث المجموع النهائي للجلسة عند اكتمال الأسئلة المقالية** `[EXISTS_IN_QB01]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-051`
  - **Security Prerequisite**: الإشعال التلقائي الذري لإعادة حساب مجموع الجلسة.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `exam_sessions`
  - **Acceptance Test**: `TC-AFR-002` | **Deliverable Type**: `TRIGGER`, `RPC`

- **TASK-MG-053: تنفيذ مسار إعادة التقييم `return_for_second_review` (`RETURNED_FOR_SECOND_REVIEW`)** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-051`
  - **Security Prerequisite**: توجيه التقييم غير المستوفي وتغيير حالته لـ RETURNED_FOR_SECOND_REVIEW والانتقال عبر المسار القانوني RETURNED_FOR_SECOND_REVIEW -> IN_GRADING -> SUBMITTED_FOR_REVIEW مع إنشاء Assignment جديد أو Reclaim منضبط، زيادة assignment_generation، إصدار lease_token جديد، عدم تعديل Review Row السابق، حفظ سبب الإعادة، ومنع المصحح غير المعين من الاستلام (ASSIGNEE_MISMATCH).
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-AFR-001` | **Deliverable Type**: `RPC`, `UI`

- **TASK-MG-054: بناء RPC الفتح الاستثنائي `reopen_manual_grade` للدرجات المعتمدة** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-007`, `TASK-MG-051`
  - **Security Prerequisite**: اشتراط الصلاحيات الإدارية وتوفير حقل السبب الإجباري.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Status**: APPROVED BY ODR-009 (Gate: `TASK-MG-054`) | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-AFR-009` | **Deliverable Type**: `RPC`, `AUDIT`

- **TASK-MG-055: بناء محرك تقديم الاعتراضات والتظلمات للطلاب `create_appeal`** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-051`, `TASK-MG-056`
  - **Security Prerequisite**: التحقق من ملكية الطالب للجلسة وانقضاء الاعتماد النهائي.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-DMA-004` | **Deliverable Type**: `SCHEMA`, `RPC`

- **TASK-MG-056: إدارة النافذة الزمنية لتقديم الاعتراضات (Appeals Window Control)** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-051`
  - **Security Prerequisite**: حظر الاعتراضات بعد انقضاء المدة المصرح بها (7 أيام).
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `YES`
  - **Owner Decision Status**: APPROVED BY ODR-006 (Gate: `TASK-MG-056`) | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-DMA-004` | **Deliverable Type**: `WORKER`, `RPC`

- **TASK-MG-057: التخصيص المستقل المباشر لمراجع التظلم بدون تضارب مصالح `assign_appeal_reviewer`** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-055`, `TASK-MG-056`
  - **Security Prerequisite**: حظر مشاركة أي مصحح أولي شارك في التقييم السابق.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-DMA-010` | **Deliverable Type**: `RPC`, `WORKER`

- **TASK-MG-058: البت في التظلم وإعادة حساب المجموع والسجل التتابعي `decide_appeal`** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-047`, `TASK-MG-057`
  - **Security Prerequisite**: تسجيل القرار في `appeal_decisions` وإصدار الصف التصحيحي.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-DMA-005` | **Deliverable Type**: `SCHEMA`, `RPC`

- **TASK-MG-059: ربط التعديلات التصحيحية بـ `grading_review_supersessions` للتتبع** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-058`
  - **Security Prerequisite**: التوثيق السلسلي الكامل لربط التعديلات ببعضها.
  - **Migration Required**: `YES` | **Runtime Required**: `NO` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-AFR-003` | **Deliverable Type**: `SCHEMA`, `AUDIT`

- **TASK-MG-060: تقرير التظلمات والاعتراضات السنوي وتحليل جودة الأسئلة** `[FUTURE_P1]`
  - **Phase**: `P2` | **Dependencies**: `TASK-MG-058`
  - **Security Prerequisite**: تحليل نسبة الاعتراضات المقبولة ومصادر الأخطاء.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-DMA-005` | **Deliverable Type**: `RPC`, `OBSERVABILITY`

---

### Epic 7: Notification Outbox, Batch Release & Reveal Timers (الإشعارات والنتائج)

- **TASK-MG-061: حظر الإشعارات الفردية وتجميعها لحين الاعتماد النهائي للدفعة** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-051`
  - **Security Prerequisite**: حظر مطلق لإرسال أي إشعار قبل الوصول لـ `FINALIZED + RELEASED`.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-SEC-013` | **Deliverable Type**: `RPC`, `CONSTRAINT`

- **TASK-MG-062: آلية الاعتماد والإفراج الجماعي للدفعة `release_grading_batch`** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-007`, `TASK-MG-061`
  - **Security Prerequisite**: التحقق من صلاحية `grading.batch.release` قبل الاعتماد.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Status**: APPROVED BY ODR-010 (Gate: `TASK-MG-062`) | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-AFR-005` | **Deliverable Type**: `RPC`, `SCHEMA`

- **TASK-MG-063: إدارة توقيت كشف الإجابة النموذجية (Reveal Timer Controls)** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-062`, `TASK-MG-069`
  - **Security Prerequisite**: حجب نموذج الحل حتى انقضاء `batch_finalized_at + reveal_at`.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `YES`
  - **Owner Decision Status**: APPROVED BY ODR-010 (Gate: `TASK-MG-062`) | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-AFR-010` | **Deliverable Type**: `RPC`, `WORKER`

- **TASK-MG-064: بناء صندوق الإشعارات الصادرة `notification_outbox` ضد الضياع** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-062`, `TASK-MG-069`
  - **Security Prerequisite**: الضمان الذري لتسليم الرسائل ومنع الضياع أو التكرار.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `NO` | **Worker/Scheduler Required**: `YES`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-NFX-002` | **Deliverable Type**: `SCHEMA`, `NOTIFICATION`

- **TASK-MG-065: سياسة إعادة محاولة إرسال الإشعارات عند التعثر (Exponential Backoff)** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-064`
  - **Security Prerequisite**: التعافي التلقائي عند انقطاع شبكة الإشعارات.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `NO` | **Worker/Scheduler Required**: `YES`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-NFX-001` | **Deliverable Type**: `WORKER`, `NOTIFICATION`

- **TASK-MG-066: كبح الإشعارات المكررة وآلية التعافي (Deduplication Logic)** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-064`
  - **Security Prerequisite**: مطابقة المفتاح الفريد لمنع إرسال تنبيهات مكررة.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-NFX-002` | **Deliverable Type**: `CONSTRAINT`, `RPC`

- **TASK-MG-067: إرسال إشعارات التعديل والاستثنائية بعد التظلم (Re-Notification)** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-058`, `TASK-MG-064`, `TASK-MG-069`
  - **Security Prerequisite**: توثيق تعديل الدرجة في الإشعار الصادر للطالب.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-NFX-003` | **Deliverable Type**: `NOTIFICATION`, `RPC`

- **TASK-MG-068: التثبت الزمني لكشف الحلول عبر الحد الدولي المعياري UTC** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-063`
  - **Security Prerequisite**: اعتماد توقيت UTC ومنع تلاعب العميل بالتوقيت المحلي.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `NO` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-AFR-011` | **Deliverable Type**: `RPC`, `CONSTRAINT`

- **TASK-MG-069: تصميم وتنفيذ موزع سياسات الإفراج عن نتائج التمارين التدريبية (Practice Release Policy Dispatcher)** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: Common (`TASK-MG-051`, `TASK-MG-058`, `TASK-MG-064`); Conditional: BATCH mode depends on `TASK-MG-062` (Batch Release engine), DELAYED mode depends on `TASK-MG-065` (Scheduler/Worker), IMMEDIATE mode has NO batch dependency.
  - **Security Prerequisite**: معالجة المسارات الثلاثة المعتمدة للتمارين التدريبية (IMMEDIATE, DELAYED, BATCH) وفق إعداد النشاط، مع إنفاذ الاعتماد النهائي كشرط مسبق دون اشتراط إغلاق الدفعة في المسار الفوري IMMEDIATE، ومعالجة التوقيت UTC والموثوقية والتنبيهات وإلغاء القفل.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `YES`
  - **Owner Decision Status**: APPROVED BY ODR-011, ODR-016 (Gate: `TASK-MG-069`) | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-AFR-007`, `TC-AFR-012`, `TC-AFR-013` | **Deliverable Type**: `RPC`, `WORKER`, `NOTIFICATION`

- **TASK-MG-070: تقرير متابعة تسليم الإشعارات ونسبة الوصول للطلاب** `[FUTURE_P1]`
  - **Phase**: `P2` | **Dependencies**: `TASK-MG-027`, `TASK-MG-065`
  - **Security Prerequisite**: مراقبة معدلات تسليم التنبيهات والبريد الإلكتروني.
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-NFX-001` | **Deliverable Type**: `OBSERVABILITY`, `RPC`

---

### Epic 8: Mobile-First UX, Accessibility & System Health (الواجهة والتدقيق)

- **TASK-MG-071: تطبيق الاتجاه الفصيح الشامل من اليمين لليسار (RTL System)** `[EXISTING_QB01]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-004`
  - **Security Prerequisite**: محاذاة كافة الأزرار والقوائم اتساقاً مع العربية.
  - **Migration Required**: `NO` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-MUX-001` | **Deliverable Type**: `UI`

- **TASK-MG-072: بناء محرك التعامل مع النصوص ثنائية الاتجاه (BiDi Engine)** `[EXISTS_IN_QB01]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-071`
  - **Security Prerequisite**: محاذاة النص العربي لليمين وتنسيق الكود من اليسار LTR.
  - **Migration Required**: `NO` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-MUX-002` | **Deliverable Type**: `UI`

- **TASK-MG-073: تصميم الأهداف اللمسية المخصصة للجوال ($\ge 48\text{px}$)** `[EXISTS_IN_QB01]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-071`
  - **Security Prerequisite**: تجميع وتكبير المساحات اللمسية لمنع الأخطاء.
  - **Migration Required**: `NO` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-MUX-003` | **Deliverable Type**: `UI`

- **TASK-MG-074: بناء الدرج السفلي المترابط (Responsive Bottom Sheet Drawer)** `[EXISTS_IN_QB01]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-073`
  - **Security Prerequisite**: التكيف مع شاشات الهواتف لعرض Rubric بسلاسة.
  - **Migration Required**: `NO` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-MUX-004` | **Deliverable Type**: `UI`

- **TASK-MG-075: بوابة تحقق الأمان ومفتش سجل التدقيق (Security Verification Gate & Audit Inspector UI)** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-005`, `TASK-MG-006`, `TASK-MG-008`, `TASK-MG-011`, `TASK-MG-012`, `TASK-MG-013`, `TASK-MG-014`, `TASK-MG-020`, `TASK-MG-021`, `TASK-MG-023`, `TASK-MG-025`, `TASK-MG-030`, `TASK-MG-031`, `TASK-MG-045`, `TASK-MG-051`, `TASK-MG-054`, `TASK-MG-057`, `TASK-MG-058`, `TASK-MG-064`, `TASK-MG-068`
  - **Migration Required**: `YES` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-SEC-022` | **Deliverable Type**: `TEST`, `SECURITY_VERIFICATION`, `AUDIT`, `UI`, `RPC`
  - **Security Prerequisite**: تفعيل بوابة التحقق الأمني المانعة لنموذج الصلاحيات والتكليفات وحظر التدرج الفردي والوصول بين الطلاب وتدقيق سجل المحاولات وقواعد RLS وتراخيص RPC وحماية الإجابات المكتومة وعزل التصحيح المزدوج والتظلمات والإنعاش والفتح الاستثنائي والإشعارات. (تعتبر واجهات المراقبة وعقود RPC أدوات مساعدة وليست سبب اجتياز البوابة).
  - **Blocking Acceptance Matrix (13 Mandatory Security Controls)**:
    1. Positive RLS matrix verification (السماح بالمصرح لهم فقط)
    2. Negative RLS matrix verification (حظر غير المصرح لهم)
    3. Direct RPC authorization tests (فحص التراخيص المباشرة)
    4. Cross-student denial (حظر الوصول بين الطلاب)
    5. Cross-subject denial (حظر الوصول بين المواد)
    6. Counterpart-grader isolation (عزل المصحح النظير في التصحيح المزدوج)
    7. Hidden-answer denial (حظر كشف إجابة الطالب قبل الإفراج)
    8. Admin-bypass denial (حظر التجاوز غير المصرح من المسؤولين)
    9. Emergency expiry denial (حظر استخدام صلاحية الطوارئ بعد انتهاء مهلتها)
    10. Emergency revocation denial (حظر الاستخدام بعد سحب صلاحية الطوارئ)
    11. Audit deletion/tampering denial (حظر حذف أو تعديل سجل التدقيق Append-Only)
    12. Appeals authorization denial/allow (فحص صلاحيات وتعارض مصالح التظلمات COI)
    13. Notification/reveal authorization (فحص توقيت وصلاحية إفراج النتائج والإشعارات)
  - **Blocking Enforcement Rule**: فشل أي حالة اختبار إلزامية من الـ 13 حالة = Security Gate FAIL.

- **TASK-MG-076: إنفاذ حظر التخزين المحلي للدرجات غير المعتمدة (Offline Limit)** `[REQUIRED_EXTENSION]`
  - **Phase**: `MVP` | **Dependencies**: `TASK-MG-001`
  - **Security Prerequisite**: حظر استخدام localStorage أو IndexedDB للدرجات.
  - **Migration Required**: `NO` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-SEC-015` | **Deliverable Type**: `UI`

- **TASK-MG-077: تطبيق معايير إمكانية الوصول وتسميات لقارئ الشاشة (WCAG 2.1 AA)** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-071`
  - **Security Prerequisite**: تزويد أزرار الواجهة بـ ARIA Labels وتثبيت Focus.
  - **Migration Required**: `NO` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-MUX-007` | **Deliverable Type**: `UI`

- **TASK-MG-078: التنقل الكامل عبر لوحة المفاتيح واستعادة التركيز (Focus Restoration)** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-077`
  - **Security Prerequisite**: التنقل بدون ماوس بـ Tab / Enter واستعادة Focus.
  - **Migration Required**: `NO` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-MUX-006`, `TC-MUX-008` | **Deliverable Type**: `UI`

- **TASK-MG-079: التعافي من المقاطعة وبوابة تحقق الاختبارات الشاملة (Mobile Recovery & E2E Verification Gate)** `[REQUIRED_EXTENSION]`
  - **Phase**: `P1` | **Dependencies**: `TASK-MG-021`, `TASK-MG-022`, `TASK-MG-023`, `TASK-MG-028`, `TASK-MG-030`, `TASK-MG-045`, `TASK-MG-046`, `TASK-MG-047`, `TASK-MG-051`, `TASK-MG-054`, `TASK-MG-057`, `TASK-MG-058`, `TASK-MG-059`, `TASK-MG-062`, `TASK-MG-063`, `TASK-MG-065`, `TASK-MG-066`, `TASK-MG-067`, `TASK-MG-068`, `TASK-MG-074`, `TASK-MG-075`, `TASK-MG-078`
  - **Migration Required**: `NO` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-E2E-010` | **Deliverable Type**: `TEST`, `E2E`, `UX_ACCESSIBILITY`, `UI`
  - **Security Prerequisite**: التحقق الشامل من مسارات النظام الكاملة والتكامل بين الطابور والقفل والمطالبة والانقضاء والتصحيح والتحكيم والاعتماد والتظلمات وإعادة التصحيح والإشعارات والكشف والاختبار والتمارين وإمكانية الوصول واستعادة الاتصال للجوال.
  - **Acceptance Suites (10 Mandatory E2E Verification Suites)**:
    1. Exam happy path (المسار السعيد للامتحانات)
    2. Exam negative path (المسار السلبي للامتحانات)
    3. Practice happy path (المسار السعيد للتمارين)
    4. Practice negative path (المسار السلبي للتمارين)
    5. Double marking / arbitration (التصحيح المزدوج والتحكيم)
    6. Appeal / regrade lifecycle (دورة حياة التظلمات وإعادة التصحيح)
    7. Notification / reveal delivery (تسليم الإشعارات وكشف الحلول)
    8. Lease expiry / reclaim worker (انقضاء القفل وسحب التكليف)
    9. Mobile interruption & recovery (الانقطاع والتعافي على الجوال)
    10. Accessibility (WCAG 2.1 AA keyboard & screen reader)
  - **Blocking Enforcement Rule**: فشل أي مسار إلزامي من الـ 10 حزم = E2E Gate FAIL.

- **TASK-MG-080: لوحة مراقبة صحة النظام وبوابة الجاهزية والإطلاق (Production Readiness & Launch Approval Gate)** `[FUTURE_P1]`
  - **Phase**: `P2` | **Dependencies**: `TASK-MG-017`, `TASK-MG-022`, `TASK-MG-023`, `TASK-MG-027`, `TASK-MG-034`, `TASK-MG-045`, `TASK-MG-046`, `TASK-MG-047`, `TASK-MG-048`, `TASK-MG-050`, `TASK-MG-051`, `TASK-MG-054`, `TASK-MG-056`, `TASK-MG-062`, `TASK-MG-069`, `TASK-MG-070`, `TASK-MG-075`, `TASK-MG-079`
  - **Migration Required**: `NO` | **Runtime Required**: `YES` | **UI Required**: `YES` | **Worker/Scheduler Required**: `NO`
  - **Owner Decision Required**: `NO` | **Existing QB-01 Dependency**: `NO`
  - **Acceptance Test**: `TC-GATE-001`, `TC-GATE-002`, `TC-GATE-003` | **Deliverable Type**: `TEST`, `RELEASE_GATE`, `OBSERVABILITY`, `DOCS`, `UI`
  - **Security Prerequisite**: استيفاء جميع بوابات قرارات المالك المانعة، واجتياز فحوصات الأمان و E2E والـ Observability، وتوفر خطة التعافي، وحظر الإطلاق عند وجود أي ثغرة أو انحراف أمني أو تشغيلي مفتوح. (لوحة UI المرفقة هي أداة مراقبة فقط ولا تمنح قرار Pass بنفسها).
  - **Mandatory Blocking Criteria (9 Launch Conditions)**:
    1. جميع قرارات المالك الـ 16 المانعة معتمدة بنجاح (`APPROVED BY ODR-001..ODR-016`).
    2. Security Gate PASS (`TASK-MG-075`).
    3. E2E Gate PASS (`TASK-MG-079`).
    4. Observability verified active (تفعيل التحقق من Dashboards, Alerts, Health checks, Metrics في TASK-MG-050 و TASK-MG-070).
    5. Rollback verified (التحقق من خطة ومسار التراجع).
    6. Zero unresolved Critical findings.
    7. Zero unresolved High findings.
    8. No failed mandatory tests.
    9. No unresolved authorization finding.
  - **Launch Readiness Specification**: مواصفات جاهزية الإطلاق موثقة ومربوطة بجميع الشروط السابقة (لا تُستخدم TC-SEC-018 بمفردها).

---

## 3. مخطط التبعيات التوجيهي الدلالي (Semantic Dependency DAG Structure) `[REQUIRED_EXTENSION]`

يعتمد تسلسل تنفيذ المهام على الترتيب المعماري الدلالي التالي المعزول تماماً من أي دورات مغلقة (Zero Cycles / Zero Missing / Zero Forward Invalidities):

1. **Owner decisions affecting schema** (ODR-001..016)
2. **Canonical glossary & models** (TASK-MG-001)
3. **Capability model & security boundaries** (TASK-MG-007)
4. **Threat model & bounds** (TASK-MG-005, TASK-MG-008, TASK-MG-009)
5. **Schema entities & views** (TASK-MG-004, TASK-MG-006)
6. **Constraints & indexes** (TASK-MG-002, TASK-MG-003, TASK-MG-010)
7. **RLS & grants** (TASK-MG-007, TASK-MG-036, TASK-MG-042)
8. **RPC contracts** (TASK-MG-021, TASK-MG-024, TASK-MG-025, TASK-MG-033, TASK-MG-051, TASK-MG-054, TASK-MG-062)
9. **Audit model & triggers** (TASK-MG-006, TASK-MG-020, TASK-MG-059, TASK-MG-075)
10. **Assignment / lease engine** (TASK-MG-022, TASK-MG-023, TASK-MG-026, TASK-MG-028, TASK-MG-029)
11. **Review / finalization engine** (TASK-MG-031..040, TASK-MG-051..053)
12. **Appeals / regrade engine** (TASK-MG-055..058)
13. **Notifications & outbox engine** (TASK-MG-061..070)
14. **UI & accessibility** (TASK-MG-071..079)
15. **E2E & security tests** (72 Test Specs)
16. **Observability & system health** (TASK-MG-050, TASK-MG-080)
17. **Launch gates** (Final Review & Decision)

```mermaid
graph TD
    subgraph Phase 1: FOUNDATION [البنية التحتية والأمن]
        T1[TASK-MG-001: DB XOR & Rules] --> T2[TASK-MG-002: Append-Only Trigger]
        T1 --> T3[TASK-MG-003: Idempotency Key]
        T1 --> T4[TASK-MG-004: Unified View Invoker]
        T1 --> T5[TASK-MG-005: Snapshot Score Bounds]
        T2 --> T6[TASK-MG-006: Sequential Action ID]
        T1 --> T7[TASK-MG-007: Content Roles Denial]
        T5 --> T8[TASK-MG-008: Non-Negative Check]
        T2 --> T9[TASK-MG-009: Reason Requirement]
        T4 --> T10[TASK-MG-010: Queue DB Indexes]
    end

    subgraph Phase 2: MVP [الخدمات الجوهرية للتشغيل]
        T4 & T7 & T10 --> T11[TASK-MG-011: Subject Queue Filter]
        T11 --> T12[TASK-MG-012: Exam Priority Order]
        T11 --> T14[TASK-MG-014: Manager Manual Dispatch]
        T11 --> T15[TASK-MG-015: Grader Workload Limit]
        T11 --> T16[TASK-MG-016: Abandoned Cleanup]
        T12 --> T17[TASK-MG-017: SLA Warning Filter]
        T14 --> T20[TASK-MG-020: Assignment Audit Log]
        T1 --> T22[TASK-MG-022: Lease Lock Model]
        T1 & T7 & T22 --> T21[TASK-MG-021: Atomic Claim RPC]
        T22 --> T23[TASK-MG-023: Auto-Release Expired Job]
        T21 & T22 --> T24[TASK-MG-024: Manual Release RPC]
        T22 --> T25[TASK-MG-025: Heartbeat Lease Extension]
        T21 & T22 --> T26[TASK-MG-026: Fencing Token Enforcement]
        T21 --> T29[TASK-MG-029: Atomic Claim Race Lock]
        T5 & T7 --> T31[TASK-MG-031: Rubric View Engine]
        T31 --> T32[TASK-MG-032: Auto Rubric Sum]
        T5 & T8 --> T33[TASK-MG-033: RPC Pinned Bounds Check]
        T31 --> T35[TASK-MG-035: Student Feedback Sanitizer]
        T35 --> T36[TASK-MG-036: Internal Notes RLS]
        T33 --> T38[TASK-MG-038: Zero Score Handling]
        T31 --> T39[TASK-MG-039: Mandatory Rubrics Check]
        T4 --> T41[TASK-MG-041: Blind Student Token]
        T41 --> T42[TASK-MG-042: Blind Grader Protection]
        T11 --> T43[TASK-MG-043: COI Auto Check]
        T43 --> T44[TASK-MG-044: Self-Declared COI]
        T2 & T7 & T9 & T34 --> T51[TASK-MG-051: Atomic Finalize RPC]
        T51 --> T52[TASK-MG-052: Exam Session Total Calc]
        T51 --> T53[TASK-MG-053: Return for Second Review]
        T51 --> T61[TASK-MG-061: Notification Batch Hold]
        T7 & T61 --> T62[TASK-MG-062: Batch Release Trigger]
        T62 --> T63[TASK-MG-063: Solution Reveal Timer]
        T62 & T69 --> T64[TASK-MG-064: Notification Outbox]
        T51 & T64 --> T69[TASK-MG-069: Practice Release Dispatcher (IMMEDIATE/DELAYED/BATCH)]
        T62 -. BATCH mode only .-> T69
        T4 --> T71[TASK-MG-071: Arabic RTL Foundation]
        T71 --> T72[TASK-MG-072: BiDi Text Engine]
        T71 --> T73[TASK-MG-073: Touch Target >= 48px]
        T73 --> T74[TASK-MG-074: Responsive Drawer Sheet]
        T1 --> T76[TASK-MG-076: LocalStorage Prohibition]
    end

    subgraph Phase 3: P1 [التوسعات والميزات المتقدمة]
        T11 --> T13[TASK-MG-013: Auto-Dispatch Engine]
        T11 --> T18[TASK-MG-018: Ready Sessions View]
        T17 --> T27[TASK-MG-027: Escalation Alert Dispatch]
        T26 --> T28[TASK-MG-028: Manager Reclaim RPC]
        T22 & T26 --> T30[TASK-MG-030: Offline Recovery Lock Check]
        T32 --> T34[TASK-MG-034: Institution Rounding Rules]
        T7 & T21 & T41 --> T45[TASK-MG-045: Dual Independent Assignment]
        T45 & T34 --> T46[TASK-MG-046: Score Variance & Arithmetic Mean Engine]
        T45 & T46 --> T47[TASK-MG-047: Independent Senior Grader Arbitration View]
        T7 & T51 --> T54[TASK-MG-054: Emergency Reopen RPC]
        T51 --> T55[TASK-MG-055: Student Appeal Submission]
        T55 --> T56[TASK-MG-056: Appeals Window Expiry]
        T55 & T56 --> T57[TASK-MG-057: Independent Appeal Assign]
        T57 --> T58[TASK-MG-058: Appeal Decision & Correction]
        T58 --> T59[TASK-MG-059: Supersession Links Audit]
        T64 --> T65[TASK-MG-065: Outbox Exponential Backoff]
        T64 --> T66[TASK-MG-066: Notification Deduplication]
        T58 & T64 --> T67[TASK-MG-067: Re-Notification Dispatch]
        T63 --> T68[TASK-MG-068: UTC Timezone Verification]
        T2 & T7 & T51 & T54 & T59 --> T75[TASK-MG-075: Security Verification Gate]
        T71 --> T77[TASK-MG-077: WCAG ARIA Labels]
        T77 --> T78[TASK-MG-078: Focus Restoration Engine]
        T74 & T75 & T76 & T78 --> T79[TASK-MG-079: E2E Verification Gate]
    end

    subgraph Phase 4: P2 [التحسينات والتقارير المستقلة]
        T13 --> T19[TASK-MG-019: Round-Robin Distribution]
        T35 --> T37[TASK-MG-037: Preset Snippets Library]
        T31 --> T40[TASK-MG-040: Rubric Reference Media]
        T45 --> T48[TASK-MG-048: Random QA 5% Sampling]
        T41 --> T49[TASK-MG-049: Identity Evidence Flagging]
        T46 & T48 --> T50[TASK-MG-050: Grader Variance Report]
        T58 --> T60[TASK-MG-060: Annual Appeals Report]
        T65 --> T70[TASK-MG-070: Notification Delivery Report]
        T50 & T70 & T75 & T79 --> T80[TASK-MG-080: Production Readiness & Launch Approval Gate]
    end
```

### 3.1. التثبت والتحقق من سلامة المخطط التوجيهي (DAG Validation Block) `[REQUIRED_EXTENSION]`

```
============================================================
             تقرير التثبت الفني لـ Dependency DAG
============================================================
- إجمالي عدد المهمات (Total Tasks):      80 مهمة فريدة
- الاعتماديات المفقودة (Missing Deps):  0
- الدورات التكرارية المغلقة (Cycles):     0
- الاعتماديات المستقبلية الخاطئة:        0 (Forward invalidity free)
- الترتيب الدلالي (Semantic Ordering):   محقق 100%
- ترتيب الأمان قبل المخطط (Threats first): محقق (FOUNDATION)
- ترتيب النموذج قبل الواجهة (Model first): محقق
- ترتيب التعيين والأقفال قبل الطابور:     محقق
- ترتيب RLS قبل الاختبارات:               محقق
- ترتيب الإشعارات بعد الاعتماد النهائي:    محقق
============================================================
```

---

## 4. جدول المخصبات والمقاييس لـ Backlog (Backlog Metrics Summary) `[REQUIRED_EXTENSION]`

| Epic / الملحمة | FOUNDATION | MVP | P1 | P2 | Total Tasks | Migration Req. (Future) | Runtime Req. (Future) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Epic 1: Data Model & Snapshot** | 10 | 0 | 0 | 0 | **10** | 10 | 0 |
| **Epic 2: Queue & Dispatch** | 0 | 7 | 2 | 1 | **10** | 10 | 8 |
| **Epic 3: Lease Locks & SLA** | 0 | 8 | 2 | 0 | **10** | 10 | 9 |
| **Epic 4: Rubrics & Scoring** | 0 | 7 | 1 | 2 | **10** | 8 | 9 |
| **Epic 5: Double Marking & Integrity** | 0 | 4 | 3 | 3 | **10** | 10 | 10 |
| **Epic 6: State Machine & Appeals** | 0 | 3 | 6 | 1 | **10** | 10 | 9 |
| **Epic 7: Outbox & Reveal Timers** | 0 | 5 | 4 | 1 | **10** | 10 | 10 |
| **Epic 8: Mobile UX & System Health** | 0 | 5 | 4 | 1 | **10** | 1 | 10 |
| **إجمالي المهمات الكلي (Total)** | **10** | **39** | **22** | **9** | **80 Tasks** | **69** | **65** |

---
*نهاية الوثيقة MANUAL-GRADING-IMPLEMENTATION-BACKLOG-01 (Canonical Correction 07)*