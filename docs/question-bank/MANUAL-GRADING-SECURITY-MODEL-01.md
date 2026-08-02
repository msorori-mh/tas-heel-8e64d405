# MANUAL-GRADING-SECURITY-MODEL-01
## النموذج الأمني ومصفوفة الصلاحيات وسياسات RLS لمحرك التصحيح اليدوي — التصحيح القانوني المعتمد 03

> **وثيقة النموذج الأمني والسيطرة على التهديدات (Security Model & Threat Matrix Document)**
> **الإصدار:** 3.0.0 (Canonical Correction 03)
> **الحالة:** مجمد للتصميم الوثائقي فقط (Design Frozen - Docs Only / No Code / No SQL Execution / No DB / No Deploy)
> **النظام:** منصة تسهيل التعليمية (Tas-heel Engine - Question Bank QB-01)

---

## 1. قواعد النموذج الأمني وتوحيد الأدوار (Security Principles & Role Unification) `[REQUIRED_EXTENSION]`

### 1.1. المبادئ الجوهرية غير القابلة للمساس `[EXISTING_QB01]`
1. **العدمية والتتابع (Append-Only Immutability)**: جدول `question_response_reviews` مصمم بحيث يمنع عمليات `UPDATE` و `DELETE` مطلقاً.
2. **الصلاحيات الأقل (Least Privilege Enforcement)**: لا يمنح أي دور وصولاً مفتوحاً دون قيود RLS وعقود RPC التثبتية.
3. **الفصل الصارم بين المحتوى والتصحيح (Separation of Authoring vs Grading)**: حظر أدوار المحتوى التعليمي من ممارسة أي عمليات تقييم.

### 1.2. نص صريح لتوحيد الأدوار والحدود الأمنية (Role Unification Explicit Rules) `[REQUIRED_EXTENSION]`

> [!IMPORTANT]
> **قواعد الأدوار الأمنية في منصة تسهيل:**
> - **أدوار التطبيق (`app_role`) تبقى كما هي في النظام دون أي تعديل:**
>   - `admin`
>   - `moderator`
>   - `user`
>   - `content_manager`
> - **ممنوع منعاً باتاً إضافة الأدوار التشغيلية للتصحيح إلى `app_role`**.
> - يتم تعريف الأدوار التالية كـ **Queue Personas + Capability Bundles + Scoped Assignments + Operational Policies**:
>   - `grader`
>   - `senior grader`
>   - `reviewer`
>   - `grading manager`
>   - `admin emergency operator`
> - **`content_manager` لا يصبح `grader` أو `publisher` تلقائياً**.
> - **`admin` لا يملك bypass شاملاً تلقائياً** على جداول وسجلات التصحيح اليدوي دون المرور بـ RLS والتأكد من التكليف الرسمي والتوثيق الأكاديمي.

---

## 2. خريطة الصلاحيات ومصفوفة Capabilities (Capability Mapping Matrix) `[REQUIRED_EXTENSION]`

يعتمد النظام أمنياً على الصلاحية الفعالة المعتمدة في QB-01: **`GRADE_MANUAL_RESPONSE`**، ويربط بقية العمليات المقترحة بامتدادات جديدة صريحة:

| Capability / الصلاحية المقترحة | الوصف التكليفي | الربط بنموذج QB-01 الفعلي | التصنيف | grader | senior grader | reviewer | grading manager | admin emergency operator | content_manager / publisher |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `grading.queue.read` | عرض طابور الإجابات المقالية | مشتقة من `GRADE_MANUAL_RESPONSE` | `REQUIRED_EXTENSION` | ALLOW (مخصص) | ALLOW (شامل) | ALLOW (عينات) | ALLOW (شامل) | ALLOW (تدقيق) | **DENY** |
| `grading.claim.execute` | المطالبة بقفل إجابة في الطابور | امتداد جديد لإدارة الأقفال | `REQUIRED_EXTENSION` | ALLOW | ALLOW | ALLOW | ALLOW | DENY | **DENY** |
| `grading.release.execute` | تحرير قفل إجابة وإعادتها | امتداد جديد | `REQUIRED_EXTENSION` | ALLOW (خاص به) | ALLOW (أي قفل) | ALLOW | ALLOW (إداري) | ALLOW | **DENY** |
| `grading.score.submit` | تقديم درجة أولية وملاحظات | **مطابقة مباشرة لـ `GRADE_MANUAL_RESPONSE`** | `EXISTS_IN_QB01` | ALLOW | ALLOW | ALLOW | DENY | DENY | **DENY** |
| `grading.score.finalize` | الاعتماد النهائي الصارم للدرجة | امتداد لإنفاذ `is_final = true` | `REQUIRED_EXTENSION` | DENY | ALLOW | ALLOW | ALLOW | ALLOW | **DENY** |
| `grading.review.return` | إعادة الإجابة للمراجعة الثانية | امتداد لـ `RETURNED_FOR_SECOND_REVIEW` | `REQUIRED_EXTENSION` | DENY | ALLOW | ALLOW | ALLOW | DENY | **DENY** |
| `grading.reopen.execute` | فتح مراجعة استثنائية لدرجة | امتداد جديد بقيد السبب | `REQUIRED_EXTENSION` | DENY | DENY | DENY | ALLOW (بسبب) | ALLOW (طوارئ) | **DENY** |
| `grading.appeal.process` | معالجة وتعديل الاعتراضات | امتداد مسار التظلمات | `REQUIRED_EXTENSION` | DENY | ALLOW | ALLOW | ALLOW | DENY | **DENY** |
| `grading.double_mark.arbitrate` | تحكيم التصحيح المزدوج | امتداد حسم التباين | `REQUIRED_EXTENSION` | DENY | ALLOW | ALLOW | ALLOW | DENY | **DENY** |
| `grading.audit.read` | قراءة سجل التدقيق التتابعي | امتداد قراءة `reviews` | `REQUIRED_EXTENSION` | DENY | ALLOW (خاص) | ALLOW | ALLOW (شامل) | ALLOW (شامل) | **DENY** |
| `grading.batch.release` | الاعتماد ونشر نتائج الدفعة | خاضع لقرار المالك | `OWNER_DECISION` | DENY | DENY | DENY | ALLOW | ALLOW | **DENY** |
| `grading.emergency.override` | التجاوز الاستثنائي للطوارئ | خاضع لقرار المالك | `OWNER_DECISION` | DENY | DENY | DENY | DENY | ALLOW | **DENY** |
| `qb.content.publish` | نشر محتوى بنك الأسئلة | صلاحية نشر بنك المحتوى | `EXISTS_IN_QB01` | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | ALLOW (`publisher`) |

---

## 3. مصفوفة الوصول الكامل وسياسات RLS (Student Data & Full RLS Access Matrix) `[REQUIRED_EXTENSION]`

تضمن سياسات Row-Level Security (RLS) العزل التام للبيانات ومنع أي استعلام غير مصرح به:

| الكيان / المورد (Resource) | الطالب (Student) | المصحح (Grader A) | المصحح الثاني (Grader B) | المراجع (Reviewer) | مدير التصحيح (Grading Manager) | أدوار بنك المحتوى (Content Roles) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **استجابات الطالب الخاصة** | **ALLOW** (إجاباته فقط) | DENY (غير المعينة) | DENY (غير المعينة) | DENY (خارج النطاق) | DENY (البيانات الشخصية) | **DENY** |
| **الاستجابة المعينة للتصحيح** | DENY | **ALLOW** (حسب Claim) | **ALLOW** (حسب Claim) | ALLOW (ضمن العينة) | ALLOW (metadata فقط) | **DENY** |
| **درجة المصحح الآخر (Blind)** | DENY | **DENY** (قبل التسليم) | **DENY** (قبل التسليم) | ALLOW (عند التحكيم) | ALLOW (عند التباين) | **DENY** |
| **بيانات التشغيل والأداء** | DENY | DENY | DENY | ALLOW (في النطاق) | **ALLOW** (شامل النطاق) | **DENY** |
| **بيانات المواد الأخرى (Cross-Subject)** | DENY | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** |
| **بيانات الطلاب الآخرين (Cross-Student)** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** |
| **الإجابة النموذجية المخفية** | **DENY** (قبل Reveal) | ALLOW (للتصحيح) | ALLOW (للتصحيح) | ALLOW | ALLOW | ALLOW (للمعيانة) |
| **قراءة مباشرة لـ `reviews` (Raw SELECT)** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** | **DENY** |

### 3.1. الضوابط الجوهرية لـ RLS:
- **حظر الاستعلام العام (No General SELECT)**: يُحظر منح صلاحية `SELECT` العامة على جداول `question_response_reviews` و `grading_assignments`؛ وتقتصر قراءة البيانات على مناظر أمنية موضحة بـ `security_invoker = true` أو عبر RPCs محمية.
- **عزل الطلاب (Student Isolation)**: `auth.uid() = user_id` شرط حزمي في سياسات RLS الخاصة باستجابات الطلاب ونتائجهم.
- **عزل المواد والتخصصات (Cross-Subject Denial)**: يتم التحقق من مطابقة `subject_id` للاستجابة مع `subject_scope` المصرحة للمصحح في جدول التكليفات قبل منح أي قفل أو قراءة.

---

## 4. حماية الأقفال ورمز المحاصرة (Lease Locks & Fencing Token Security) `[REQUIRED_EXTENSION]`

1. **الوقاية من الكتابة المنتهية (Stale Writes Prevention)**:
   كل دالة تقديم درجات (`submit_graded_score`) تطلب `fencing_token` متولداً من السيرفر ومربوطاً بـ `assignment_generation`.
2. **فحص الصلاحية التزامني**:
   ```sql
   -- فحص السيرفر الذري داخل RPC
   IF v_assignment.lease_expires_at < now() THEN
       RAISE EXCEPTION 'ASSIGNMENT_LEASE_EXPIRED';
   END IF;
   IF v_assignment.fencing_token != p_fencing_token THEN
       RAISE EXCEPTION 'STALE_FENCING_TOKEN';
   END IF;
   ```
3. **منع السباق الصريح (Claim Race Prevention)**: يتم استخدام أقفال الصفوف الذرية `FOR UPDATE NOWAIT` أثناء عملية المطالبة لضمان عدم إمكانية حصول مصححين على قفل لنفس التعيين في ذات اللحظة.

---

## 5. تحليل التهديدات وتدابير الحماية الـ 15 (15 Threat Vectors Analysis) `[REQUIRED_EXTENSION]`

### 5.1. التهديد 1: تصحيح إجابة غير مخصصة (Unassigned Response Grading) `[EXISTING_QB01]`
- **الحماية**: فحص وجود قفل نشط ومطابق لـ `auth.uid()` و `fencing_token`.
- **النتيجة**: استثناء `ASSIGNMENT_NOT_FOUND_OR_EXPIRED`.

### 5.2. التهديد 2: تقديم درجة تتجاوز الحد الأقصى (Score Above Max) `[EXISTING_QB01]`
- **الحماية**: جلب `snapshot-pinned max_score` وفحص `0 <= score <= max_score` داخل RPC.
- **النتيجة**: استثناء `SCORE_EXCEEDS_MAX_BOUND`.

### 5.3. التهديد 3: تقديم درجة بالسالب (Negative Score) `[EXISTING_QB01]`
- **الحماية**: قيد السيرفر الصارم ومطابقة `score_awarded >= 0`.
- **النتيجة**: استثناء `INVALID_NEGATIVE_SCORE`.

### 5.4. التهديد 4: تعديل درجة معتمدة نهائياً بشكل مباشر (Changing Finalized Score) `[EXISTING_QB01]`
- **الحماية**: حظر `UPDATE` كلياً بتريجر Append-Only، واشتراط RPC الفتح الاستثنائي مع حقل `reason`.
- **النتيجة**: استثناء `UPDATE_BLOCKED_APPEND_ONLY`.

### 5.5. التهديد 5: حذف سجل مراجعة سابق (Deleting Review Record) `[EXISTING_QB01]`
- **الحماية**: حظر `DELETE` كلياً على `question_response_reviews`.
- **النتيجة**: استثناء `DELETE_BLOCKED_APPEND_ONLY`.

### 5.6. التهديد 6: ترقية المصحح إلى ناشر في بنك المحتوى (Grader Becoming Publisher) `[EXISTING_QB01]`
- **الحماية**: الفصل المطلق في حزم الصلاحيات وسحب `qb.content.publish` عن جميع شخصيات التصحيح.
- **النتيجة**: استثناء `FORBIDDEN_CAPABILITY`.

### 5.7. التهديد 7: رؤية الإجابة النموذجية قبل توقيت Reveal (Viewing Hidden Solution) `[EXISTING_QB01]`
- **الحماية**: عدم إرجاع حقول الإجابة النموذجية في RPCs إلا بعد استيفاء `batch_finalized_at + reveal_at`.
- **النتيجة**: حجب البيانات وإرجاع قيم `NULL`.

### 5.8. التهديد 8: الوصول لإجابات طلاب آخرين (Cross-Student Access) `[EXISTING_QB01]`
- **الحماية**: إنفاذ سياسات RLS على مستوى `user_id = auth.uid()`.
- **النتيجة**: إرجاع 0 صفوف.

### 5.9. التهديد 9: تصحيح مادة خارج التخصص (Cross-Subject Access) `[EXISTING_QB01]`
- **الحماية**: مطابقة `subject_id` مع `subject_scope` المعتمدة للمصحح قبل المطالبة.
- **النتيجة**: استثناء `SUBJECT_ACCESS_DENIED`.

### 5.10. التهديد 10: العمل على تعيين منتهي الصلاحية (Stale Lease Execution) `[EXISTING_QB01]`
- **الحماية**: فحص `lease_expires_at > now()` داخل RPC الإرسال.
- **النتيجة**: استثناء `ASSIGNMENT_LEASE_EXPIRED`.

### 5.11. التهديد 11: التصحيح التزامني المتنافس (Simultaneous Graders Conflict) `[EXISTING_QB01]`
- **الحماية**: أقفال الصفوف الذرية ومفاتيح كبح التكرار `idempotency_key`.
- **النتيجة**: نجاح الطلب الأول ورفض الثاني بـ `DUPLICATE_IDEMPOTENCY_KEY`.

### 5.12. التهديد 12: التلاعب بالطوابع الزمنية وسجل التدقيق (Audit Tampering) `[EXISTING_QB01]`
- **الحماية**: التوليد الآلي التلقائي للأختام الزمنية و `action_id` من السيرفر دون قبول مدخلات العميل.
- **النتيجة**: تجاهل قيم العميل واستخدام أختام السيرفر.

### 5.13. التهديد 13: إرسال الإشعارات قبل الاعتماد النهائي (Early Notification Leak) `[EXISTING_QB01]`
- **الحماية**: ربط Outbox بحالتي `FINALIZED + RELEASED`.
- **النتيجة**: حظر توليد الرسائل في Outbox.

### 5.14. التهديد 14: التقديم بواسطة Fencing Token قديم (Stale Fencing Token Attack) `[REQUIRED_EXTENSION]`
- **الحماية**: مطابقة `fencing_token` مع `assignment_generation` التزامني.
- **النتيجة**: رفض الطلب واستثناء `STALE_FENCING_TOKEN`.

### 5.15. التهديد 15: اطلاع مصحح على درجة مصحح آخر أثناء التصحيح المزدوج (Double Mark Blind Breach) `[REQUIRED_EXTENSION]`
- **الحماية**: حجب درجات وملاحظات المصحح المناظر في مناظر التصحيح حتى اكتمال التقييمين وتفعيل مرحلة التحكيم.
- **النتيجة**: حجب بيانات المصحح المناظر كلياً.

---

## 6. قيود العمل بدون اتصال وحماية البيانات (Offline Limitations) `[EXISTING_QB01]`

- **حظر التخزين المحلي للدرجات والمسودات**: يُمنع حفظ أي مسودات أو درجات غير معتمدة في `localStorage` أو `IndexedDB`.
- **آلية العمل الحتمية**: تعمل الشاشات في وضع الاتصال المتزامن المباشر. عند انقطاع الاتصال الشبكي، يتم تجميد أزرار الإدخال وتنبيه المصحح فوراً بضرورة استعادة الاتصال لاستكمال التصحيح بحماية `fencing_token`.

---
*نهاية الوثيقة MANUAL-GRADING-SECURITY-MODEL-01 (Canonical Correction 03)*
