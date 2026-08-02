# MANUAL-GRADING-IMPLEMENTATION-BACKLOG-01
## سجل المهمات والنمو التطويري لمحرك التصحيح اليدوي (Implementation Backlog)

> **وثيقة سجل المهمات والخطة التنفيذية (Detailed Backlog Specification - 75 Tasks)**  
> **الإصدار:** 1.0.0  
> **الحالة:** مجمد للتصميم (Design Frozen - No Code / No SQL Execution)  
> **النظام:** منصة تسهيل التعليمية (Tas-heel Engine - Question Bank QB-01)  

---

## 1. الهيكلية المنهجية لـ Backlog (Backlog Structure & Taxonomy)

تم تقسيم سجل المهمات إلى **8 الملاحم التطويرية (Epics)** التي تغطي كافة متطلبات محرك التصحيح اليدوي، مع ضمان استيفاء لا يقل عن **75 مهمة تفصيلية**.

كل مهمة في هذا السجل معرفة بالبنود التالية:
- **معرف المهمة (Task ID)**
- **عنوان المهمة (Title)**
- **الملحمة (Epic Category)**
- **الأولوية (Priority: P0 Critical, P1 High, P2 Medium)**
- **الأدوار المسموحة (Target Roles)**
- **شروط القبول التفصيلية (Acceptance Criteria)**
- **الضوابط الأمنية (Security & Compliance Controls)**

---

## 2. قائمة المهمات الـ 75 التفصيلية (Detailed Backlog Tasks)

### Epic 1: Data Model, Constraints & Append-Only Infrastructure (البنية التحتية)

- **TASK-MG-001: التثبت المعماري لقواعد `question_response_reviews` الهيكلية**
  - **Epic**: Data Model Foundation | **Priority**: P0
  - **Target Roles**: `admin emergency operator`, `grading manager`
  - **Acceptance Criteria**: التأكد من الربط المزدوج XOR بين `exam_answer_id` و `practice_response_id` ومنع خلو الاثنين أو توفرهما معاً.
  - **Security Control**: تفعيل قيود `CHECK` الهيكلية الصارمة.

- **TASK-MG-002: تفعيل تريجر منع الحذف والتعديل المباشر على جدول المراجعات**
  - **Epic**: Data Model Foundation | **Priority**: P0
  - **Target Roles**: `admin emergency operator`
  - **Acceptance Criteria**: رفض أي دالة أو استعلام يُنفذ `UPDATE` أو `DELETE` على `question_response_reviews`.
  - **Security Control**: إنفاذ مبدأ `Append-Only` المطلق.

- **TASK-MG-003: دعم مفتاح كبح التكرار `idempotency_key` المزدوج**
  - **Epic**: Data Model Foundation | **Priority**: P0
  - **Target Roles**: `grader`, `senior grader`
  - **Acceptance Criteria**: منع تكرار إرسال نصوص التقييم عند تعثر الشبكة باستخدام قيد `UNIQUE (exam_answer_id, idempotency_key)`.
  - **Security Control**: منع الهجمات المزدوجة وإعادات الإرسال المتكرر.

- **TASK-MG-004: بناء المنظر الموحد للاستجابات `v_question_responses_unified`**
  - **Epic**: Data Model Foundation | **Priority**: P1
  - **Target Roles**: `grader`, `senior grader`, `reviewer`, `grading manager`
  - **Acceptance Criteria**: دمج استجابات الامتحانات والتمارين في منظر أمني موحد يدعم `security_invoker = true`.
  - **Security Control**: تطبيق قواعد RLS المستدعية للأنظار.

- **TASK-MG-005: الربط مع جداول حدود الدرجات `score_bounds` في بنك الأسئلة**
  - **Epic**: Data Model Foundation | **Priority**: P0
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: التأكد من جلب `max_score` من `question_revisions` لمنع تجاوز الدرجات المحددة.
  - **Security Control**: فحص الحدود العليا والسفلى على مستوى السيرفر.

- **TASK-MG-006: ربط معرف التقييم السلسلي `action_id` لجميع العمليات**
  - **Epic**: Data Model Foundation | **Priority**: P1
  - **Target Roles**: `grading manager`, `admin emergency operator`
  - **Acceptance Criteria**: توليد UUID فريد تلقائياً لكل عملية تقييم لتتبع التسلسل الزمني.
  - **Security Control**: منع التلاعب بـ Audit Trail.

- **TASK-MG-007: عزل جداول التصحيح عن ادوار بنك المحتوى (`editor`, `publisher`)**
  - **Epic**: Data Model Foundation | **Priority**: P0
  - **Target Roles**: `grading manager`
  - **Acceptance Criteria**: إلغاء كافة الصلاحيات (`REVOKE ALL`) على `question_response_reviews` عن أدوار المحتوى.
  - **Security Control**: فصل الواجبات والأدوار (Separation of Duties).

- **TASK-MG-008: دعم قيد الدرجة الموجبة `score_awarded >= 0`**
  - **Epic**: Data Model Foundation | **Priority**: P0
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: إجبار القيمة لتكون أكبر من أو تساوي الصفر المطلق.
  - **Security Control**: منع الثغرات المتعلقة بالدرجات السالبة.

- **TASK-MG-009: هيكلة حقل `reason` الإجباري عند الاعتماد النهائي**
  - **Epic**: Data Model Foundation | **Priority**: P0
  - **Target Roles**: `senior grader`, `grading manager`
  - **Acceptance Criteria**: اشتراط تعبئة الحقل `reason` عند `is_final = true` ورفض الطلب إذا كان `NULL`.
  - **Security Control**: توثيق الأسباب القانونية والأكاديمية للاعتماد.

- **TASK-MG-010: تهيئة الفهارس المزدوجة لتسريع استعلامات الطوابير**
  - **Epic**: Data Model Foundation | **Priority**: P2
  - **Target Roles**: `grading manager`
  - **Acceptance Criteria**: إنشاء فهارس على `(grader_id, is_final)` وعلى المفاتيح الأجنبية لتحسين أداء الطابور.
  - **Security Control**: حماية النظام من هجمات الحرمان من الخدمة (DoS).

---

### Epic 2: Queue Engine & Dynamic Assignment Dispatch (طابور العمل والتوزيع)

- **TASK-MG-011: بناء طابور الإجابات غير المصححة حسب المادة**
  - **Epic**: Queue & Assignment | **Priority**: P0
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: تجميع الإجابات التي تحتاج تصحيحاً وتصفيتها حسب مادة تخصص المصحح.
  - **Security Control**: منع الوصول للمواد غير المترخصة (Cross-Subject Access).

- **TASK-MG-012: ترتيب الطابور بحسب أولوية الامتحانات الرسمية**
  - **Epic**: Queue & Assignment | **Priority**: P1
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: إعطاء الأولوية في الطابور لإجابات الامتحانات النهائية ثم منتصف الفصل ثم التمارين.
  - **Security Control**: احترام جدول مواعيد النتائج الرسمية.

- **TASK-MG-013: خوارزمية التوزيع التلقائي المتوازن (Auto-Dispatch Engine)**
  - **Epic**: Queue & Assignment | **Priority**: P1
  - **Target Roles**: `grading manager`
  - **Acceptance Criteria**: توزيع الإجابات تلقائياً على المصححين المتاحين بناءً على حمولة كل مصحح.
  - **Security Control**: حظر إسناد مهام تتجاوز الحد الأقصى لسعة المصحح.

- **TASK-MG-014: التخصيص اليدوي للدفعات من قبل مدير التصحيح**
  - **Epic**: Queue & Assignment | **Priority**: P1
  - **Target Roles**: `grading manager`
  - **Acceptance Criteria**: واجهة تتيح نقل مجموعة إجابات من مصحح إلى آخر أو تخصيصها لمصحح معين.
  - **Security Control**: التحقق من صلاحية `grading.claim.execute` للمدير.

- **TASK-MG-015: تحديد السعة القصوى لعمليات التصحيح النشطة للمصحح**
  - **Epic**: Queue & Assignment | **Priority**: P2
  - **Target Roles**: `grading manager`
  - **Acceptance Criteria**: منع إسناد أي إجابة جديدة للمصحح إذا بلغت إجاباته النشطة قيد التصحيح الحد الأقصى (مثلاً 50).
  - **Security Control**: منع احتكار الطوابير وتأخير النتائج.

- **TASK-MG-016: استبعاد الإجابات الملغاة أو المهجورة من طابور التصحيح**
  - **Epic**: Queue & Assignment | **Priority**: P1
  - **Target Roles**: `system`
  - **Acceptance Criteria**: تنظيف الطابور تلقائياً من إجابات المحاولات الملغاة أو التي انسحب منها الطالب.
  - **Security Control**: منع استهلاك جهد المصححين في بيانات ملغاة.

- **TASK-MG-017: فلترة الطابور بحسب حالة اتفاقية مستوى الخدمة (SLA Status)**
  - **Epic**: Queue & Assignment | **Priority**: P1
  - **Target Roles**: `grader`, `senior grader`
  - **Acceptance Criteria**: إبراز الإجابات المقتربة من تجاوز الموعد المحدد بلون تنبيهي خفيف.
  - **Security Control**: إنفاذ مهل الجودة والأداء.

- **TASK-MG-018: إنشاء منظر الجلسات الجاهزة للتصحيح اليدوي**
  - **Epic**: Queue & Assignment | **Priority**: P2
  - **Target Roles**: `grading manager`
  - **Acceptance Criteria**: تجميع الجلسات الامتحانية التي تم إنهاؤها كلياً واستخراج الإجابات المقالية فوراً.
  - **Security Control**: ضغط المهل الزمنية بعد انتهاء الامتحان.

- **TASK-MG-019: دعم خيار التوزيع الدائري (Round-Robin Distribution)**
  - **Epic**: Queue & Assignment | **Priority**: P2
  - **Target Roles**: `grading manager`
  - **Acceptance Criteria**: توزيع الإجابات بالتساوي بين المصححين المعتمدين في المادة.
  - **Security Control**: تحقيق العدالة في توزيع العبء.

- **TASK-MG-020: تسجيل أحداث تغيير حالة التخصيص في سجل الأحداث**
  - **Epic**: Queue & Assignment | **Priority**: P2
  - **Target Roles**: `grading manager`
  - **Acceptance Criteria**: تتبع حالات تعيين، إلغاء، أو نقل الإجابات بين المصححين.
  - **Security Control**: الشفافية التامة في تتبع التعيينات.

---

### Epic 3: Claim, Release, Locking & SLA Management (المطالبة والقفل والمهل)

- **TASK-MG-021: آلية المطالبة الفردية (Claim Response)**
  - **Epic**: Claim & SLA | **Priority**: P0
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: تمكين المصحح من قفل إجابة محددة وبدء التصحيح حصرياً.
  - **Security Control**: منع تصحيح إجابة غير مخصصة (Threat 1).

- **TASK-MG-022: إنشاء القفل المؤقت لمهلة التصحيح (Lease Lock TTL)**
  - **Epic**: Claim & SLA | **Priority**: P0
  - **Target Roles**: `system`
  - **Acceptance Criteria**: تحديد وقت صلاحية للقفل (15 دقيقة) وتوليد `lease_expires_at`.
  - **Security Control**: منع القفل الأبدي للبيانات.

- **TASK-MG-023: التحرير التلقائي للقفل عند انقضاء المهلة (Auto-Release on Expiry)**
  - **Epic**: Claim & SLA | **Priority**: P0
  - **Target Roles**: `system`
  - **Acceptance Criteria**: إعادة الإجابة للطابور العام فور انقضاء TTL ورفض أي تقديم متأخر.
  - **Security Control**: منع تقديم درجات من قفل منتهي الصلاحية (Threat 10).

- **TASK-MG-024: التحرير اليدوي الصريح من المصحح (Manual Release)**
  - **Epic**: Claim & SLA | **Priority**: P1
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: إمكانية إرجاع المصحح للإجابة للطابور مع إدخال سبب التحرير (مثلاً: عدم تخصص فرعي).
  - **Security Control**: تتبع أسباب التحرير وتوثيقها.

- **TASK-MG-025: تجديد مهلة القفل أثناء الكتابة النشطة (Heartbeat Lease Extension)**
  - **Epic**: Claim & SLA | **Priority**: P2
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: إرسال نبضة إشارة تفاعل لتمديد القفل 5 دقائق إضافية طالما المصحح يكتب ملاحظات.
  - **Security Control**: حظر التمديد لأكثر من الحد الأقصى الإجمالي (30 دقيقة).

- **TASK-MG-026: محرك التنبيهات الدورية لتجاوز مهل SLA**
  - **Epic**: Claim & SLA | **Priority**: P1
  - **Target Roles**: `grading manager`
  - **Acceptance Criteria**: إرسال تنبيهات عند 75% و 100% من المهلة المحددة للمادة.
  - **Security Control**: ضمان الالتزام بالمهل الرسمية.

- **TASK-MG-027: التصعيد التلقائي للمهمات المتأخرة إلى المصحح الأول**
  - **Epic**: Claim & SLA | **Priority**: P1
  - **Target Roles**: `senior grader`
  - **Acceptance Criteria**: نقل التعيين تلقائياً إلى `senior grader` عند تجاوز المهلة الرسمية للامتحان.
  - **Security Control**: حماية مسار تصحيح الامتحانات الرسمية.

- **TASK-MG-028: لوحة تتبع مهل SLA والمهمات الحرجة**
  - **Epic**: Claim & SLA | **Priority**: P2
  - **Target Roles**: `grading manager`
  - **Acceptance Criteria**: عرض رسومي لنسبة الالتزام بالمهل وأعداد المهمات المتأخرة.
  - **Security Control**: الإشراف الإداري المباشر على الأداء.

- **TASK-MG-029: تحرير التعيين بقرار إداري من مدير التصحيح**
  - **Epic**: Claim & SLA | **Priority**: P1
  - **Target Roles**: `grading manager`
  - **Acceptance Criteria**: فك القفل عن أي إجابة محتجزة يدويّاً وإعادتها للطابور.
  - **Security Control**: معالجة حالات تعطل المصححين الطارئة.

- **TASK-MG-030: حظر المطالبة المزدوجة لنفس الإجابة (Double Claim Block)**
  - **Epic**: Claim & SLA | **Priority**: P0
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: استبعاد الإجابة من الطابور فور مطالبة مصحح آخر بها لتفادي الصدام.
  - **Security Control**: منع التنافس والتضارب المتزامن (Threat 11).

---

### Epic 4: Rubrics Evaluator, Partial Scoring & Feedback System (سلم التقييم والدرجات)

- **TASK-MG-031: بناء مكون عرض سلم التقييم المعياري (Rubric Evaluator UI)**
  - **Epic**: Rubrics & Scoring | **Priority**: P0
  - **Target Roles**: `grader`, `senior grader`
  - **Acceptance Criteria**: عرض بنود Rubric في واجهة تفاعلية تحتوي الأوصاف والنقاط المخصصة.
  - **Security Control**: جلب البنود المعتمدة في `question_revisions` حصرياً.

- **TASK-MG-032: الاحتساب الآلي لمجموع البنود الفرعية**
  - **Epic**: Rubrics & Scoring | **Priority**: P0
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: جمع نقاط البنود المختارة آلياً وتحديث حقل الدرجة دون إمكانية التعديل اليدوي المنافي.
  - **Security Control**: منع تباين المجموع مع البنود المحددة.

- **TASK-MG-033: دعم قواعد الاحتساب الجزئي (Partial Scoring Engine)**
  - **Epic**: Rubrics & Scoring | **Priority**: P1
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: منح جزء من الدرجة بناءً على معايير الخطوات الإجرائية في الإجابات المقالية.
  - **Security Control**: إنفاذ شرط `score_awarded <= max_score`.

- **TASK-MG-034: تطبيق قواعد تقريب الدرجات المعتمدة للمؤسسة**
  - **Epic**: Rubrics & Scoring | **Priority**: P2
  - **Target Roles**: `system`
  - **Acceptance Criteria**: تقريب الكسور الناتجة إلى أقرب 0.25 أو 0.50 حسب إعدادات المقرر.
  - **Security Control**: توحيد معايير الحساب ومنع الكسائر الشاذة.

- **TASK-MG-035: واجهة إدخال ملاحظات الطالب (Student Feedback Control)**
  - **Epic**: Rubrics & Scoring | **Priority**: P1
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: حقل نصي مخصص لكتابة الملاحظات التعليمية والتوضيحية للطالب.
  - **Security Control**: تصفية النصوص لمنع تضمين روابط أو نصوص ضارة (XSS Sanitization).

- **TASK-MG-036: واجهة الملاحظات السرية للمراجعين (Internal Grader Notes)**
  - **Epic**: Rubrics & Scoring | **Priority**: P1
  - **Target Roles**: `grader`, `senior grader`, `reviewer`
  - **Acceptance Criteria**: حقل ملاحظات سري لا يظهر للطالب إطلاقاً ويخصص للتواصل الداخلي بين المصححين.
  - **Security Control**: حجب الحقل كلياً عن استعلامات الطلاب بـ RLS.

- **TASK-MG-037: معجم الردود والملاحظات الجاهزة (Preset Feedback Snippets)**
  - **Epic**: Rubrics & Scoring | **Priority**: P2
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: القائمة المنبثقة للاختيار السريع للملاحظات الشائعة لتوفير وقت المصحح.
  - **Security Control**: ضمان معيارية التعليقات التعليمية.

- **TASK-MG-038: معالجة خلو الملاحظات وحفظ التقييم بـ Zero Score**
  - **Epic**: Rubrics & Scoring | **Priority**: P1
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: السماح بإعطاء درجة صفر شريطة اختيار بند Rubric المعني بالتقصير.
  - **Security Control**: إنفاذ `score_awarded >= 0`.

- **TASK-MG-039: دعم المرفقات والتوضيحات البصرية في سلم التقييم**
  - **Epic**: Rubrics & Scoring | **Priority**: P2
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: عرض الصور المرجعية والتوضيحية المرفقة بسلم التقييم للأسئلة المخططة.
  - **Security Control**: قراءة المرفقات بحجم أقصى محدد ودون إمكانيات تنفيذ برمجيات.

- **TASK-MG-040: التحقق من اكتمال تقييم جميع البنود الإجبارية قبل التسليم**
  - **Epic**: Rubrics & Scoring | **Priority**: P0
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: منع إرسال التقييم إذا وجد بند إجباري لم يتم اختيار مستواه بعد.
  - **Security Control**: منع استكمال التصحيح الجزئي الناقص.

---

### Epic 5: Double Marking, Moderation, Blind Grading & Conflict Protection (النزاهة والحياد)

- **TASK-MG-041: حظر معلومات هوية الطالب عن شاشة المصحح (Blind Grading)**
  - **Epic**: Double Marking & Integrity | **Priority**: P0
  - **Target Roles**: `grader`, `senior grader`
  - **Acceptance Criteria**: إخفاء الاسم، الرقم الأكاديمي، والمؤسسة، واستبدالها برمز مجهول تشفيري.
  - **Security Control**: حماية الحياد ومنع التحيز الشخصي.

- **TASK-MG-042: إخفاء هوية المصحح عن الطالب في واجهات النتائج**
  - **Epic**: Double Marking & Integrity | **Priority**: P1
  - **Target Roles**: `student`
  - **Acceptance Criteria**: إخفاء اسم بيانات المصحح عند استعراض الطالب لنتائجه وملاحظاته.
  - **Security Control**: منع التواصل المباشر أو الضغوط الخارجية على المصححين.

- **TASK-MG-043: محرك فحص تضارب المصالح وحظر الأقارب (Conflict of Interest Engine)**
  - **Epic**: Double Marking & Integrity | **Priority**: P0
  - **Target Roles**: `system`
  - **Acceptance Criteria**: مطابقة قائمة الأقارب والطلاب المباشرين وحجب إجاباتهم تلقائياً عن طابور المصحح.
  - **Security Control**: حظر تصحيح الأقارب والأشخاص المرتبطين.

- **TASK-MG-044: التصريح الذاتي للمصحح عن وجود تضارب مصالح (Self-Declared Conflict)**
  - **Epic**: Double Marking & Integrity | **Priority**: P1
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: زر يتيح للمصحح الاستبعاد الذاتي لإجابة معينة لسبب تضارب مصالح شخصي.
  - **Security Control**: توثيق الاستبعاد وإحالة الإجابة لمصحح آخر.

- **TASK-MG-045: محرك التصحيح المزدوج المستقل (Dual Independent Marking)**
  - **Epic**: Double Marking & Integrity | **Priority**: P1
  - **Target Roles**: `grader 1`, `grader 2`
  - **Acceptance Criteria**: تخصيص نفس الإجابة لمصححين اثنين دون اطلاع أي منهما على النتيجة الأخرى.
  - **Security Control**: سرية التقييم المستقل التام.

- **TASK-MG-046: محرك رصد انحراف الدرجات (Score Variance Threshold Check)**
  - **Epic**: Double Marking & Integrity | **Priority**: P1
  - **Target Roles**: `system`
  - **Acceptance Criteria**: احتساب نسبة التباين بين المصححين وتوسيم الإجابة للتنازع إذا تجاوز التباين 15%.
  - **Security Control**: اكتشاف الفروقات الجوهرية آلياً.

- **TASK-MG-047: واجهة التحكيم وحسم التنازع من قبل المصحح الأول**
  - **Epic**: Double Marking & Integrity | **Priority**: P1
  - **Target Roles**: `senior grader`
  - **Acceptance Criteria**: عرض التقييمين جنبًا إلى جنب وتمكين Senior Grader من إصدار القرار النهائي المعتمد.
  - **Security Control**: ضبط جودة التقييم المزدوج.

- **TASK-MG-048: نظام سحب العينات العشوائية لضبط الجودة (Random QA Sampling)**
  - **Epic**: Double Marking & Integrity | **Priority**: P2
  - **Target Roles**: `reviewer`
  - **Acceptance Criteria**: اختيار 5% من الإجابات المعتمدة عشوائياً وتوجيهها للمراجع لفحص جودة التقييم.
  - **Security Control**: الرقابة المستمرة على معايير التصحيح.

- **TASK-MG-049: وسم الإجابات المشبوهة أو التي تحتوي علامات استدلالية**
  - **Epic**: Double Marking & Integrity | **Priority**: P2
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: إمكانية رفع بلاغ عن إجابة طالب تحتوي اسماً صريحاً أو علامة غش داخل كود/نص الإجابة.
  - **Security Control**: تحويل البلاغ لإدارة الامتحانات لاتخاذ القرار.

- **TASK-MG-050: تقرير مؤشرات التباين والعدالة بين المصححين**
  - **Epic**: Double Marking & Integrity | **Priority**: P2
  - **Target Roles**: `grading manager`
  - **Acceptance Criteria**: تقرير إحصائي يقيس تباين درجات كل مصحح مقارنة بالمتوسط العام للمادة.
  - **Security Control**: كشف التساهل أو التشدد المفرط لدى المصححين.

---

### Epic 6: Finalization, Reopening, Appeals & Regrading Engine (الاعتماد والتظلمات)

- **TASK-MG-051: تنفيذ الاعتماد النهائي الذري للدرجة (`is_final = true`)**
  - **Epic**: Finalization & Appeals | **Priority**: P0
  - **Target Roles**: `senior grader`, `grading manager`
  - **Acceptance Criteria**: تحويل حالة التقييم إلى معتمد نهائي واشتراط تعبئة سبب الاعتماد `reason`.
  - **Security Control**: قفل الدرجة وتفعيل الحماية من التعديل.

- **TASK-MG-052: تحديث النتيجة الإجمالية للجلسة الامتحانية عند اكتمال الأسئلة**
  - **Epic**: Finalization & Appeals | **Priority**: P0
  - **Target Roles**: `system`
  - **Acceptance Criteria**: إعادة احتساب المجموع النهائي للجلسة في `exam_sessions` فور اعتماد آخر إجابة مقالية.
  - **Security Control**: الاتساق الذري لنتائج الاختبارات.

- **TASK-MG-053: إعادة التقييم والتوجيه للتعديل (Return for Review Workflow)**
  - **Epic**: Finalization & Appeals | **Priority**: P1
  - **Target Roles**: `senior grader`, `reviewer`
  - **Acceptance Criteria**: إرجاع تقييم المصحح المبتدئ مع ملاحظات توجيهية وإعادته لحالة قيد التعديل.
  - **Security Control**: منع اعتماد درجات غير مستوفية للشروط.

- **TASK-MG-054: فتح المراجعة الاستثنائية بقرار إداري (Emergency Reopen RPC)**
  - **Epic**: Finalization & Appeals | **Priority**: P0
  - **Target Roles**: `grading manager`, `admin emergency operator`
  - **Acceptance Criteria**: فتح درجة معتمدة سابقاً عبر إدراج صف جديد في `question_response_reviews` يسجل السبب والدرجة السابقة.
  - **Security Control**: المحافظة على التتابعية وعدم مسح التقييم السالف (Append-Only).

- **TASK-MG-055: تقديم التظلم والاعتراض من قبل الطالب (Student Appeal Engine)**
  - **Epic**: Finalization & Appeals | **Priority**: P1
  - **Target Roles**: `student`
  - **Acceptance Criteria**: واجهة تتيح للطالب اعتراضه على درجة سؤال مقالي خلال النافذة الزمنية المسموحة.
  - **Security Control**: التحقق من ملكية الطالب للجلسة الامتحانية وانقضاء الاعتماد النهائي.

- **TASK-MG-056: إدارة نافذة تقديم الاعتراضات (Appeals Window Control)**
  - **Epic**: Finalization & Appeals | **Priority**: P2
  - **Target Roles**: `grading manager`
  - **Acceptance Criteria**: ضبط عدد الأيام المتاحة لتقديم الاعتراض (مثلاً 7 أيام) وإغلاق استقبال الطلبات بعدها آلياً.
  - **Security Control**: منع الاعتراضات المفتوحة بلا حدود زمانية.

- **TASK-MG-057: إسناد التظلم لمراجع مستقل لم يشارك في التقييم الأول**
  - **Epic**: Finalization & Appeals | **Priority**: P1
  - **Target Roles**: `system`
  - **Acceptance Criteria**: تحويل الاعتراض تلقائياً لمصحح أو مراجع جديد ومنع إسناده للمصحح الأصلي.
  - **Security Control**: ضمان الاستقلالية والحياد في إعادة الفحص.

- **TASK-MG-058: البت في الاعتراض (تأكيد الدرجة أو تعديلها مع كتابة الرد)**
  - **Epic**: Finalization & Appeals | **Priority**: P1
  - **Target Roles**: `senior grader`, `reviewer`
  - **Acceptance Criteria**: إصدار قرار قبولي أو رفضي مع إدراج الترد الرسمي وتسجيل التعديل إن وجد.
  - **Security Control**: توثيق قرارات التظلم في سجل Append-Only.

- **TASK-MG-059: تتبع حالات الاعتراضات في لوحة الطالب**
  - **Epic**: Finalization & Appeals | **Priority**: P2
  - **Target Roles**: `student`
  - **Acceptance Criteria**: إظهار حالة التظلم (قيد المراجعة، تم القبول والتعديل، تم تأكيد الدرجة السابقة).
  - **Security Control**: الشفافية وتحديث حالة الاعتراض.

- **TASK-MG-060: تقرير التظلمات والاعتراضات السنوي للمؤسسة**
  - **Epic**: Finalization & Appeals | **Priority**: P2
  - **Target Roles**: `grading manager`
  - **Acceptance Criteria**: استخراج نسبة التظلمات المقبولة وتوزيعها حسب الأسئلة والمواد الدراسية.
  - **Security Control**: تحليل الأخطاء ومراجعة بنك الأسئلة.

---

### Epic 7: Student Experience, Delayed Notifications & Reveal Timers (تجربة الطالب والإشعارات)

- **TASK-MG-061: حظر الإشعارات الفردية وتأجيلها لحين اعتماد الدفعة**
  - **Epic**: Student Experience | **Priority**: P0
  - **Target Roles**: `system`
  - **Acceptance Criteria**: كتم جميع الإشعارات الموجهة للطالب عند تصحيح سؤال منفرد وعدم تفعيلها إلا عند الاعتماد النهائي للدفعة كاملة.
  - **Security Control**: منع التسريب والتشتيت (Threat 13).

- **TASK-MG-062: آلية الاعتماد والإفراج الجماعي للدفعة (Batch Release Trigger)**
  - **Epic**: Student Experience | **Priority**: P0
  - **Target Roles**: `grading manager`
  - **Acceptance Criteria**: اعتماد نشر كافة نتائج الدفعة بنقرة واحدة وتوليد الأحداث الموجهة لنظام الإشعارات.
  - **Security Control**: ضمان تزامن نشر النتائج لكافة الطلاب.

- **TASK-MG-063: إدارة توقيت كشف الإجابة النموذجية (Answer Reveal Timer)**
  - **Epic**: Student Experience | **Priority**: P0
  - **Target Roles**: `system`
  - **Acceptance Criteria**: منع إظهار الإجابة النموذجية للطالب حتى انقضاء الموعد الرسمي لإغلاق التقييم والدفعة.
  - **Security Control**: حظر الوصول المسبق للإجابة الصحيحة (Threat 7).

- **TASK-MG-064: واجهة عرض تفاصيل الدرجة وملاحظات المصحح للطالب**
  - **Epic**: Student Experience | **Priority**: P1
  - **Target Roles**: `student`
  - **Acceptance Criteria**: بطاقة تفاعلية تعرض الدرجة، تفكيك بنود Rubric، والملاحظات التوجيهية المكتوبة.
  - **Security Control**: عرض البيانات المعتمدة النهائية فقط.

- **TASK-MG-065: مقارنة إجابة الطالب بالإجابة النموذجية عند كشفها**
  - **Epic**: Student Experience | **Priority**: P2
  - **Target Roles**: `student`
  - **Acceptance Criteria**: عرض شاشة مقارنة ثنائية تبرز الفروق بين ما كتبه الطالب والحل المعتمد.
  - **Security Control**: قراءة الإجابة النموذجية المعتمدة فقط.

- **TASK-MG-066: إرسال إشعارات البريد والتطبيق عند الإفراج النهائي عن النتائج**
  - **Epic**: Student Experience | **Priority**: P2
  - **Target Roles**: `system`
  - **Acceptance Criteria**: إرسال تنبيهات Push ومراسلات بريدية للطالب تبشره بصدور النتيجة النهائية.
  - **Security Control**: التأكد من حالة `FINALIZED` قبل الإرسال.

- **TASK-MG-067: عرض حالة "قيد التصحيح اليدوي" في شاشة نتائج الطالب**
  - **Epic**: Student Experience | **Priority**: P1
  - **Target Roles**: `student`
  - **Acceptance Criteria**: إظهار الوسم "النتيجة المقالية قيد المراجعة والتصحيح" عند تصفح الطالب للاختبار قبل الاعتماد.
  - **Security Control**: منع إظهار درجات جزئية غير معتمدة.

- **TASK-MG-068: دعم طباعة واستخراج تقرير التقييم المقالي للطالب (PDF Summary)**
  - **Epic**: Student Experience | **Priority**: P2
  - **Target Roles**: `student`
  - **Acceptance Criteria**: إمكانية تحميل تقرير رسمي بالدرجات والملاحظات بعد الاعتماد النهائي.
  - **Security Control**: ترويسة التقرير برقم تسلسلي لمنع التزوير.

---

### Epic 8: Mobile-First UX, Arabic RTL Systems, Audit Trail & Security Compliance (الواجهة والتدقيق)

- **TASK-MG-069: تطبيق تصميم الواجهة العربية الشاملة اتجاه من اليمين لليسار (RTL)**
  - **Epic**: Mobile UX & Audit | **Priority**: P0
  - **Target Roles**: جميع الأدوار
  - **Acceptance Criteria**: بناء كافة مكونات الواجهة باتجاه RTL صحيح ومتوافق مع المعايير العربية الفصيحة.
  - **Security Control**: خلو الواجهة من أخطاء الاتجاه.

- **TASK-MG-070: دعم النص ثنائي الاتجاه (BiDi Engine) للأكواد والمعادلات**
  - **Epic**: Mobile UX & Audit | **Priority**: P1
  - **Target Roles**: `grader`, `student`
  - **Acceptance Criteria**: محاذاة النص العربي لليمين مع المحافظة على تنسيق LTR للأكواد البرمجية والمعادلات.
  - **Security Control**: منع تشوه الأكواد والمعادلات أثناء التصحيح.

- **TASK-MG-071: بناء التنسيق المتكيف للموبايل والأجهزة المحمولة (Mobile-First Layout)**
  - **Epic**: Mobile UX & Audit | **Priority**: P0
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: تصميم شاشات التصحيح لتتلاءم مع الهواتف والتابلت باستخدام أدراج سفلية وأزرار لمس كبيرة (>= 48px).
  - **Security Control**: سهولة الاستخدام ومنع أخطاء الإدخال اللمسي.

- **TASK-MG-072: بناء ممتدح سجل التدقيق غير القابل للتعديل (Audit Trail Inspector UI)**
  - **Epic**: Mobile UX & Audit | **Priority**: P1
  - **Target Roles**: `grading manager`, `admin emergency operator`
  - **Acceptance Criteria**: واجهة تتيح للمشغل والمدير تتبع التسلسل الزمني الكامل لجميع العمليات على إجابة معينة.
  - **Security Control**: قراءة السجل من `question_response_reviews` المباشر.

- **TASK-MG-073: إنفاذ حظر التخزين المحلي للدرجات والبيانات الحساسة**
  - **Epic**: Mobile UX & Audit | **Priority**: P0
  - **Target Roles**: `system`
  - **Acceptance Criteria**: حظر حفظ الدرجات والمسودات في `localStorage` أو `IndexedDB` واشتراط التزامن الشبكي المباشر.
  - **Security Control**: منع التلاعب بالبيانات الحساسة محلياً (Offline Security Limit).

- **TASK-MG-074: إشارات تجميد الإدخال عند انقطاع اتصال الشبكة**
  - **Epic**: Mobile UX & Audit | **Priority**: P1
  - **Target Roles**: `grader`
  - **Acceptance Criteria**: تجميد أزرار التسليم وتنبيه المصحح فور انقطاع الشبكة لمنع فقدان البيانات أو إرسال طلبات ناقصة.
  - **Security Control**: حماية سلامة العمليات الشبكية.

- **TASK-MG-075: بناء لوحة متابعة أداء وحالة النظام للطوارئ (System Health & Emergency Monitor)**
  - **Epic**: Mobile UX & Audit | **Priority**: P2
  - **Target Roles**: `admin emergency operator`
  - **Acceptance Criteria**: مراقبة معدلات الأخطاء، المحاولات المرفوضة، وحوادث كبح التكرار للتدخل السريع.
  - **Security Control**: الحماية الاستباقية للبيئة التشغيلية.

---
*نهاية الوثيقة MANUAL-GRADING-IMPLEMENTATION-BACKLOG-01*
