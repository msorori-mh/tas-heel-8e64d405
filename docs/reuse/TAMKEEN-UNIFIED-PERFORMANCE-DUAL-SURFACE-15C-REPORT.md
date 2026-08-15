# TAMKEEN_UNIFIED_PERFORMANCE_DUAL_SURFACE_15C — تقرير التنفيذ

**الحكم: PASS_READY_FOR_APPLY**

## 1. القرار المعماري

- `NEW_ANALYTICS_TABLE = NO` — لا جدول جديد، ولا Materialized View، ولا نسخة محسوبة مسبقاً.
- تحليل الأداء الموحد مشتق بالكامل من: `exam_sessions` + `exam_session_answers` + `exam_session_questions`
  + `question_targets` (عبر `question_revision_id` المثبتة) + `user_progress` + `profiles`.
- إعادة استخدام التعريفات القائمة:
  - **14F**: تطبيع النسبة المئوية، أفضل/آخر نتيجة، تعريف التحسن (متوسط آخر ٣ محاولات − ما قبلها).
  - **15B**: تعريف الخطأ، الخطأ المتكرر، الترك فارغاً، «أتقنها لاحقاً».
  - **13/14**: نسبة السؤال لدرسه وقت المحاولة (Historical Revision Attribution).

## 2. المخرجات

| الطبقة | الملف |
| --- | --- |
| Migration (Pending) | `supabase/migrations-pending/20260818010000_unified_performance_dual_surface_15c.sql` |
| RPC الطالب | `get_student_unified_performance(_attempt_type, _limit)` |
| RPC الأدمن | `get_admin_unified_performance(_grade_id, _track_id, _subject_id, _lesson_id, _attempt_type, _from, _to, _limit)` |
| دوال داخلية | `_up_sessions`, `_up_occurrences`, `_up_progress` |
| مكتبة العميل | `src/lib/performance/unified-performance-api.ts` |
| واجهة الطالب | `src/routes/_authenticated/performance.tsx` (`/performance`) |
| واجهة الأدمن | `src/routes/_authenticated/admin.learning-insights.performance.tsx` |
| مدخل الصفحة الرئيسية | `src/components/home/PerformanceEntry.tsx` |
| اختبارات ثابتة | `tests/import/unified-performance-15c.test.ts` |
| بذور البروفة | `tests/import/fixtures/pg17-unified-performance-15c-smoke.sql` |
| مشغّل البروفة | `tests/import/run-pg17-unified-performance-15c-rehearsal.sh` |

## 3. الضمانات الأمنية

- كلا الـRPC `SECURITY DEFINER` مع `search_path` مثبت، و`REVOKE ... FROM PUBLIC` ثم `GRANT ... TO authenticated` فقط.
- RPC الطالب لا يقبل `user_id` إطلاقاً — يعتمد `auth.uid()` حصراً.
- RPC الأدمن محمي بحارس `is_admin`/الدور، ويرفض الطالب العادي (DENY).
- عزل المسارات (Track Isolation) مفروض داخل SQL على المحتوى الوزاري.
- خصوصية الأدمن: إخفاء أي مجموعة أقل من `privacy_min_group_size = 3`، وبلا أي هوية طالب.
- `ANSWER_LEAK_ZERO`: لا `is_correct`، ولا نص خيار، ولا مفتاح إجابة في أي حمولة (طالب أو أدمن) — مؤكَّد بالبروفة وبالاختبار الثابت.
- العميل لا يحسب أي مقياس؛ يعرض ويهيئ التنسيق فقط.

## 4. نتائج التحقق

| الفحص | النتيجة |
| --- | --- |
| بروفة PG17 (`run-pg17-unified-performance-15c-rehearsal.sh`) | **PASS — 41/41 assertions** |
| Metric Parity (طالب ↔ أدمن: المحاولات، المصححة، المعلقة، المتوسط، الأفضل، الخطأ/الفراغ، الإتمام) | PASS |
| Parity مع 15B (`unique_mistakes` = إجمالي `list_my_mistakes`) | PASS |
| نسبة السؤال للدرس التاريخي (R3 يبقى على «الدرس الأول») | PASS |
| استبعاد المعلق يدوياً من المتوسطات واحتسابه منفصلاً | PASS |
| بلا اقتطاع عند 1000 صف (سجل ضخم) | PASS |
| DENY: anon / طالب على RPC الأدمن / طالب على بيانات طالب آخر | PASS |
| اختبارات ثابتة `unified-performance-15c.test.ts` | PASS — 10/10 |
| `tsgo --noEmit` | PASS (نظيف) |
| Vitest (كامل المشروع) | 122/122 اختباراً ناجحاً |

## 5. عيوب اكتُشفت وأُصلحت أثناء البروفة

| المعرف | الوصف | الإصلاح |
| --- | --- | --- |
| FIX-15C-01 | `user_progress` في بيئة PG17 المحلية تفتقد `completed` / `completed_at` / `quiz_score` | إضافة `tests/import/fixtures/pg17-prereq-15c-progress.sql` إلى سلسلة البروفة (بيئة اختبار فقط، لا أثر إنتاجي) |
| FIX-15C-02 | معرّفات UUID غير صالحة وقيمة `grading_status` غير مطابقة للقيد في البذور | تصحيح البذور لاستخدام `PENDING_MANUAL_REVIEW` و UUID سليم |

## 6. الخطوة التالية

الترحيل ما يزال في `supabase/migrations-pending/`. التطبيق على القاعدة المشتركة يحتاج إذناً صريحاً:
`UNIFIED_PERFORMANCE_15C_SHARED_APPLY = AUTHORIZED`.
