# دليل التشغيل والتنفيذ التشغيلي - عقد E2E المستقل لمسار المحتوى التفاعلي HTML
**المعرف:** `CONTENT_ONBOARDING_HTML_E2E_CONTRACT_04`
**المستودع:** `msorori-mh/tas-heel-8e64d405`
**الفرع:** `test/content-onboarding-html-e2e-contract-04`
**التاريخ:** 2026-08-05

---

> **ملاحظة إثبات القبول المستقبلي (Future Contract Truth):**
> هذه المصفوفة عقد قبول مستقبلي، وليست إثباتاً أن Backend مطبقة.
> يحمل كل عنصر في عقد الاختبار القيم التالية بشكل صريح:
> `implementation_status: "future_contract"`
> `requires_operational_backend: true`

---

## 1. المقدمة والهدف (Introduction & Objectives)

يهدف هذا المستند إلى توثيق **عقد الاختبارات التشغيلية الشاملة (E2E Operational Contract)** المخصص لمسار إدخال ومعالجة المحتوى التفاعلي بصيغة HTML (الخرائط الذهنية والتجارب العملية التفاعلية).

يضمن العقد التحقق التشغيلي من دورة حياة المحتوى كاملة، مع فرض قواعد أمنية صارمة، وإدارة الصلاحيات (RBAC)، وعزل بيئة التشغيل، وحفظ أدلة التدقيق والحفاظ على سلامة النظام دون الحاجة إلى تشغيل خادم خلفي غير موجود أو إحداث أي تغييرات في قاعدة البيانات أو الكود المصدري للتطبيق.

---

## 2. القيود الصارمة (Strict Constraints)

يخضع هذا العقد للقيود التالية الممنوع التعدي عليها:

- **ممنوع تعديل `src/`**: عدم المساس بأي من ملفات الكود المصدري للتطبيق.
- **ممنوع تعديل `migrations`**: عدم إضافة أو تعديل أي ملفات تهجير.
- **ممنوع التعامل المباشر مع قاعدة البيانات (Database / SQL)**: لا يتم تنفيذ استعلامات SQL أو الاتصال بقواعد البيانات الحية (ZERO database mutations).
- **ممنوع النشر (Deploy)**: لا يوجد أي إجراء نشر في البيئات الانتاجية.
- **ممنوع الدمج (Merge)**: تبقى جميع التعديلات محصورة داخل الفرع الحالي `test/content-onboarding-html-e2e-contract-04`.
- **ممنوع فتح PR جديد (No New PR)**: يمنع إنشاء طلب سحب Pull Request جديد.

---

## 3. الأنواع والحالات والأدوار المعيارية (Canonical Enums & Roles)

### 3.1 أنواع الموارد المعتمدة (Canonical Resource Types):
- `mind_map_html` (خريطة ذهنية تفاعلية)
- `practical_experiment_html` (تجربة عملية تفاعلية)
- `summary_html` (ملخص تفاعلي)
- `image` (صورة ثابتة/تفاعلية)
- `pdf` (ملف مستند PDF)
- `video` (مورد فيديو)
- `external_link` (رابط خارجي معزول)

*(تم حذف أو تحويل: HTML_INTERACTIVE, HTML_MINDMAP, HTML_EXPERIMENT)*

### 3.2 حالات دورة الحياة المعتمدة (Canonical Lifecycle States):
- `draft` (مسودة)
- `in_review` (تحت المراجعة)
- `approved` (معتمد)
- `published` (منشور)
- `rejected` (مرفوض)
- `archived` (مؤرشف)

*(تم حذف أو تحويل: DRAFT_VERIFIED, UNPUBLISHED, SUPERSEDED_ROLLED_BACK)*

### 3.3 الأدوار التشغيلية لـ MVP (Canonical Operational Roles):
- `admin`: يعتمد ويرفض وينشر ويلغي النشر ويلغي التفعيل ويلغي الاعتماد.
- `content_manager`: يرفع الملفات ويقدم للمراجعة، ولا يعتمد ولا ينشر.
- `student`: يقرأ فقط المحتوى المنشور `published` المخصص لدروسه المصرح بها (`can_access_lesson = true`).
- `system`: مسؤول عن الفحص الآلي، التوقيع الرقمي، والتنظيف (Cleanup).
- `unauthenticated`: محظور من جميع واجهات الإدارة والموارد الخاصة غير المنشورة.

*(تم حذف الأدوار المستقلة reviewer و publisher وإسناد مهام الاعتماد والنشر لدور admin)*

---

## 4. مخطط التنظيف المباشر القابل للتنفيذ (Executable Cleanup Schema)

تم استبدال النصوص العامة غير القابلة للقياس بمخطط صريح:
- `cleanup_required`: قيمة بولية (`true` / `false`).
- `cleanup_steps`: مصفوفة من الخطوات المحددة القابلة للقياس.

عند عدم الحاجة لتنظيف:
```json
"cleanup_required": false,
"cleanup_steps": []
```

عند الحاجة للتنظيف، تتكون الخطوات من عمليات محددة مثل:
- `delete test import batch by batch_code`
- `remove staging prefix owned by batch`
- `restore previous published_version_id`
- `revoke generated signed URLs`
- `verify zero orphan objects`
- `preserve audit evidence`

---

## 5. مصفوفة حالات الاختبار E2E (Test Cases Matrix Summary)

تضم المصفوفة المعرفة في `docs/CONTENT-ONBOARDING-HTML-E2E-MATRIX-04.json` **38 حالة اختبار تشغيلية شمولية** مغطاة كالآتي:

| ID | Category | Actor | Resource Type | Lifecycle State | Expected Result Summary | Security Invariant |
|---|---|---|---|---|---|---|
| `HTML_E2E_001` | packaging | content_manager | mind_map_html | draft | Upload valid package accepted (201) | `SEC-PKG-01` |
| `HTML_E2E_002` | packaging | content_manager | practical_experiment_html | draft | Experiment simulation ingested (201) | `SEC-PKG-02` |
| `HTML_E2E_003` | security | content_manager | mind_map_html | draft | Unsafe ZIP (path traversal / Zip bomb) rejected (400) | `SEC-ZIP-01` |
| `HTML_E2E_004` | security | content_manager | mind_map_html | draft | Symlinks and directory traversal header rejected (400) | `SEC-FS-01` |
| `HTML_E2E_005` | security | content_manager | mind_map_html | draft | External JS / CDN links rejected (400) | `SEC-JS-01` |
| `HTML_E2E_006` | security | content_manager | mind_map_html | draft | Invalid CSP inline script hash rejected (400) | `SEC-CSP-01` |
| `HTML_E2E_007` | security | content_manager | practical_experiment_html | draft | Answer key bundle content rejected (400) | `SEC-ANS-01` |
| `HTML_E2E_008` | security | content_manager | mind_map_html | draft | questions.correct_index leakage rejected | `SEC-KEY-01` |
| `HTML_E2E_009` | security | content_manager | practical_experiment_html | draft | Explanation hidden prior to explicit reveal | `SEC-EXP-01` |
| `HTML_E2E_010` | security | content_manager | mind_map_html | draft | Student PII in package rejected | `SEC-PII-01` |
| `HTML_E2E_011` | authorization | unauthenticated | mind_map_html | draft | Unauthenticated admin request denied (401/403) | `SEC-AUTH-01` |
| `HTML_E2E_012` | authorization | unauthenticated | mind_map_html | draft | Unauthenticated draft resource request denied | `SEC-AUTH-02` |
| `HTML_E2E_013` | authorization | student | mind_map_html | draft | Student admin route request denied (403) | `SEC-RBAC-01` |
| `HTML_E2E_014` | authorization | student | mind_map_html | draft | Non-published states hidden from student | `SEC-VIS-01` |
| `HTML_E2E_015` | authorization | student | mind_map_html | published | Student requesting resource for wrong lesson denied | `SEC-LESSON-01` |
| `HTML_E2E_016` | authorization | student | mind_map_html | published | Student with can_access_lesson=false denied | `SEC-LESSON-02` |
| `HTML_E2E_017` | authorization | content_manager | mind_map_html | draft | content_manager publish attempt denied (403) | `SEC-RBAC-02` |
| `HTML_E2E_018` | authorization | student | mind_map_html | draft | Direct SQL table write denied by RLS | `SEC-DB-01` |
| `HTML_E2E_019` | authorization | content_manager | mind_map_html | published | Direct published bucket write denied | `SEC-STRG-01` |
| `HTML_E2E_020` | authorization | unauthenticated | mind_map_html | draft | Unpublished signed URL request denied | `SEC-SURL-01` |
| `HTML_E2E_021` | workflow | content_manager | mind_map_html | draft | Transition draft -> in_review | `SEC-WF-01` |
| `HTML_E2E_022` | workflow | admin | mind_map_html | in_review | Transition in_review -> approved | `SEC-WF-02` |
| `HTML_E2E_023` | workflow | admin | mind_map_html | in_review | Transition in_review -> rejected | `SEC-WF-03` |
| `HTML_E2E_024` | workflow | content_manager | mind_map_html | rejected | Transition rejected -> draft | `SEC-WF-04` |
| `HTML_E2E_025` | workflow | admin | mind_map_html | approved | Transition approved -> published | `SEC-WF-05` |
| `HTML_E2E_026` | workflow | admin | mind_map_html | published | Transition published -> approved via unpublish | `SEC-WF-06` |
| `HTML_E2E_027` | workflow | admin | mind_map_html | draft | Publish unapproved version denied | `SEC-WF-07` |
| `HTML_E2E_028` | versioning | admin | mind_map_html | published | Rollback to previous approved version | `SEC-VER-01` |
| `HTML_E2E_029` | workflow | admin | mind_map_html | approved | Concurrent publish conflict detected (409) | `SEC-LOCK-01` |
| `HTML_E2E_030` | workflow | admin | mind_map_html | approved | Stale lock_version publish request denied (409) | `SEC-LOCK-02` |
| `HTML_E2E_031` | resilience | content_manager | mind_map_html | draft | Duplicate idempotency key header returns cached result | `SEC-IDEMP-01` |
| `HTML_E2E_032` | resilience | content_manager | practical_experiment_html | draft | Partial upload stream drop cleaned up atomically | `SEC-RES-01` |
| `HTML_E2E_033` | tamper_protection | system | mind_map_html | draft | Hash mismatch blocks package publication | `SEC-TMP-01` |
| `HTML_E2E_034` | tamper_protection | student | practical_experiment_html | published | Forged experiment completion postMessage denied | `SEC-TMP-02` |
| `HTML_E2E_035` | tamper_protection | student | practical_experiment_html | published | Stale iframe postMessage event denied | `SEC-TMP-03` |
| `HTML_E2E_036` | runtime_isolation | system | mind_map_html | published | Native mobile runtime launch disabled | `SEC-ISO-01` |
| `HTML_E2E_037` | audit_cleanup | system | mind_map_html | archived | Orphan object reconciliation sweeper | `SEC-CLN-01` |
| `HTML_E2E_038` | visibility | student | mind_map_html | published | Published item accessible to authorized student | `SEC-VIS-02` |

---

## 6. أوامر التنفيذ والتحقق التشغيلي (Execution Commands)

يتم التحقق من سلامة العقد والتأكد من مطابقة جميع الشروط بواسطة الأوامر التالية:

### 1. تثبيت الاعتمادات:
```bash
npm ci
```

### 2. تشغيل اختبار العقد المستقل:
```bash
node --test tests/question-bank/content-onboarding-html-e2e-contract.test.mjs
```

### 3. تشغيل حزمة اختبارات المشروع الكاملة:
```bash
npm test
```

### 4. التحقق من سلامة الأنواع (TypeScript):
```bash
npx --no-install tsc --noEmit
```

### 5. التحقق من عدم وجود مشاكل في الفروقات أو المسافات الزائدة:
```bash
git diff --check
```

---

## 7. التزام الرفع وحفظ الفرع (Commit & Push Instructions)

عند نجاح كافة الفحوصات يتم حفظ التغييرات واستخدام رسالة التزديد المحددة:

```bash
git add docs/CONTENT-ONBOARDING-HTML-E2E-MATRIX-04.json docs/CONTENT-ONBOARDING-HTML-E2E-RUNBOOK-AR-04.md tests/question-bank/content-onboarding-html-e2e-contract.test.mjs
git commit -m "test(content): align html e2e contract with operational security model"
git push origin test/content-onboarding-html-e2e-contract-04
```

> **تنبيه:** يمنع دمج الفرع أو إنشاء PR جديد وفق الشروط المحددة.
