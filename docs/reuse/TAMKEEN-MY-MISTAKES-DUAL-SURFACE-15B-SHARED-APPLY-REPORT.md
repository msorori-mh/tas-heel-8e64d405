# TAMKEEN-MY-MISTAKES-DUAL-SURFACE-15B — SHARED APPLY REPORT

التاريخ: 2026-08-15 (UTC)
التفويض: `TAMKEEN_MY_MISTAKES_DUAL_SURFACE_15B_SHARED_APPLY = AUTHORIZED`

## الترحيل المطبَّق

- الملف: `20260817010000_my_mistakes_derived_model_15b.sql`
  (طُبِّق من `supabase/migrations-pending/`، ثم نُقل إلى `supabase/migrations/` بلا تعديل بايت واحد)
- `MIGRATION_SHA` (SHA-256، قبل وبعد النقل، متطابق):
  `b3568c4a2a7e86df53de8e08f76a9476fb9e8a029d3875afdd18ee9137649727`
- النص المطبَّق مطابق حرفياً للنص الذي اجتاز آخر بروفة PG17 لـ 15B + 15B_A.

### التواقيع والصلاحيات بعد التطبيق (قراءة فعلية من القاعدة)

```text
_my_mistakes_safe_options(jsonb)                     secdef=false  search_path=public,pg_temp  anon=NO  authenticated=YES
list_my_mistakes(uuid,uuid,text,text,text,int,int)   secdef=true   search_path=public,pg_temp  anon=NO  authenticated=YES
get_my_mistake_detail(uuid)                          secdef=true   search_path=public,pg_temp  anon=NO  authenticated=YES
get_admin_mistake_insights(uuid,uuid,uuid,uuid,
  text,timestamptz,timestamptz,int)                  secdef=true   search_path=public,pg_temp  anon=NO  authenticated=YES
```

### عدّادات ما قبل التطبيق (القاعدة المشتركة)

```text
exam_sessions = 0 | exam_session_questions = 0 | exam_session_answers = 0
question_revisions = 0 | question_targets = 0
```

لا توجد بيانات محاولات على القاعدة المشتركة بعد؛ لذلك التحقق الميداني كان صلاحيات/سلوك،
والتحقق المنطقي والحسابي مرجعه بروفة PG17 على نفس نص الترحيل (SHA مطابق).

## النتائج

```text
STUDENT_SURFACE             = PASS   (/my-mistakes + مدخل الرئيسية، RPCs مثبتة، anon DENY)
ADMIN_SURFACE               = PASS   (/admin/learning-insights/mistakes، أدمن كامل فقط)
STUDENT_ADMIN_METRIC_PARITY = PASS   (مرجع: بروفة PG17 — STUDENT_ADMIN_METRIC_PARITY assertions)
DERIVED_MODEL               = YES    (اشتقاق كامل من بيانات المحاولات القائمة)
NEW_TABLE_CREATED           = NO     (0 جداول باسم يحوي mistake؛ لا CREATE TABLE في النص)
HISTORICAL_REVISION         = PASS   (تثبيت question_revision_id وهدف تلك النسخة)
TRACK_ISOLATION             = PASS   (النماذج الوزارية مقيدة بمنهج الطالب في السطحين)
PRIVACY                     = PASS   (تحليلات مجمّعة فقط؛ لا user_id/هوية/دفتر فردي)
PERMISSIONS                 = PASS   (anon execute = ZERO على الدوال الأربع؛ authenticated فقط)
ANSWER_LEAK                 = ZERO   (لا answer_key / correct_option / is_correct خام / hidden_solution)
PG17_REFERENCE              = PASS   (tests/import/run-pg17-my-mistakes-15b-rehearsal.sh = PASS، 52 PASS ≥ 45)
POST_APPLY_TESTS            = PASS   (vitest: 112/112؛ الأمان الثابت 21/21؛ بروفة PG17 بعد النقل = PASS)
TYPECHECK                   = PASS
BUILD                       = PASS
DEMO_DATA                   = ZERO   (لا بيانات، لا جلسات، لا أخطاء مصطنعة، لا جداول لقطات)
MIGRATION_SHA               = b3568c4a2a7e86df53de8e08f76a9476fb9e8a029d3875afdd18ee9137649727
SHARED_DB_APPLIED           = YES
BLOCKERS                    = NONE
```

### تحقق الرفض الفعلي عبر الـ Data API (مفتاح anon)

```text
POST /rpc/list_my_mistakes            → 401  permission denied for function
POST /rpc/get_admin_mistake_insights  → 401  permission denied for function
POST /rpc/get_my_mistake_detail       → 404  (غير مكشوفة بلا معاملات؛ التنفيذ محجوب أيضاً: anon execute = false)
```

### البيانات والمعمار

```text
NEW_MISTAKE_TABLE              = NO
DUPLICATED_MISTAKE_DATA        = ZERO
EXISTING_ATTEMPT_DATA_MUTATION = ZERO   (الترحيل دوال قراءة فقط)
CURRICULUM_WRITES              = ZERO
DEMO_DATA                      = ZERO
```

## ملاحظات

1. `STUDENT_ADMIN_METRIC_PARITY` معتمد من بروفة PG17 المرجعية وليس من القاعدة المشتركة،
   لأن إثباته ميدانياً يتطلب بيانات محاولات وإنشاؤها ممنوع بقاعدة `DEMO_DATA = ZERO`.
   يعاد تأكيده تلقائياً عند توفر أول بيانات محاولات حقيقية.
2. تحذيرات الـ linter الظاهرة بعد التطبيق (Function Search Path / SECURITY DEFINER executable)
   تخص دوال قديمة في المشروع ولا تخص دوال 15B: الدوال الأربع تضبط `search_path` صراحةً
   و`anon` لا يملك EXECUTE عليها.
3. إخفاقات اختبارات قديمة قائمة قبل هذه المرحلة (مثل `explanation_code` في
   `content-code-registry.server.ts` و baseline-replay لبنك الأسئلة والقوالب) غير مرتبطة بـ 15B
   ولم تتأثر به.

## الحكم

`TAMKEEN_MY_MISTAKES_DUAL_SURFACE_15B_SHARED_APPLY = PASS`

15B مغلق بالكامل للطالب والأدمن. المرحلة التالية: **15C — UNIFIED STUDENT PERFORMANCE**
بإعادة استخدام 14F الوزاري + بيانات المحاولات العادية، مع `STUDENT_SURFACE = REQUIRED`
و`ADMIN_SURFACE = REQUIRED` وبلا نظام تحليلات ثالث.
