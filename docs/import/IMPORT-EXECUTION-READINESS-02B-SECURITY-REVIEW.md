# IMPORT_EXECUTION_READINESS_SECURITY_AND_SQL_REVIEW_02B — تقرير المراجعة المستقلة

الحالة: **مرحلة غير إنتاجية**. لا Migration مطبَّق، لا كتابة في قاعدة البيانات، لا Publish.
نطاق المراجعة: عقد اشتقاق `subjects.slug`، ومسودة `docs/migration-drafts/IMPORT-EXECUTION-READINESS-02.NOT_APPLIED.sql` (SQL / RLS / GRANT / Triggers)، وتصميم Staging والتنفيذ في `src/lib/import/import-staging-design.ts`.

## 1. عقد الـ slug (GAP-07) — صُحِّح

| البند | قبل | بعد |
| --- | --- | --- |
| الخوارزمية | FNV-1a **64-bit** | SHA-256 مقتطع إلى **128 بت** (32 خانة hex) |
| الادعاء | «لا يمكن أن يتصادم» (غير صحيح رياضياً) | لا ادعاء استحالة إطلاقاً |
| الحماية | لا شيء بعد الاشتقاق | `UNIQUE(subjects.slug)` + كشف تصادم صريح + fail closed |
| التطبيع | `trim()` فقط | `canonicalSubjectCodeInput()` = NFC + trim + طي المسافات |
| المسارات | مسار واحد | مسار مزامن نقي + مسار Web Crypto غير متزامن، **متطابقان bytes-for-bytes** (مغطى باختبار) |

العقد المعتمد:

```text
deterministic slug
+ UNIQUE (subjects.slug)  →  subjects_slug_key
+ explicit collision detection (planSubjectSlugs)
+ fail closed  →  SLUG_COLLISION, zero writes
```

دلالات الفاصل المحجوز `--`: أي `subject_code` يحتوي `--` لا يُعتبر slug-safe ويُدفع دائماً إلى المسار المُبَصَّم، فالفرع «الهوية» والفرع «المُشتق» منفصلان تماماً ولا يوجد أي غموض بينهما.

اختبار التصادم لا يبحث عن تصادم SHA حقيقي؛ يُحقن digest مُصطنع يُرجع نفس البصمة لكودين مختلفين، ويُتحقق من رفع `SLUG_COLLISION` وعدم إرجاع أي خطة كتابة.

## 2. مراجعة المسودة SQL

| # | البند | التصنيف | النتيجة |
| --- | --- | --- | --- |
| S1 | GRANT على `content_review_state` و`import_staging_rows` | — | PASS — لا GRANT لـ`anon`؛ `authenticated` قراءة فقط؛ `service_role` كامل. |
| S2 | RLS مفعّلة على كل جدول جديد | — | PASS. |
| S3 | عزل صفوف Staging | MEDIUM | **عولج داخل المسودة**: القراءة أصبحت مقيدة بمالك الوظيفة (`import_jobs.created_by = auth.uid()`)، مع سياسة منفصلة للأدمن الكامل. |
| S4 | مرجع متعدد الأشكال في `content_review_state` | MEDIUM | **مفتوح تصميمياً ومغلق قراراً**: لا FK ممكن على `(entity_type, entity_id)`. المرحلة 03 ملزمة بتحقق fail-closed لوجود الكيان وبتنظيف الحالة عند الحذف. |
| S5 | Triggers معلّقة في المسودة | LOW (هنا) / **حاجب في 03** | مقبول فقط لأن الملف `NOT_APPLIED`. Migration المرحلة 03 **لا يُعتمد** إذا بقي أي trigger أمني معلّقاً — allowlist معلّقة = لا allowlist. |
| S6 | `SET search_path = public` على كل دالة | — | PASS لكلتا الدالتين. |
| S7 | ربط الموافقة بالبصمة | — | PASS تصميمياً: `reset_review_state_on_hash_change` يعيد `pending + draft` ويمسح `reviewed_by/at` عند أي تغيّر في `content_hash` (يصبح فعالاً عند تفعيل الـtrigger في 03). |
| S8 | الملف خارج `supabase/migrations/` | — | PASS. |

## 3. BLOCKED_PUBLISHED

المسار الوحيد للكتابة يمر عبر `planned_action` المخزّن في Staging، و`BLOCKED_PUBLISHED` تُحسم في مرحلة `planned` **قبل** أي domain write. `EXECUTION_RULES.publishedOverwrite = "forbidden"` و`revalidation = "mandatory_inside_transaction"`، أي تُعاد الحسبة داخل المعاملة فلا تنفع مسابقة زمنية بين التخطيط والتنفيذ. لم يُعثر على مسار تجاوز.

## 4. الذرّية وآلة الحالات

```text
parsed → validated | blocked
validated → planned → applying → applied | failed
```

- `blocked` = لم تبدأ أي domain write.
- `failed` = بدأ التنفيذ وفشل، ويجب أن يكون قد تم **rollback كامل للمعاملة**؛ لا كتابات جزئية.
- الذرّية: معاملة واحدة لكل قالب (`per_template_transaction`)؛ فشل صف واحد داخل الدفعة يُسقط الدفعة كلها لذلك القالب.

## 5. الخلاصة

```text
CRITICAL = 0
HIGH     = 0
MEDIUM   = 2  (S3 عولج داخل المسودة، S4 قرار تصميمي ملزم للمرحلة 03)
LOW      = 1  (S5 — يتحول إلى حاجب في المرحلة 03)
```

الشروط المحمولة إلى المرحلة 03 (إلزامية):

1. تفعيل كل trigger أمني فعلياً — لا تعليقات.
2. تحقق fail-closed لوجود الكيان في `content_review_state` + تنظيف عند الحذف.
3. تثبيت حدود المعاملة و rollback عند `failed` في كود التنفيذ نفسه.

**لا Migration مطبَّق ولا Publish في هذه المرحلة.**
