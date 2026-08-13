# QUESTION_IMPORT_QB_BINDING_08 — ربط استيراد الأسئلة ببنك الأسئلة الخطة صحيحة كاتجاه، لكن قبل تنفيذها أريد **5 تعديلات حاسمة**؛ اثنان منها مهمان جداً لمنع أخطاء فعلية في الهوية والذرّية.

```text
QUESTION_IMPORT_QB_BINDING_08
= GO_WITH_REQUIRED_HARDENING

```

### 1. `qb_import_ingest_revision` لا تستقبل Payload من المستدعي

بدلاً من:

```text
job_id + question_code + text + options + answer + hash...

```

الأكثر أماناً أن تستقبل فقط:

```text
staging_row_id

```

ثم تقرأ بنفسها داخل المعاملة:

```text
import_staging_rows
→ job
→ template_key
→ payload
→ row_hash
→ natural_key

```

وتتحقق من أن:

```text
template_key = questions
job.status = applying
staging row belongs to this job

```

هذا يمنع أي Wrapper أو تعديل مستقبلي من تمرير Payload مختلف عن الذي تم Validate/Stage له.

---

### 2. افصل **بصمة محتوى السؤال** عن **وجهته**

هذه أهم نقطة في الخطة.

السؤال الواحد يمكن أن يكون بنفس `question_code` ونفس النص والإجابة، لكن يُربط بدرس/وحدة/تقييم إضافي عبر `question_targets`.

لذلك لا يجوز أن يكون:

```text
same payload_hash
→ SKIPPED everything

```

إذا كانت الوجهة الجديدة مختلفة.

نعتمد قرارين مستقلين:

```text
QUESTION_CONTENT:
same active payload_hash
→ NO NEW REVISION

QUESTION_TARGET:
existing target
→ TARGET_SKIPPED

new valid target
→ TARGET_ADDED

```

مثال:

```text
Q-MATH-001
نفس السؤال تماماً
كان مرتبطاً بالدرس 1
ثم أُعيد استيراده للدرس 2

```

الصحيح:

```text
revision = SKIPPED
target lesson 2 = INSERTED

```

وليس تجاهل الصف بالكامل.

ويجب أن تكون هوية `question_targets` وفهرسها الفريد جزءاً من العقد.

---

### 3. `payload_hash` القانوني يُعاد احتسابه داخل DB

لا نثق فقط في:

```text
content_fingerprint
row_hash

```

القادم من TypeScript.

داخل `qb_import_ingest_revision`:

```text
recompute staging row_hash
→ verify

normalize/build revision
→ compute canonical QB payload_hash
   using the SAME canonical QB-01 database logic
→ use that hash for revision identity

```

أي:

```text
row_hash
= integrity of staged import row

payload_hash
= identity of QB revision content

```

وهما ليسا الشيء نفسه.

---

### 4. حماية الذرّية من `EXCEPTION` الجزئي

بما أن:

```text
import_execute_template
→ loops rows
→ qb_import_ingest_revision

```

يجب منع هذا النمط:

```text
row 1 committed logically
row 2 fails
EXCEPTION caught per row
row 3 continues

```

المطلوب:

```text
one template RPC
→ one transaction
→ any row raises
→ whole template rolls back

```

إذا استُخدم `EXCEPTION` لتسجيل الخطأ، يجب أن يكون على مستوى العملية بحيث لا يؤدي إلى ابتلاع الخطأ واستمرار بقية الصفوف.

أضف اختباراً يثبت:

```text
row 1 valid
row 2 invalid
row 3 valid

after execution:
question writes = 0
revision writes = 0
child writes = 0
target writes = 0

```

---

### 5. قفل `question_code`

الفكرة صحيحة، لكن أفضل:

```sql
pg_advisory_xact_lock(...)

```

بمفتاح 64-bit حتمي وليس الاعتماد على `hashtext()` وحده إن أمكن.

التصادم في advisory lock لا يفسد البيانات، لكنه يسبب serialization غير ضروري بين سؤالين مختلفين.

والأهم:

```text
advisory lock
→ lookup question by globally unique code
→ SELECT ... FOR UPDATE if exists
→ decide revision

```

ولا يوجد أي check-then-insert خارج القفل.

---

## State rules المعتمدة

أضبط الجدول إلى:


| الحالة                                    | القرار                                            |
| ----------------------------------------- | ------------------------------------------------- |
| سؤال جديد                                 | `INSERTED` + Draft Revision                       |
| نفس محتوى Active Revision + نفس Target    | `SKIPPED`                                         |
| نفس المحتوى + Target جديد                 | `TARGET_ADDED` بدون Revision جديدة                |
| محتوى مختلف ولا Published                 | `NEW_REVISION`                                    |
| محتوى مختلف ويوجد Published               | `PUBLISHED_PRESERVED_NEW_REVISION`                |
| تطابق فقط مع `SUPERSEDED/REJECTED` تاريخي | Draft جديدة، لا Skip تلقائي                       |
| Hash mismatch                             | Fail closed + rollback                            |
| لا QB capability                          | `QUESTION_BANK_CAPABILITY_REQUIRED` + zero writes |


وأفضل ألا تستخدم:

```text
BLOCKED_PUBLISHED_NEW_REVISION

```

لأن السؤال المنشور لم يُحجب ولم يُستبدل؛ الأفضل:

```text
PUBLISHED_PRESERVED_NEW_REVISION

```

---

## أمان الدالة الداخلية

اعتمد:

```text
qb_import_ingest_revision
SECURITY DEFINER
SET search_path = public, pg_temp

REVOKE EXECUTE FROM PUBLIC
REVOKE EXECUTE FROM anon
REVOKE EXECUTE FROM authenticated
GRANT EXECUTE TO service_role

```

مع بقاء:

```text
import_execute_template

```

هو المدخل التشغيلي المصرح، ويعيد فحص صلاحية المستخدم الأصلية.

ولا يوجد في `qb_import_ingest_revision` أي Publish.

---

## الاختبارات النهائية التي أريدها

بالإضافة لما ذكرت:

```text
same question + new target
→ zero new revisions + target added

same question + existing target
→ zero writes

historical rejected hash replay
→ new draft, not silent skip

staging payload tampering
→ HASH_MISMATCH + full rollback

two jobs / same question_code concurrently
→ one consistent question root
→ deterministic revisions
→ no duplicate revision numbers

mid-batch failure
→ zero question/revision/children/target writes

```

ثم كامل الحراسة:

```text
Template 09 E2E                 PASS
Exact replay                    PASS
Target reuse                    PASS
Concurrency                     PASS
Atomic rollback                 PASS
Published revision preservation PASS
QB capability enforcement       PASS
Draft visibility                ZERO
Answer leakage                  ZERO
Generic questions write         ZERO
01–08 regression                32/32 PASS
QB security regression          PASS

```

إذا نجح ذلك، فهذه المرة نستطيع اعتماد:

```text
QUESTION_IMPORT_QB_BINDING_08 = PASS

CONTENT_IMPORT_01_08 = READY
QUESTION_IMPORT_09 = READY

CONTENT_AND_QUESTION_IMPORT_NON_PROD_READY = YES

```

وهنا نكون قد أغلقنا فعلياً **منظومة استيراد المحتوى والأسئلة كاملة على Non-Prod**، وننتقل بعدها إلى E2E موحد 01–09 ثم جاهزية رفع المحتوى الفعلي.(Non-Prod)

الهدف: إغلاق القالب 09 (Questions) بربطه بمسار بنك الأسئلة المعتمد، بحيث ينتهي الاستيراد عند **Draft Revision** فقط — بدون نشر، وبدون أي كتابة عامة على جدول الأسئلة، وبدون أي تسريب للإجابات.

## 1. دالة الإدخال الداخلية `qb_import_ingest_revision`

ترحيل جديد ينشئ دالة `SECURITY DEFINER` غير قابلة للاستدعاء من العميل:

- `REVOKE EXECUTE ... FROM anon, authenticated` ومنح `service_role` فقط؛ لا تُستدعى إلا من داخل `import_execute_template`.
- المدخلات: معرّف المهمة + صف staging واحد (question_code، النص، الخيارات، الإجابة الصحيحة، الشرح، الوجهة، الهاش).
- الخطوات داخل نفس المعاملة:
  1. **إعادة التحقق من البصمة** (`row_hash`) مقابل الحمولة المخزّنة — عدم التطابق ⇒ `HASH_MISMATCH` وإسقاط المعاملة.
  2. **قفل التزامن على `question_code**` عبر `pg_advisory_xact_lock(hashtext(question_code))` ثم `SELECT ... FOR UPDATE` على السؤال إن وُجد.
  3. إنشاء/جلب سجل السؤال الجذري (بدون أعمدة إجابات حساسة في المسار العام).
  4. إنشاء `question_revisions` بحالة `draft` + الأبناء (`question_options`, `question_accepted_answers`, `question_solutions`) عبر نفس مسار QB-01 مع احتساب `payload_hash` القانوني.
  5. تسجيل الوجهة في `question_targets`.

## 2. قواعد الحالة (State rules)


| الحالة                                                | النتيجة                                                                  |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `payload_hash` مطابق لأحدث Revision (منشورة أو مسودة) | `SKIPPED` — لا كتابة (Exact replay idempotent)                           |
| سؤال منشور والمحتوى تغيّر                             | تبقى النسخة المنشورة كما هي + إنشاء **Draft Revision جديدة** ⇒ `updated` |
| سؤال جديد                                             | إنشاء سؤال + Draft Revision ⇒ `inserted`                                 |
| خطأ في أي صف                                          | Rollback كامل للقالب — صفر كتابات نطاق                                   |


لا نشر إطلاقاً من مسار الاستيراد: النشر يبقى حصراً عبر `publish_question_revision` بعد المراجعة.

## 3. ربط القالب 09 بمسار Validate → Stage → Draft

- `import_execute_template`: بدل رفع `QUESTION_BANK_WORKFLOW_REQUIRED` للقالب 09، تُحوَّل صفوفه إلى حلقة تستدعي `qb_import_ingest_revision` لكل صف، وتُرجع نفس شكل النتيجة (`inserted/updated/skipped/blocked_published`).
- في الكود: تعديل `import-execution-state.ts` و`import-staging.server.ts` بحيث يصبح القالب 09 مسموحاً بالتنفيذ عبر مساره الخاص فقط (يبقى `assertGenericUpsertAllowed` مانعاً لأي upsert عام)، وتحديث `import-contract.ts` / `import-execute-messages.ts` برسائل عربية جديدة (بصمة غير مطابقة، تعارض تزامن، مسودة أُنشئت بانتظار المراجعة).
- واجهة `ContentImportDryRunPanel` / `admin.import.tsx`: إظهار القالب 09 كمسار "مسودة بانتظار المراجعة" بدل "مرفوض".

## 4. الأمان ومنع التسريب

- لا تغيير على صلاحيات الطالب: `question_revisions`، `question_options.is_correct`، `question_accepted_answers`، `question_solutions` تبقى محجوبة عن `authenticated` غير المخوّل.
- اختبار انحدار أمني يؤكد أن الطالب لا يرى مسودات ولا إجابات صحيحة عبر أي مسار (RPC، Data API، snapshot).

## 5. الاختبارات وبوابة الخروج

توسيع `tests/e2e/content-import/run-content-import-e2e-07.ts` بمشغّل جديد للمرحلة 08 + fixtures للقالب 09 في `scripts/content-import/generate-e2e-fixtures.mjs`:

- Template 09 E2E (إدخال، مسودة، حالة المهمة)
- Exact replay ⇒ SKIPPED
- Concurrency على نفس `question_code` (جلستان متوازيتان)
- Atomic rollback عند صف فاسد ⇒ صفر كتابات
- سؤال منشور يبقى منشوراً + مسودة جديدة
- تسريب إجابات للطالب = صفر
- إعادة تشغيل انحدار كامل 01–08 (32/32)

النتيجة عند نجاح الكل: `CONTENT_AND_QUESTION_IMPORT_NON_PROD_READY`. البيئة: Non-Prod فقط، Production خارج النطاق.