# PAST_MINISTERIAL_EXAMS_PERFORMANCE_ANALYTICS_14F — تقرير التنفيذ

الحالة: **جاهز للتطبيق (Pending Apply)** — الترحيل ما زال في `supabase/migrations-pending/`.

## 1. النطاق

صفحة «أدائي في الاختبارات الوزارية» للطالب:

- متوسط النتيجة، أفضل نتيجة، آخر نتيجة، اتجاه المستوى.
- الأداء حسب المادة، والأداء حسب الدرس (مع «الدروس الأضعف»).
- أنماط الأداء: نسبة الترك، نسبة الخطأ، الأسئلة قيد التصحيح اليدوي.
- تقسيم حسب وضع المحاولة: تدريب / محاكاة.

## 2. الملفات

| الملف | الدور |
| --- | --- |
| `supabase/migrations/20260815020000_ministerial_analytics_14f_14g.sql` | `current_student_track_id()` + `get_ministerial_performance_overview()` |
| `src/lib/ministerial/ministerial-analytics-api.ts` | استدعاء الـRPC + تدهور لطيف عند `PGRST202` |
| `src/routes/_authenticated/ministerial-exams.performance.tsx` | لوحة الأداء (Mobile-first / RTL) |
| `src/routes/_authenticated/progress.tsx` | رابط الدخول من صفحة التقدم |
| `tests/security/ministerial-analytics-14fg.static.test.mjs` | حراس ثابتة على نص الـSQL والواجهة |
| `tests/import/fixtures/pg17-ministerial-analytics-14fg-smoke.sql` | بذور + تأكيدات وقت التشغيل |
| `tests/import/run-pg17-ministerial-analytics-14fg-rehearsal.sh` | بروفة PostgreSQL 17 معزولة |

## 3. القرارات الست المعتمدة

1. **الجلسات المنتهية بالوقت (`expired`) المصححة تدخل في التحليل.** النطاق هو `status IN ('submitted','expired')`.
2. **المقارنة بالنسبة المئوية لا بالدرجة الخام**: `score / total_points * 100`، فالنماذج تختلف في مجموع الدرجات.
3. **نسبة الدرس تُحسب من النسخة التاريخية المثبتة**: الربط عبر `exam_session_questions.question_revision_id → question_targets.revision_id`، فلا يتغير تاريخ الطالب عند نشر نسخة جديدة من السؤال.
4. **الأسئلة قيد التصحيح اليدوي مستبعدة من دقة الدرس**: المقام هو `auto_graded` فقط، وتُعرض منفصلة في `manual_pending`.
5. **الجلسات غير النهائية لا تدخل المتوسطات**: `is_final = true AND grading_status = 'GRADED'`، وتُعرض بعددها في `pending_manual_count`.
6. **دالة واحدة للـ14F** ترجع `jsonb` واحدًا بدل عدة نداءات (أهم لضعف الشبكة).

## 4. الحماية

- `SECURITY DEFINER` + `SET search_path = public, pg_temp`.
- `auth.uid() IS NULL` ⇒ `unauthorized`؛ `REVOKE` من `PUBLIC` و`anon`، و`GRANT EXECUTE` لـ`authenticated` فقط.
- **لا معامل `user_id` في التوقيع** — الطالب لا يستطيع طلب أداء غيره.
- كل قراءة مقيدة بـ`ministerial_exam_models.curriculum_track_id = current_student_track_id()`.
- لا يظهر في المخرجات أي `is_correct` خام على مستوى سؤال معروض، ولا نص إجابة، ولا `correct_option_code`، ولا حل. المخرجات تجميعية فقط (أعداد ونِسَب).
- الطالب بلا مسار دراسي يحصل على ملخص أصفار بدل خطأ.

## 5. نتيجة البروفة (PostgreSQL 17 معزولة)

```
bash tests/import/run-pg17-ministerial-analytics-14fg-rehearsal.sh
RESULT: 14F/14G REHEARSAL = PASS   (24/24 assertions)
```

من ضمنها لـ14F: احتساب جلسة `expired` المصححة، استبعاد الجلسة قيد التصحيح من المتوسطات مع ظهورها في `pending_manual_count`، المتوسط 75% وأفضل نتيجة 100%، تقسيم تدريب/محاكاة، نسب الدرس من النسخة التاريخية (درس 2021 محسوب)، السؤال اليدوي غير محسوب خطأً، السؤال بلا درس مرتبط لا يُسقَط بل يُعدّ في `unlinked_questions_count`، عزل الطالب عن جلسات غيره، ورفض `anon`.

الترحيل طُبِّق مرتين متتاليتين في البروفة للتأكد من الـIdempotency.

## 6. لا بيانات تجريبية

الترحيل لا يحتوي أي `INSERT`. كل البذور موجودة في ملف البروفة المعزول فقط.
