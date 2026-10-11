# SECONDARY-OPERATIONAL-RELEASE-READINESS-CYCLE-01 — التقرير الرئيسي

- **المرحلة:** SECONDARY-OPERATIONAL-RELEASE-READINESS-CYCLE-01
- **المستودع:** msorori-mh/tas-heel-8e64d405
- **المرجع:** origin/main @ `10cb220bbb8aa025b0e521f4738b577f5522b7d6`
- **التاريخ:** 2026-07-31
- **القائد:** K3 Swarm

## القرار النهائي

**HOLD_OPERATIONAL_RELEASE_READINESS**

الأسباب الحاكمة:
1. خطر **HIGH** مفتوح: إجابات الأسئلة (`correct_index` / `explanation`) مقروءة مباشرة عبر PostgREST لأي طالب لديه وصول للمادة — سياسة `questions` SELECT تعيد الصف كاملاً. الإصلاح يتطلب تغيير RLS/migration ⇒ **NEEDS_OWNER_APPROVAL**. القاعدة الصارمة: «أي خطر CRITICAL/HIGH يوقف مرحلة الإطلاق».
2. **WAVE-3 = HOLD**: جاهزية بيانات المحتوى غير مؤكدة — لا يمكن قياسها دون حساب اختبار أو جرد read-only بصلاحية.
3. **TEST_ACCOUNTS_REQUIRED**: لا توجد حسابات اختبار موثقة في البيئة المحلية، فتعذّر تنفيذ E2E الحي (WAVE-1/WAVE-2 runtime).

## الامتثال للقواعد الصارمة

| البند | الحالة |
|---|---|
| Deploy | **لا** — لم يحدث |
| Publish | **لا** — لم يحدث |
| Supabase migrations | **لا** — لم يحدث |
| SQL production | **لا** — لم يحدث |
| تعديل بيانات إنتاجية | **لا** — لم يحدث (قراءة anon فقط) |
| حذف بيانات | **لا** — لم يحدث |
| إنشاء مستخدمين حقيقيين | **لا** — لم يحدث |
| تعديل Auth | **لا** — لم يحدث |
| Storage changes | **لا** — لم يحدث |
| حذف/تعطيل البنية المالية | **لا** — لم يحدث |
| force push | **لا** — لم يحدث |
| merge تلقائي | **لا** — لم يحدث (كل الإصلاحات PRs مفتوحة بانتظار مراجعة المالك) |

---

## GATE-0 — تثبيت الحالة: MAIN_BASELINE_PASS

- `git fetch origin`: تم. أحدث origin/main = `10cb220`.
- التعديل المحلي الوحيد كان ضجيج EOL في `src/routeTree.gen.ts` (مولّد) — أُعيد لنسخة origin ثم fast-forward.
- **Baseline على main @ 10cb220:**
  - `npm ci` → PASS
  - `npx tsc --noEmit` → PASS
  - `npm test` → PASS (8/8)
  - `node tests/pwa/service-worker-policy.static.test.mjs` → PASS (7/7)
  - `node tests/security/free-access-content-gates-hardening.static.test.mjs` → PASS (8/8)
  - `npm run build` → PASS (nitro/cloudflare output، ~25s)
- لا فشل بسبب GitHub Billing (CI يعمل — انظر فحوصات PRs أدناه).

### حالة PRs المفتوحة (عند بدء المرحلة)

| PR | العنوان | الحالة |
|---|---|---|
| #26 | Add admin reporting and notifications foundation | **Draft — غير مدموج** |
| #22 | docs: K3 Swarm Cycle-01 reports | Draft — توثيق فقط |
| #21 | Document Cycle-02 agent factory outcomes | Draft — توثيق فقط |

**PR #26 غير مدموج** ⇒ WAVE-4 = SKIP.

---

## WAVE-1 — Student Core E2E Smoke

**القرار: PASS_STUDENT_CORE_E2E (ثابت/كود) + TEST_ACCOUNTS_REQUIRED (حي)**

الفحص الثابت على main غطّى كامل الرحلة (أدلة file:line في سجل العمل):

| الاختبار | النتيجة |
|---|---|
| تسجيل الدخول → إكمال الملف → لوحة الطالب | PASS (`auth.tsx`, `auth.callback.tsx`, `complete-profile.tsx`, `_authenticated/route.tsx`) |
| الطالب يرى المواد | PASS (`app.tsx` — بعد اختيار الفصل، مع حالات loading/error/empty) |
| فتح مادة → وحدات → دروس | PASS (`subjects.$subjectId.tsx`) |
| فتح درس وموارده | PASS (`lessons.$lessonId.tsx` — فيديو/خرائط/تجارب/PDF/روابط/PhET) |
| بدء تدريب | PASS (`units.$unitId.practice.tsx`, `exams.training.$templateId.tsx`) |
| بدء اختبار صارم | PASS (`exams.strict.$templateId.tsx` — مؤقّت مثبّت على الخادم) |
| عرض النتيجة | **FAIL → أُصلح** (PR #27: أعمدة نتيجة خاطئة في التدريب/السجل) |
| لا `subscription_required` كشرط | PASS (`STUDENT_FREE_ACCESS` يقصّر كل البوابات، RPCs الاشتراك لا تُستدعى أصلاً) |
| لا محفظة/دفع كشرط وصول | PASS (صفحات الدفع inert، إعدادات تخفي قسم المدفوعات، بانر «متاح مجاناً») |

علل وُجدت (التفاصيل في ملف العوائق):
- **HIGH (مُصلح):** رأس نتيجة التدريب وصفحة تفاصيل السجل يقرآن أعمدة غير موجودة (`percentage/correct_count/answered_count`) ⇒ النسبة خاطئة والعدّادات صفر. ⇒ PR #27.
- **MEDIUM (مُصلح):** طريق مسدود للجلسة `expired` في الاختبار الصارم (لا تسليم تلقائي). ⇒ PR #28.
- **MEDIUM (مفتوح):** `user_progress` لا يُكتب من العميل إطلاقاً ⇒ «واصل المذاكرة» ونسب التقدم تبقى صفراً؛ وشريط «التقدم في الدرس» يقيس توفر المحتوى لا تقدم الطالب (تسمية مضللة).
- **LOW:** مسارا `/grades` و`/grades/$gradeId/subjects` يتمان (لا روابط إليهما). **LOW:** `StudentProfileCard` كود ميت (يحوي CTAs اشتراك — غير قابلة للوصول حالياً، تُنظّف لاحقاً).

**الفحص الحي لم يُنفَّذ** — لا حسابات اختبار. انظر قسم TEST_ACCOUNTS_REQUIRED.

---

## WAVE-2 — Authorization & Privacy E2E

**القرار: HOLD_AUTHORIZATION_PRIVACY_E2E** (خطر HIGH مفتوح + E2E حي متعذر)

| الاختبار | النتيجة |
|---|---|
| anon لا يصل للمحتوى | PASS (بوابة `_authenticated/route.tsx` + REVOKE anon على البوابات + RLS authenticated) |
| الطالب الصحيح يصل لمحتواه | PASS (كود) — `can_access_subject` grade/track (migration `20260720120000`) |
| طالب صف خاطئ لا يصل | PASS (كود: بوابات DB + فلاتر عميل) — **يحتاج تأكيداً حياً** |
| طالب منهج خاطئ لا يصل | PASS (كود) — **يحتاج تأكيداً حياً** |
| content_manager لا يدخل مسارات الطالب | PARTIAL — لا حاجز مسار؛ الحماية بياناتية فقط (يرى هيكلاً فارغاً) — LOW |
| content_manager محجوب عن الدفع/المحفظة/التقارير | PASS (`admin-route-access.ts` + سياسات + RPC يرفض الطاقم) |
| admin يدخل لوحة الإدارة | PASS (كود) |
| لا بيانات طالب لطالب آخر | PASS (RLS مالك + `get_exam_session_state` يفرض الملكية server-side) |
| **لا تسريب إجابات الاختبارات** | **FAIL — HIGH مفتوح** (انظر أدناه) |
| direct URL لا يتجاوز الصلاحيات | PASS (عميل + RLS/RPC؛ ملاحظة LOW: حماية admin على مستوى المكوّن لا الـ layout) |

### الخطر HIGH المفتوح — NEEDS_OWNER_APPROVAL

سياسة `"Questions viewable per access"` على `questions` تعيد **الصف كاملاً** — بما فيه `correct_index` و`explanation` — لأي طالب تسمح له الصف/المنهج بالوصول، و`exam_template_questions` مقروءة لأي نموذج نشط. أي طالب يستطيع عبر PostgREST مباشرة قراءة إجابات كل أسئلة الاختبارات قبل وأثناء الاختبار الصارم، ملتفّاً على تعتيم RPC و`redactExamAnswers`. تقرير المعالجة السابق ترك سياسات الأسئلة خارج النطاق عن قصد — الفجوة معروفة وما زالت مفتوحة.

**اتجاه الإصلاح (migration — لا تُنفَّذ دون موافقة المالك):** فصل أعمدة الإجابة (جدول مستقل أو امتيازات أعمدة/عرض security barrier) أو حصر قراءة الأسئلة للطلاب عبر RPCs تجرّد الإجابات.

### MEDIUM مفتوح — NEEDS_OWNER_APPROVAL

`exam_templates` SELECT RLS يسمح بقراءة أي نموذج نشط، و`start_exam_session` يتحقق من `is_active` فقط — بلا تحقق صف/منهج. طالب يستطيع بدء اختبارات صفوف/مناهج أخرى. يحتاج migration.

---

## WAVE-3 — Content Data Readiness Audit

**القرار: HOLD_CONTENT_DATA_NOT_READY** (تعذّر القياس، لا حُكم بالنقص)

- فُحص بعدّادات read-only بمفتاح anon (سكربت `scripts/release-readiness-content-audit.mjs` — قراءة فقط): RLS يحجب كل جداول المحتوى عن anon (متوقع وصحيح): `subjects/curriculum_tracks/lesson_resources/exam_templates = 0`، و`lessons/questions` مرفوضة. المرئي لـ anon: `grades = 3`، و`units = 6` (ملاحظة LOW: `units` مقروءة لـ anon بينما `subjects` محجوبة — عدم اتساق يُراجع).
- قوالب الاستيراد (9 قوالب xlsx) موجودة في `public/content-import-templates/` و`docs/content-templates/` — جاهزة شكلياً؛ **لم يُشغَّل أي import فعلي** (يحتاج تفويضاً وبيانات تجريبية).
- **لا يمكن الإجابة** على أسئلة الجاهزية (كم مادة/وحدة/درس/سؤال جاهز؟ مواد بلا دروس؟ دروس بلا موارد؟ نموذج اختبار واحد على الأقل؟) دون حساب اختبار بصلاحية أو جرد read-only من المالك.

**أقل محتوى لازم للإطلاق المحدود (مقترح):** صف واحد + منهج واحد، مادة واحدة على الأقل مكتملة السلسلة (وحدات ← دروس ← موارد ← أسئلة تدريب)، ونموذج اختبار تدريبي واحد ونموذج صارم واحد نشطان ومربوطان صحيحاً.

---

## WAVE-4 — Admin & Reports Smoke

**القرار: SKIP_ADMIN_REPORTS_SMOKE_PR26_NOT_MERGED**

PR #26 ما زال **Draft غير مدموج** في main. لم تُفحص `/admin/reports` ولا الإشعارات. ملاحظة: صفحات الإدارة الأكاديمية والمالية الموجودة على main محمية (WAVE-2)، لكن تقارير الإدارة ليست جزءاً من الإصدار حتى دمج PR #26.

---

## WAVE-5 — PWA Device/Preview Readiness

**القرار: PASS_PWA_RELEASE_READINESS** (مع تحسين صغير ⇒ PR #29)

| الفحص | النتيجة |
|---|---|
| manifest قابل للتثبيت ومتسق مع الهوية | PASS (ar/rtl/standalone، أيقونات 192/512 + **maskable 512 موجودة**) |
| service worker | PASS (shell + hashed assets فقط؛ لا اعتراض cross-origin؛ لا non-GET؛ لا cache لـ no-store/private) |
| offline fallback | PASS (network-first + `offline.html`؛ لا يُخزَّن أي HTML تنقل) |
| install prompt | PASS (`src/lib/pwa/install-prompt.ts`) |
| عدم cache auth/admin/api/storage | PASS (denylist + اختبار ثابت) |
| عدم جعل الاختبارات offline | **PASS بعد PR #29** — `/exams` لم تكن في denylist صراحة (كان ممكناً عرض `offline.html` عند انقطاع الشبكة أثناء التنقل للاختبار) ⇒ أُضيفت `/^\/exams/` مع تحديث الاختبار الثابت |
| update UX | PASS (تحديث بقرار المستخدم: `SKIP_WAITING` بعد إجراء صريح، لا مقاطعة لجلسة/اختبار جارٍ) |
| Preview محلي | غير متاح — مخرجات البناء Cloudflare worker و`wrangler` غير مثبت محلياً؛ لم يُثبَّت (تجنّباً لإضافة اعتماديات). البناء نفسه PASS. |
| Android Chrome / iOS Safari | يحتاج جهازاً فعلياً بعد أول Preview/Deploy — مسجل كإجراء لاحق على المالك |

---

## PRs التي فُتحت في هذه المرحلة

| PR | الفرع | الموضوع | الفحوصات المحلية | Web CI |
|---|---|---|---|---|
| #27 | `fix/student-core-release-smoke-01` | أعمدة نتيجة التدريب/السجل | tsc PASS، tests 8/8 | **pass** |
| #28 | `fix/strict-exam-expired-autosubmit-01` | تسليم تلقائي للجلسة expired | tsc PASS، tests 8/8 | **pass** |
| #29 | `fix/pwa-exams-denylist-01` | denylist لـ `/exams` في SW | pwa tests 7/7 | pass/pending عند كتابة التقرير |
| (docs) | `k3-swarm/secondary-release-readiness-cycle-01-reports` | تقارير هذه المرحلة | — | — |

كل PR مستقل وصغير، CRITICAL=0 / HIGH=0 / MEDIUM=0، **ولا واحد منها مُدمج** (بانتظار قرار المالك).

## TEST_ACCOUNTS_REQUIRED

مطلوب من المالك توفير حسابات اختبار **موجودة مسبقاً** (لم ولن ننشئ حسابات):

1. `student-main`: طالب بصف ومنهج مطابقين للمحتوى المنشور.
2. `student-wrong-grade`: طالب بصف مختلف عن المحتوى المستهدف.
3. `student-wrong-track`: طالب بنفس الصف ومنهج مختلف.
4. `content-manager-test`: حساب بصلاحية content_manager.
5. `admin-test`: حساب بصلاحية admin.

بعد توفرها تُستأنف E2E الحية لـ WAVE-1/WAVE-2/WAVE-4 وتُقاس جاهزية المحتوى (WAVE-3).

## هل التطبيق جاهز؟

- **إصدار محدود (limited preview):** **ليس بعد.** الشرط الأدنى: (أ) معالجة/قبول مكتوب لخطر تسريب الإجابات HIGH، (ب) دمج PRs #27–#29 بعد المراجعة، (ج) جرد محتوى يثبت اكتمال سلسلة واحدة على الأقل، (د) حسابات اختبار واجتياز E2E حية.
- **إصدار عام:** **لا.** إضافةً لما سبق: تقييد `exam_templates` بالصف/المنهج (MEDIUM)، دمج PR #26 للتقارير، فحص أجهزة فعلية، ومحتوى كافٍ لكل الصفوف/المناهج المستهدفة.

## ماذا يفعل المالك بعد ذلك؟ (بالترتيب)

1. **قرار بشأن خطر تسريب الإجابات (HIGH):** الموافقة على migration تعالج سياسات `questions`/`exam_template_questions` (NEEDS_OWNER_APPROVAL) — مانع الإطلاق الأول.
2. مراجعة ودمج PRs #27 و#28 و#29 (إصلاحات UI/PWA آمنة، CI أخضر).
3. توفير حسابات الاختبار الخمسة أعلاه.
4. تشغيل/تسليم جرد محتوى read-only (أو تفويض حساب admin-test لقياسه).
5. البت في PR #26 (تقارير الإدارة) — دمجه أو تأجيله صراحة عن الإصدار الأول.
6. بعد رفع HOLD: أول Preview (لا Deploy إنتاجي) ثم فحص جهازين: Android Chrome وiOS Safari.
