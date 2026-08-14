# MINISTERIAL_ANALYTICS_14F_14G_SHARED_APPLY — تقرير التطبيق على القاعدة المشتركة

**الحكم: MINISTERIAL_ANALYTICS_14F_14G_SHARED_APPLY = PASS**

التاريخ: 2026-08-14 23:30 UTC

## 1. الملف المطبَّق

| البند | القيمة |
| --- | --- |
| الملف | `20260815020000_ministerial_analytics_14f_14g.sql` |
| SHA-256 | `51ec5190e85a2b5fffed4d8f6e527d582d6cce7bac294c112db5182fdac302c5` |
| الأسطر | 397 |
| التعديل أثناء التطبيق | **لا يوجد** — نفس النص الذي اجتاز بروفة PG17 (24/24) حرفيًا |
| الموقع بعد التطبيق | `supabase/migrations/20260815020000_ministerial_analytics_14f_14g.sql` (SHA بعد النقل مطابق) |

## 2. الحالة قبل التطبيق

**الدوال**: أي من `current_student_track_id` / `get_ministerial_performance_overview` /
`list_repeated_ministerial_subjects` / `list_repeated_ministerial_questions` **غير موجودة** (0 صفوف في `pg_proc`).
فلا توجد signatures أو grants سابقة تُستبدَل.

**الأعداد قبل**:

| الجدول | العدد |
| --- | --- |
| `ministerial_exam_models` | 0 |
| `ministerial_exam_questions` | 0 |
| `exam_sessions` | 0 |
| `exam_session_answers` | 0 |

## 3. الحالة بعد التطبيق

```
current_student_track_id             | secdef=true | search_path=public, pg_temp | authenticated=X service_role=X
get_ministerial_performance_overview | secdef=true | search_path=public, pg_temp | authenticated=X service_role=X
list_repeated_ministerial_subjects   | secdef=true | search_path=public, pg_temp | authenticated=X service_role=X
list_repeated_ministerial_questions(_subject_id uuid, _min_occurrences integer, _year_from integer)
                                     | secdef=true | search_path=public, pg_temp | authenticated=X service_role=X
```

`has_function_privilege('anon', …, 'EXECUTE') = false` للأربع دوال جميعًا.

## 4. A) التحقق من 14F

| البند | النتيجة |
| --- | --- |
| `get_ministerial_performance_overview` موجودة وقابلة للاستدعاء من `authenticated` | PASS |
| مصدر المستخدم `auth.uid()` ولا يوجد أي وسيط `user_id` | PASS (التوقيع بلا وسائط) |
| احتساب `expired` المصححة | PASS — `status IN ('submitted','expired')` |
| `MANUAL_REVIEW_PENDING` خارج المتوسطات النهائية | PASS — `is_final = true AND grading_status = 'GRADED'`، وتظهر في `pending_manual_count` |
| avg/best/latest بالنسبة المئوية | PASS — `score / total_points * 100` |
| `improvement` بنقاط مئوية | PASS — `recent_avg - previous_avg` |
| `by_lesson` عبر النسخة التاريخية المثبتة | PASS — `question_targets.revision_id = exam_session_questions.question_revision_id` |
| الأسئلة اليدوية لا تُحسب خطأً | PASS — مقام الدقة `auto_graded` فقط |
| الأسئلة بلا درس لا تُسقَط بصمت | PASS — `unlinked_questions_count` |
| لا إجابات صحيحة/مفاتيح إجابة في الحمولة | PASS — مخرجات تجميعية فقط |

## 5. B) التحقق من 14G

| البند | النتيجة |
| --- | --- |
| `list_repeated_ministerial_questions` تعمل | PASS |
| `list_repeated_ministerial_subjects` تعمل | PASS |
| هوية التكرار = `question_id` | PASS — `GROUP BY meq.question_id` |
| `occurrence_count` = عدد النماذج المتمايزة | PASS — `count(DISTINCT model_id)` |
| صنعاء لا تُظهر عدن | PASS — `m.curriculum_track_id = current_student_track_id()` في كل قراءة |
| كل ظهور يحتفظ بـ`published_revision_id` التاريخية | PASS |
| نسخة العرض حتمية | PASS — `DISTINCT ON (question_id) ORDER BY academic_year DESC, published_at DESC NULLS LAST, model_id` |
| لا إجابات/حلول/خيار صحيح في الحمولة | PASS |
| بيانات الدرس عبر target آمن | PASS — `question_targets` على نسخة العرض فقط |

## 6. C) الأمن

| البند | النتيجة |
| --- | --- |
| `anon EXECUTE = 0` | PASS — تحقق مزدوج: `has_function_privilege` = false، ونداء REST بمفتاح anon يرجع **401 / 42501 permission denied** |
| `PUBLIC EXECUTE = 0` | PASS — لا إدخال `=X/` بلا اسم دور في ACL |
| `authenticated` فقط حيث يلزم | PASS (`service_role` هو المالك الإداري القياسي) |
| `SECURITY DEFINER` + `search_path = public, pg_temp` | PASS للأربع دوال |
| cross-track = DENY | PASS |
| cross-student = DENY | PASS — `es.user_id = v_uid` ولا وسيط مستخدم |
| `can_access_subject` مفروضة | PASS في دالتي 14G |
| القراءة المباشرة للجداول الحساسة تبقى DENY | PASS — لم تُمنح أي صلاحيات جدولية جديدة |
| ANSWER_LEAK | **ZERO** |

نداء anon الفعلي:

```
POST /rest/v1/rpc/get_ministerial_performance_overview  → 401 {"code":"42501", ...}
POST /rest/v1/rpc/list_repeated_ministerial_subjects    → 401 {"code":"42501", ...}
```

## 7. D) الانحدار (Regression)

| المجموعة | النتيجة |
| --- | --- |
| بروفة PG17 لـ14F/14G (قبل التطبيق) | PASS 24/24 |
| حراس 14F/14G الثابتة (بعد تحديث المسار) | PASS 11/11 |
| 14E / 14D / 14C / 14B / QB / import contract / TCS-2 (`vitest run`) | PASS 91/91 |
| فحص الأنواع (`tsgo --noEmit`) | PASS بلا أخطاء |

ملاحظة: 44 ملف `.ts` تحت `tests/question-bank/import` و`tests/import` تُبلِّغ
"No test suite found" لأنها مبنية على محرك التشغيل المخصص لا على vitest — وهي حالة
سابقة للتطبيق وغير متأثرة به.

## 8. E) البيانات

| البند | النتيجة |
| --- | --- |
| إنشاء نماذج وزارية | لا شيء |
| إنشاء جلسات | لا شيء |
| كتابات المنهج | لا شيء |
| الأعداد بعد التطبيق | `0 / 0 / 0 / 0` — مطابقة تمامًا لما قبله |

الترحيل لا يحتوي أي `INSERT`/`UPDATE`/`DELETE`، ولا أي `CREATE TABLE` أو `ALTER TABLE`.

## 9. الحكم النهائي

**MINISTERIAL_ANALYTICS_14F_14G_SHARED_APPLY = PASS**

Applied SHA-256: `51ec5190e85a2b5fffed4d8f6e527d582d6cce7bac294c112db5182fdac302c5`
