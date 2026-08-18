# TAMKEEN_LESSON_CONTENT_ARCHITECTURE_V3_FULL_SOURCE_CLOSURE_21C_21G

## G0 — Source lock

- `CURRENT_BRANCH` = `edit/edt-0f4a6309-c838-4382-ac93-41805294e78b`
- `START_HEAD` = `6b17c8079b685fc11170adce9280a7b99b82a9d2`
- `END_HEAD` = آخر auto-commit على نفس الفرع بعد هذه الدفعة
- `git status` = clean عند البدء
- أعمال 21B4B / 21B4C-R1 / 21B4D / 21B4E / 21B4F / 21B4G **محفوظة ولم تُعد كتابتها** (لا حذف ولا rebase؛ التعديلات إضافية فقط)
- `PHYSICAL_ANDROID_FINAL_SESSION = PENDING_DEVICE_AVAILABLE` (لم يوقف هذه المهمة)

## PHASE 21C — Unified HTML Content Standard → PASS

- ملف جديد `src/lib/lessons/html-content-standard.ts`:
  - بروفايلان فقط: `STATIC_EDUCATIONAL_HTML` (شرح/ملخص/خريطة، JS ممنوع) و`INTERACTIVE_EDUCATIONAL_HTML` (تجارب، JS داخل sandbox الحالي فقط).
  - قواعد إلزامية: RTL، viewport، منع CDN خارجي، أصول مُدارة محلياً، offline-cacheable، تسمية `lesson_code`، منع تسريب الإجابات.
  - سير عمل الأدمن: `UPLOAD → VALIDATE → DRAFT → PREVIEW → REVIEW → READY` مع منع القفز بين المراحل.
- **لا sandbox ثانٍ ولا نظام HTML جديد**: نفس pipeline الحزم (zip → preflight → security scan → CSP hash → bridge → managed assets).
- توحيد أنماط كشف الإجابات: `package-validator.ts` صار يستورد `ANSWER_LEAK_PATTERNS` من المعيار الجديد (مصدر واحد للحقيقة) وأضيفت أنماط `data-correct` و`data-rationale` و`model-answer`.
- Legacy و15A data: لم يُحذف شيء.

## PHASE 21D — Official Book Questions → PASS (source)

`src/lib/lessons/official-book-questions.ts`:

- 8 أنواع أسئلة: short_text · essay · single_choice · true_false · fill_blank · matching · ordering · multipart.
- `toPublicQuestion()` هو المُسلسِل الوحيد نحو العميل ويجرّد كل حقل يحمل إجابة (`FORBIDDEN_CLIENT_KEYS`)؛ و`containsAnswerLeak()` حارس زمن تشغيل + اختبار.
- `evaluateReveal()` بوابة fail-closed: لا كشف إلا بعد إرسال إجابة فعلية + تطابق revision + جاهزية القدرة.
- `buildRevealPayload()`: تصحيح آلي للأنواع القابلة للتصحيح فقط، والمقالي/القصير `comparisonOnly = true` (لا Auto-grade بلا سياسة موثوقة).
- `MODEL_ANSWER_NOT_IN_INITIAL_CLIENT_PAYLOAD = SATISFIED` على مستوى العقد؛ RPC الحالي `get_lesson_quiz_questions` أصلاً لا يعيد الإجابات والتصحيح يتم على الخادم.

## PHASE 21E — Self Test → PASS (source)

- إعادة استخدام كامل لـ Question Bank + Assessments + Targets؛ **لا نظام أسئلة جديد**.
- عقد `OptionRationale` (`why_correct` / `why_wrong`) — لا يصل العميل قبل الكشف المصرّح به.
- تثبيت النسخة (`revisionId`) على المحاولة، والكشف يرفض أي عدم تطابق.
- الربط بـ My Mistakes / Performance / lesson progress يبقى عبر الأنظمة القائمة (15B/15C) دون ازدواج.

## PHASE 21F — Final Capability + Readiness Contract → PASS

`src/lib/lessons/content-v3.ts`:

- سبع قدرات نهائية فقط؛ `originalBookPdf` و`studentPerformance` و`supportingResources` خارج العقد.
- Applicability: `REQUIRED | OPTIONAL | NA`، والتجربة `OPTIONAL` افتراضياً.
- Readiness: `BOOK_READY` / `LEARNING_READY` / `ASSESSMENT_READY` / `FULLY_READY` مع قائمة النواقص لكل مستوى، fail-closed.
- تحديث `STUDENT_CAPABILITY_ORDER` والتسميات لتطابق V3 (ملخص الدرس، التجارب/النشاط التفاعلي، أسئلة الدرس، اختبر نفسك).

## PHASE 21G — Admin Workspace V3 → PASS

- `LessonContentWorkspace.tsx` يعرض القدرات السبع فقط كعناصر أساسية، ولكل عنصر: applicability، lifecycle، الحالة، المصدر/الـ HTML ref، آخر تحديث، سبب عدم الجاهزية، أزرار التحرير والانتقالات، وشارة رسمي/تمكين.
- Dashboard صغير بأربع بطاقات (BOOK/LEARNING/ASSESSMENT/FULLY) مع **تفسير صريح لما ينقص** بدل حالة عامة.
- قسم Legacy/Reference يضم PDF القديم والموارد المساعدة — خارج عقد جاهزية الطالب، والبيانات محفوظة.

## PHASE 21G-B — Student Lesson V3 UX → PASS

- الترتيب: الكتاب الرسمي → شرح تمكين → ملخص الدرس → الخريطة الذهنية → التجارب → أسئلة الدرس → اختبر نفسك.
- N/A مخفي، غير الجاهز مخفي، لا بطاقات فارغة ولا "غير متوفر" spam، progress ديناميكي، لا خطوة PDF، كتب المنهج تبقى على مستوى المادة.

## Changed files

- جديد: `src/lib/lessons/content-v3.ts`، `src/lib/lessons/html-content-standard.ts`، `src/lib/lessons/official-book-questions.ts`، `src/lib/lessons/content-v3.test.ts`
- معدّل: `src/lib/lessons/lesson-content-contract.ts`، `src/lib/lessons/lesson-capabilities.ts`، `src/components/admin/LessonContentWorkspace.tsx`، `src/lib/server/html-pipeline/package-validator.ts`
- توثيق: هذا التقرير + `TAMKEEN-LESSON-CONTENT-V3-FINAL-MATRIX.md` + `drafts/21F-capability-applicability-and-rationale.draft.sql`

## Migrations drafted (NOT applied)

`docs/content/drafts/21F-capability-applicability-and-rationale.draft.sql`
- `lesson_capability_lifecycle.applicability` (enum جديد، additive، افتراضي REQUIRED)
- `question_option_rationales` + `official_question_answers`: RLS مفعّل، بلا أي GRANT لـ anon/authenticated، admin عبر `has_role`، والوصول التعليمي عبر RPC كشف security-definer.
- خطة rollback موثقة. **لم يُنفَّذ أي apply أو أي كتابة على قاعدة الإنتاج.**

## Security review

| البند | النتيجة |
|-------|---------|
| answer leaks (HTML/props/API/cache) | مغلق عبر `toPublicQuestion` + `containsAnswerLeak` + أنماط الماسح الموحدة |
| rationale leaks | مغلق (يصل عبر reveal payload فقط) |
| draft visibility / READY-only | مغلق (lifecycle overlay + fail-closed readiness) |
| lifecycle bypass | مغلق (`nextWorkflowStep` خطوة واحدة بعد نجاح التحقق) |
| HTML sandbox / CSP / external scripts | نفس النظام القائم، مع منع CDN وJS في البروفايل الثابت |
| arbitrary file access | لم يتغيّر (managed storage refs فقط) |
| revision pinning | مفروض في بوابة الكشف |
| unpublished content exposure | مخفي بالكامل عن الطالب |

لا يوجد HIGH/CRITICAL جديد. لا يوجد Security blocker.

## Offline / Mobile

البروفايلان `offlineCacheable`، الأصول محلية مُدارة، لا اعتماد على CDN — لا تغيير في معمارية 21B4B ولا في قارئ الكتب.

## Legacy compatibility

`lesson_resources` · `lesson_summaries` · explanations · mind maps · simulations · محتوى القرآن المهيكل: **لا حذف، لا إعادة تسمية، لا فقدان بيانات**. مفاتيح V3 مجرد عرض (mapping) فوق مفاتيح 20B.

## Golden lesson

درس القرآن الأول لم يُمس محتواه الرسمي المعتمد (31 block + 3 figures). لم يُؤلَّف أي محتوى تعليمي جديد.

## Tests

`npm test` → **209/209 PASS** (منها 27 اختباراً جديداً في مصفوفة V3). `tsgo --noEmit` نظيف.

## Gaps

- SYSTEM_GAP: تطبيق الـ migration على الإنتاج (خلف البوابة).
- CONTENT_GAP: نقص محتوى حقيقي لبعض القدرات (labExperimentHtml، rationale لكل خيار، model answers للأسئلة الرسمية).

## Production gates remaining

`APPROVED_PRODUCTION_APPLY` — مطلوب لتطبيق draft migration. لا merge، لا deploy، لا كتابة على الإنتاج، لا نشر محتوى.

## FINAL VERDICT

**PASS_SOURCE_WITH_PRODUCTION_APPLY_GATE**
