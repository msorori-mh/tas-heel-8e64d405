# TAMKEEN_UNIFIED_PERFORMANCE_DUAL_SURFACE_15C — SHARED APPLY

**الحكم: PASS**

## 1. الترحيل المطبَّق

| البند | القيمة |
| --- | --- |
| الملف | `20260818010000_unified_performance_dual_surface_15c.sql` |
| SHA-256 قبل التطبيق | `20414ab90029905c992bd542bb08c757c6b527bf39123bea53efa4665f089344` |
| SHA-256 بعد النقل | `20414ab90029905c992bd542bb08c757c6b527bf39123bea53efa4665f089344` (مطابق) |
| المسار الحالي | `supabase/migrations/` |
| تعديل أثناء التطبيق | لا شيء — نفس النص حرفياً |

تحقق إضافي: نص دالة `get_admin_unified_performance` المخزَّن في القاعدة (`pg_proc.prosrc`)
طوبق مع نص الملف — النتيجة **MATCH** (لا انحراف).

## 2. عدادات ما قبل/بعد التطبيق

| الجدول | قبل | بعد |
| --- | --- | --- |
| `exam_sessions` | 0 | 0 |
| `exam_session_questions` | 0 | 0 |
| `exam_session_answers` | 0 | 0 |
| `user_progress` | 0 | 0 |

لا Demo/Test data، ولا تغيير في بيانات المحتوى أو المحاولات.

## 3. عدم إنشاء جداول

- `CREATE TABLE` في الترحيل = 0، `CREATE MATERIALIZED VIEW` = 0.
- جداول جديدة في `public` تخص 15C = 0.

## 4. الدوال والصلاحيات بعد التطبيق

| الدالة | SECURITY DEFINER | EXECUTE |
| --- | --- | --- |
| `_up_sessions` | نعم | `postgres`, `service_role` فقط |
| `_up_occurrences` | نعم | `postgres`, `service_role` فقط |
| `_up_progress` | نعم | `postgres`, `service_role` فقط |
| `get_student_unified_performance` | نعم | `authenticated` |
| `get_admin_unified_performance` | نعم | `authenticated` (+ حارس `is_full_admin` داخلي) |

`anon` = DENY على كل الدوال الخمس.

### إصلاح تصلّبي بعد التطبيق (FIX-15C-APPLY-01)

الترحيل الأصلي يسحب الصلاحية من `PUBLIC` و`anon` فقط للدوال الداخلية، لكن الصلاحيات
الافتراضية في القاعدة المشتركة كانت تمنح `authenticated` صلاحية `EXECUTE` عليها.
بما أن `_up_sessions(_user_id …)` تقبل هوية طالب صراحةً، كان ذلك يفتح مسار قراءة
لبيانات طالب آخر خارج الـRPC المعتمدة. طُبِّق ترحيل تصلّبي منفصل (بلا تعديل نص 15C):

```sql
REVOKE ALL ON FUNCTION public._up_sessions(...) FROM authenticated;
REVOKE ALL ON FUNCTION public._up_occurrences(...) FROM authenticated;
REVOKE ALL ON FUNCTION public._up_progress(uuid) FROM authenticated;
```

مؤكَّد بالفحص أعلاه: الدوال الداخلية لم تعد قابلة للاستدعاء من العميل.

## 5. الانحدار (Regression)

| الفحص | النتيجة |
| --- | --- |
| Vitest (كامل) | 135/135 اختباراً ناجحاً |
| اختبارات 15C الثابتة (`unified-performance-15c.test.ts`) | PASS |
| Answer Leak Zero | PASS — لا `is_correct` ولا مفتاح إجابة في أي حمولة |
| خصوصية الأدمن (`privacy_min_group_size = 3`) | PASS |

## 6. المراجعة الأمنية

- الملفات المتغيرة: نقل ملف الترحيل فقط + هذا التقرير.
- تغيير Migrations: نعم (15C + ترحيل تصلّبي للصلاحيات).
- تغيير RLS: لا.
- تغيير RPCs: نعم (إضافة دالتين عامتين + ثلاث دوال داخلية).
- أثر المصادقة: لا. أثر التخويل: نعم (تضييق فقط).
- تسريب بيانات حساسة: لا.
- خطر تصعيد صلاحيات: لا (بعد FIX-15C-APPLY-01).
- خطر إنتاجي: منخفض (قراءة فقط، بلا جداول أو بيانات).
- جاهز للنشر: نعم.
