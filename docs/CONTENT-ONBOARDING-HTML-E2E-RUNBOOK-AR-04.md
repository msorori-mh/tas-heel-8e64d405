# دليل التشغيل والتنفيذ التشغيلي - عقد E2E المستقل لمسار المحتوى التفاعلي HTML
**المعرف:** `CONTENT_ONBOARDING_HTML_E2E_CONTRACT_04`  
**المستودع:** `msorori-mh/tas-heel-8e64d405`  
**الفرع:** `test/content-onboarding-html-e2e-contract-04`  
**التاريخ:** 2026-08-05  

---

## 1. المقدمة والهدف (Introduction & Objectives)

يهدف هذا المستند إلى توثيق **عقد الاختبارات التشغيلية الشاملة (E2E Operational Contract)** المخصص لمسار إدخال ومعالجة المحتوى التفاعلي بصيغة HTML (الخرائط الذهنية والتجارب العملية التفاعلية).

يضمن العقد التحقق التشغيلي من دورة حياة المحتوى كاملة، مع فرض قواعد أمنية صارمة، وإدارة الصلاحيات (RBAC)، وعزل بيئة التشغيل، وحفظ أدلة التدقيق والحفاظ على سلامة النظام دون الحاجة إلى تشغيل خادم خلفي غير موجود أو إحداث أي تغييرات في قاعدة البيانات أو الكود المصدري للتطبيق.

---

## 2. القيود الصارمة (Strict Constraints)

يخضع هذا العقد للقيود التالية الممنوع التعدي عليها:

- **ممنوع تعديل `src/`**: عدم المساس بأي من ملفات الكود المصدري للتطبيق.
- **ممنوع تعديل `migrations`**: عدم إضافة أو تعديل أي ملفات تهجير.
- **ممنوع التعامل المباشر مع قاعدة البيانات (Database / SQL)**: لا يتم تنفيذ استعلامات SQL أو الاتصال بقواعد البيانات الحية.
- **ممنوع النشر (Deploy)**: لا يوجد أي إجراء نشر في البيئات الانتاجية.
- **ممنوع الدمج (Merge)**: تبقى جميع التعديلات محصورة داخل الفرع الحالي `test/content-onboarding-html-e2e-contract-04`.
- **ممنوع تنفيذ اختبارات وهمية (No Fake Backend Execution)**: يركز عقد الاختبار على التحقق الهيكلي والدستوري المستقل من مصفوفة E2E ودقة المحددات والضوابط بدون ادعاء تشغيل خوادم خلفية غير موجودة.

---

## 3. الهيكلية ودورة حياة المحتوى التفاعلي HTML

تمر الحزمة التفاعلية بصيغ الخرائط الذهنية (`HTML_MINDMAP`) والتجارب العملية (`HTML_EXPERIMENT`) بالمراحل التالية:

```
[رفع Excel + ZIP] ──> [التحقق الأمني والربط] ──> [مسودة DRAFT] ──> [مراجعة IN_REVIEW]
                                                                        │
[رفض وإلغاء Access] <── [مسودة معدلة] <── [رفض / طلب تعديل] <──────────┤
                                                                        │
                                                                 [اعتماد APPROVED]
                                                                        │
                                                                 [نشر PUBLISHED]
                                                                        │
                                                         [عرض sandboxed للطالب]
```

---

## 4. مصفوفة حالات الاختبار E2E (Test Cases Matrix Summary)

تضم المصفوفة المعرفة في `docs/CONTENT-ONBOARDING-HTML-E2E-MATRIX-04.json` **26 حالة اختبار تشغيلية شمولية** مغطاة كالآتي:

| المعرف ID | الفئة Category | الفاعل Actor | النتيجة المتوقعة Expected Result | الضابط الأمني Security Invariant |
|---|---|---|---|---|
| `HTML_E2E_001` | `packaging` | `content_manager` | رفع مقبول 201 وحفظ المسودة | `SEC-PKG-01`: فحص zip-slip و symlink و checksum قبل التخزين |
| `HTML_E2E_002` | `security` | `content_manager` | رفض ZIP غير آمنة 400 | `SEC-ZIP-01`: منع path traversal و zip bomb |
| `HTML_E2E_003` | `security` | `content_manager` | رفض JavaScript خارجية 400 | `SEC-JS-01`: منع النص البرمجي الخارجي والـ CDN |
| `HTML_E2E_004` | `security` | `content_manager` | رفض symlink و traversal 400 | `SEC-FS-01`: حظر الوصلات الرمزية والتنقل الشجري |
| `HTML_E2E_005` | `content_type` | `content_manager` | قبول خريطة ذهنية HTML سليمة | `SEC-CT-01`: التشغيل المكتفي ذاتياً بدون اتصالات خارجية |
| `HTML_E2E_006` | `content_type` | `content_manager` | قبول تجربة عملية HTML سليمة | `SEC-CT-02`: التفاعل عبر postMessage المعزول |
| `HTML_E2E_007` | `visibility` | `student` | حجب المسودة DRAFT عن الطالب | `SEC-VIS-01`: عدم ظهور حالات المسودة للطالب |
| `HTML_E2E_008` | `visibility` | `student` | حجب المحتوى تحت المراجعة IN_REVIEW | `SEC-VIS-02`: حصر المراجعة في الأدوار المصرّحة |
| `HTML_E2E_009` | `visibility` | `student` | حجب المحتوى المعتمد APPROVED قبل النشر | `SEC-VIS-03`: اشتراط إجراء النشر الصريح |
| `HTML_E2E_010` | `visibility` | `student` | ظهور المحتوى المنشور PUBLISHED للطالب | `SEC-VIS-04`: التقديم عبر رابط iframe معزول النطاق |
| `HTML_E2E_011` | `rbac` | `student` | منع الطالب من واجهات وأوامر الإدارة 403 | `SEC-RBAC-01`: حماية المسارات الإدارية |
| `HTML_E2E_012` | `rbac` | `content_manager` | رفع المحتوى ومنع النشر بدون صلاحية 403 | `SEC-RBAC-02`: الفصل بين مهام الرفع والنشر |
| `HTML_E2E_013` | `workflow` | `reviewer` | مراجعة المحتوى واكتساب حالة APPROVED | `SEC-WF-01`: اعتماد الانتقال بملاحظات مراجعة |
| `HTML_E2E_014` | `workflow` | `publisher` | نشر المحتوى واكتساب حالة PUBLISHED | `SEC-WF-02`: حصر النشر في المعتمدين فقط |
| `HTML_E2E_015` | `versioning` | `content_manager` | إنشاء إصدار جديد دون استبدال المنشور | `SEC-VER-01`: عدم المساس بالإصدار المنشور بصمت |
| `HTML_E2E_016` | `workflow` | `publisher` | إلغاء النشر Unpublish وحجب الوصول فوراً | `SEC-WF-03`: الإلغاء الفوري وإخلاء التخزين المؤقت |
| `HTML_E2E_017` | `versioning` | `publisher` | التراجع Rollback للإصدار السابق | `SEC-VER-02`: التراجع الذري المحقق بالبصمة الرقمية |
| `HTML_E2E_018` | `tamper_protection` | `system` | رفض الحزمة عند عدم تطابق الـ Hash | `SEC-TMP-01`: التحقق الرقمي من سلامة الحزم |
| `HTML_E2E_019` | `tamper_protection` | `student` | رفض أحداث التكتيل والمكملات المزورة | `SEC-TMP-02`: اشتراط التوقيع الرقمي للأحداث |
| `HTML_E2E_020` | `tamper_protection` | `content_manager` | كشف وحظر تسريب الإجابات الصحيحة | `SEC-TMP-03`: منع تضمين الإجابات الصريحة في JS |
| `HTML_E2E_021` | `resilience` | `system` | فحص الـ Hash في الوضع أوفلاين Offline | `SEC-RES-01`: مطابقة البصمة قبل التشغيل المحلي |
| `HTML_E2E_022` | `runtime_isolation` | `system` | تعطيل تشغيل الموبايل حتى إثبات العزل | `SEC-ISO-01`: فرض قيود WebView وشبكة الأمان |
| `HTML_E2E_023` | `resilience` | `content_manager` | التراجع الذري عند فشل الرفع الجزئي | `SEC-RES-02`: الذرية التامة وعدم ترك ملفات يتيملة |
| `HTML_E2E_024` | `resilience` | `content_manager` | إعادة المحاولة بالتكافؤ Idempotent retry | `SEC-RES-03`: منع التكرار باستخدام Idempotency Key |
| `HTML_E2E_025` | `audit_cleanup` | `system` | تسجيل أدلة التدقيق لجميع العمليات | `SEC-AUD-01`: سجلات تدقيق غير قابلة للتعديل |
| `HTML_E2E_026` | `audit_cleanup` | `system` | التجميع التلقائي والتنظيف للبيانات المؤقتة | `SEC-CLN-01`: إزالة سريعة للتخزين المؤقت بعد الانتهاء |

---

## 5. الأدوار والمحددات (Roles & Scopes)

1. **`content_manager` (مدير المحتوى)**:
   - يملك صلاحية رفع وتجهيز الملفات والتعديل على المسودات DRAFT.
   - لا يملك صلاحية الاعتماد أو النشر المباشر.

2. **`reviewer` (المراجع)**:
   - يملك صلاحية معاينة المحتوى في بيئة الاستعداد ومعاينته وتغيير الحالة إلى `APPROVED` أو طلب تعديل.

3. **`publisher` (الناشر)**:
   - يملك صلاحية نشر المحتوى المعتمد `APPROVED` إلى `PUBLISHED` أو إلغاء النشر `UNPUBLISHED` أو التراجع `ROLLBACK`.

4. **`student` (الطالب)**:
   - يملك فقط صلاحية قراءة المحتوى المنشور `PUBLISHED` في دروسه المحددة.
   - ممنوع من جميع واجهات الإدارة والمحتويات غير المنشورة.

5. **`system` (النظام)**:
   - مسؤول عن فحص سلامة الملفات والتوقيع الرقمي والـ Garbage Collection والتنظيف.

---

## 6. أوامر التنفيذ والتحقق التشغيلي (Execution Commands)

يتم التحقق من سلامة العقد والتأكد من مطابقة جميع الشروط بواسطة الأوامر التالية:

### 1. تشغيل اختبار العقد المستقل:
```bash
node --test tests/question-bank/content-onboarding-html-e2e-contract.test.mjs
```

### 2. تشغيل حزمة اختبارات المشروع الكاملة:
```bash
npm test
```

### 3. التحقق من سلامة الأنواع (TypeScript):
```bash
npx --no-install tsc --noEmit
```

### 4. التحقق من عدم وجود مشاكل في الفروقات أو المسافات الزائدة:
```bash
git diff --check
```

---

## 7. التزام الرفع وحفظ الفرع (Commit & Push Instructions)

عند نجاح كافة الفحوصات يتم حفظ التغييرات واستخدام رسالة التزديد المحددة:

```bash
git add docs/CONTENT-ONBOARDING-HTML-E2E-MATRIX-04.json docs/CONTENT-ONBOARDING-HTML-E2E-RUNBOOK-AR-04.md tests/question-bank/content-onboarding-html-e2e-contract.test.mjs
git commit -m "test(content): define interactive html operational e2e contract"
git push origin test/content-onboarding-html-e2e-contract-04
```

> **ملاحظة مهمة:** يمنع إنشاء طلب سحب Pull Request (PR) حالياً بحسب الشروط المحددة في المهمة.

---

## 8. التقرير النهائي (Final Report Format)

```text
CONTENT_ONBOARDING_HTML_E2E_CONTRACT_04

Decision:
PASS

Total cases:
26

Categories:
11 (packaging, security, content_type, visibility, rbac, workflow, versioning, tamper_protection, runtime_isolation, resilience, audit_cleanup)

Roles:
6 (content_manager, reviewer, publisher, student, system, unauthenticated)

Positive cases:
12

Negative cases:
14

Security cases:
26 (Every case specifies a strict security invariant)

Contract tests:
PASS

Working tree:
CLEAN

Source modified:
NO

SQL:
NO

Database:
ZERO

Deploy:
NO

PR created:
NO
```
