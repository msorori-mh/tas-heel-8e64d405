## QA-SEED-01 Plan Report

### 1. هل بيانات موجودة أم QA منفصلة؟
**هجين**: إعادة استخدام References الجاهزة (grade, curriculum_track, subscription_plan, payment_method) + إنشاء **مادة/وحدات/دروس/أسئلة/قوالب** اختبار **جديدة** ومعزولة موسومة بـ `QA_` لمنع أي تلوث للمحتوى الإنتاجي.

### 2. البريد المقترح للطالب الاختباري
`qa.student.tasheel@example.com` (يحدد المالك بريداً نهائياً عند التنفيذ).

### 3. الصف المستخدم
`الصف الثالث الثانوي` — `03780461-126a-4c63-bd1b-493098582dd9` (يحتوي مواد كثيرة وهو الأهم وظيفياً).

### 4. المادة المقترحة (جديدة QA)
- name: `QA_C02_SUBJECT — اختبار QA لا تستخدم`
- code: `QA_C02_SUBJECT`
- grade_id: الصف الثالث الثانوي
- curriculum_track_id: `cbbe62a4-...` (منهج صنعاء — لمطابقة الطالب الاختباري)

### 5. الوحدة المجانية المقترحة
- name: `QA_C02_FREE_UNIT — اختبار QA`
- code: `QA_C02_FREE_UNIT`
- `is_free = true`

### 6. الوحدة المدفوعة المقترحة
- name: `QA_C02_PAID_UNIT — اختبار QA`
- code: `QA_C02_PAID_UNIT`
- `is_free = false`

### 7. الدروس المقترحة
- `QA_C02_FREE_LESSON` داخل الوحدة المجانية (`is_free=true`)
- `QA_C02_PAID_LESSON` داخل الوحدة المدفوعة (`is_free=false`)

### 8. عدد الأسئلة المقترح
- 2 أسئلة للدرس المجاني (`QA_C02_FREE_Q1/Q2`)
- 2 أسئلة للدرس المدفوع (`QA_C02_PAID_Q1/Q2`)
المجموع 4. تُكتب عبر INSERT مباشر بصلاحية service_role؛ لن تُمنح أي صلاحيات SELECT جديدة على `questions` للأدوار العامة، وستبقى الحماية الحالية كما هي (REST 401).

### 9. قوالب الاختبار المقترحة
| Code | mode | scope | السلوك المتوقع لطالب بدون اشتراك |
|------|------|-------|----------------------------------|
| `QA_C02_FREE_TRAINING_TEMPLATE` | training | unit=FREE_UNIT, lesson=FREE_LESSON | **allowed** |
| `QA_C02_PAID_TRAINING_TEMPLATE` | training | unit=PAID_UNIT, lesson=PAID_LESSON | **subscription_required** |
| `QA_C02_STRICT_TEMPLATE` | strict | subject=QA_SUBJECT, unit=PAID_UNIT | **subscription_required** |
| `QA_C02_UNSCOPED_TEMPLATE` | training | بدون subject/unit/lesson | **template_scope_missing** |

كل قالب يربط بأسئلته عبر `exam_template_questions`.

### 10. خطة الاشتراك
إعادة استخدام `اشتراك شهري` الموجود (`9f062f29-...`, 3000 YER). لا حاجة لإنشاء plan جديدة.

### 11. طريقة اختبار C01
1. تسجيل دخول الطالب الاختباري على `/payments/new`.
2. اختيار plan الشهري + payment_method (`بنك الكريمي - الجنوبية`) + رفع إيصال وهمي.
3. التحقق DB: السجل الجديد في `payment_requests` يحمل `subscription_id IS NOT NULL` ومربوط بـ subscription pending للطالب نفسه.
4. دخول admin (`msorori201201@gmail.com`) والموافقة على الطلب الاختباري **فقط**.
5. التحقق: subscription يصبح `active` للطالب الاختباري وليس لأي مستخدم حقيقي.

### 12. طريقة اختبار C02
بنفس جلسة الطالب الاختباري:
- **قبل** تفعيل الاشتراك:
  - `start_exam_session(QA_C02_FREE_TRAINING_TEMPLATE)` → نجاح.
  - `start_exam_session(QA_C02_PAID_TRAINING_TEMPLATE)` → `subscription_required`.
  - `start_exam_session(QA_C02_STRICT_TEMPLATE)` → `subscription_required`.
  - `start_exam_session(QA_C02_UNSCOPED_TEMPLATE)` → `template_scope_missing`.
- **بعد** تفعيل الاشتراك (نتيجة C01):
  - PAID_TRAINING و STRICT → نجاح.
- اختبار سلبي إضافي: تغيير `grade` للطالب الاختباري لصف آخر مؤقتاً والتحقق من رفض `grade_mismatch` (اختياري؛ يتطلب تعديل profile الاختباري فقط).

### 13. تمييز بيانات QA
- بادئة `QA_C01_C02_` في كل عمود `code` (subjects/units/lessons/questions/exam_templates).
- اللصق `— اختبار QA - لا تستخدم` في كل حقل `name/title` عربي.
- `created_by` للطالب/الadmin الاختباريين فقط حيث ممكن.
- profile الطالب الاختباري بـ `full_name = 'QA Test Student — لا تستخدم'`.

### 14. Cleanup plan (بترتيب احترام FK)
```text
1. delete exam_session_answers where session_id in (sessions of QA templates)
2. delete exam_sessions where template_id in QA templates
3. delete exam_template_questions where template_id in QA templates
4. delete exam_templates where code like 'QA\_%'
5. delete questions where code like 'QA\_%'
6. delete payment_requests where user_id = qa_student
7. delete subscriptions where user_id = qa_student
8. delete wallet_transactions where account_id in (qa accounts)
9. delete wallet_accounts where user_id = qa_student
10. delete lessons where code like 'QA\_%'  (إن وُجد code، وإلا via unit_id)
11. delete units where code like 'QA\_%'
12. delete subjects where code = 'QA_C02_SUBJECT'
13. delete user_roles where user_id = qa_student (لا روابط admin)
14. delete from profiles where id = qa_student
15. auth admin: delete user qa_student
```
كل خطوة محصورة بـ `code LIKE 'QA\_%'` أو `user_id = :qa_student` لمنع أي حذف عرضي.

### 15. المخاطر المحتملة
- **خلط الطالب الاختباري بمستخدم حقيقي**: مُخفّف بعزل البريد + علامة الاسم.
- **قالب unscoped** قد يُسرّب أسئلة عبر RPC إن لم يرفض → يجب اختباره فوراً وحذفه إن أظهر سلوكاً غير متوقع.
- **payment_request اختباري يصل لتقارير admin الحقيقية**: مقبول لأنها بيئة QA؛ يُحذف ضمن Cleanup.
- **trigger sync_profile_curriculum_track**: قد يعيد ضبط `curriculum_track_id` للطالب الاختباري — يجب اختيار محافظة تطابق `cbbe62a4` (مثلاً صنعاء).
- لا توجد مخاطر RLS لأن لن نغير سياسات؛ فقط INSERT بالـ service_role وفق السكيمة الحالية.

### 16. هل تم إنشاء أو تعديل بيانات؟
**لا** — هذه خطة قراءة فقط. لم تُنفذ migrations ولم تُلمس صفوف.

### 17. القرار
**QA_SEED_PLAN_READY**

التنفيذ ينتظر موافقتك الصريحة لبدء مرحلة `QA-SEED-01 EXECUTE`.
