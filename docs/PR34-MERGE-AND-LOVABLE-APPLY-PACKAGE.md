# PR34-MERGE-AND-LOVABLE-APPLY-PACKAGE

- **الدور:** تحقق ودمج محدود + حزمة Lovable apply للمالك
- **المستودع:** `msorori-mh/tas-heel-8e64d405`
- **التاريخ:** 2026-07-31
- **الفرع التوثيقي:** `docs/pr34-merge-lovable-apply-package`

---

## 1. نتيجة دمج PR #34

**PASS_PR34_MERGED_AND_VERIFIED**

| البند | النتيجة |
|---|---|
| حالة PR #34 عند الفحص | **MERGED** (سبق دمجه قبل هذه المهمة) |
| من دمجه | `tarasana-mufadhala` |
| وقت الدمج | `2026-07-31T03:35:37Z` |
| merge commit | `4479f3939cd3aeb37b39496d15349554a05e236f` |
| هل Cursor أعاد الدمج؟ | **لا** — PR لم يعد OPEN |
| نطاق الملفات عند الدمج | ضمن المتوقع (migration units RLS + security tests + templates/README/dry-run warnings + report docs) |
| Web CI قبل الدمج | pass |

---

## 2. آخر main SHA

`f5d714d1e6108a52992c633da4a92a0881e7bc07`

ملاحظة على التاريخ بعد #34:
- `4479f39` — Merge PR #34
- `f5d714d` — `Applied units RLS hardening` بواسطة `gpt-engineer-app[bot]` (Lovable)، وأضاف ملف migration موازياً:
  `supabase/migrations/20260731033950_a583b6d4-0360-414e-95f8-83b01f470a02.sql`
  بمحتوى سياسة مكافئ (DROP السياسة العامة + CREATE `TO authenticated` + `can_access_subject`).

**مهم للمالك:** Cursor **لم** يطبّق أي migration على Supabase من هذه المهمة. لكن وجود commit Lovable بعنوان "Applied units RLS hardening" يشير إلى احتمال تطبيق حي مسبقاً. **تحقق أولاً** (anon لا يقرأ units) قبل أي apply جديد؛ إعادة `CREATE POLICY` لنفس الاسم قد تفشل إن كانت السياسة موجودة.

---

## 3. نتائج الفحوص (ما بعد الدمج على main الحالي)

| الفحص | النتيجة |
|---|---|
| `npm ci` | PASS |
| `npx tsc --noEmit` | PASS |
| `npm test` | **25/25** PASS |
| `node tests/pwa/service-worker-policy.static.test.mjs` | **7/7** PASS |
| `node tests/security/units-select-authenticated-only.static.test.mjs` | **6/6** PASS |
| `npm run build` | PASS |
| working tree بعد `git restore src/routeTree.gen.ts` | clean |

---

## 4. Migration المطلوب تطبيقها عبر Lovable

المصدر من PR #34:

`supabase/migrations/20260731180000_restrict_units_select_to_authenticated.sql`

ملف موازٍ ظهر بعد Lovable sync (نفس أثر السياسة تقريباً):

`supabase/migrations/20260731033950_a583b6d4-0360-414e-95f8-83b01f470a02.sql`

**قرار Cursor لهذه المهمة:** لم يُطبَّق أي SQL على الإنتاج. الحزمة أدناه جاهزة إن أكّد المالك أن السياسة غير مطبّقة حياً بعد.

---

## 5. نص Lovable apply الجاهز للمالك

```text
PHASE: PRE-IMPORT-UNITS-RLS-HARDENING-APPLY-01

المشروع:
tas-heel-8e64d405

المطلوب:
تطبيق migration واحدة فقط بعد دمج PR #34 لتقييد قراءة جدول units ومنع anon من قراءة عناوين الوحدات قبل إدخال المحتوى.

Migration المطلوب تطبيقها فقط:
supabase/migrations/20260731180000_restrict_units_select_to_authenticated.sql

قبل التطبيق:
- تحقق إن كانت السياسة "Units viewable per subject access" موجودة مسبقاً (قد يكون Lovable طبّقها عبر commit f5d714d).
- إذا كانت مطبّقة وanon ممنوع من قراءة units: لا تعد التطبيق؛ سجّل PASS مع سبب "already applied".
- إذا غير مطبّقة: طبّق الملف أعلاه فقط.

المطلوب:
1. Apply migration المحددة فقط (أو تأكيد أنها مطبّقة مسبقاً).
2. تحقق أن anon لم يعد يستطيع قراءة public.units.
3. تحقق أن الطالب المصادق لا يزال يستطيع قراءة وحدات المواد المسموحة له.
4. تحقق أن admin/content_manager لا يتأثرون في إدارة المحتوى.
5. تحقق أن subjects/lessons/questions/exams لم تتأثر.
6. تحقق أن correct_index/explanation لم تُمس.
7. لا تنفذ deploy.

ممنوع:
- لا Deploy.
- لا Publish.
- لا تطبيق أي migration أخرى.
- لا تعديل بيانات.
- لا حذف بيانات.
- لا import.
- لا Storage/Auth changes.
- لا Payment/Wallet changes.

التقرير المطلوب:
- هل migration طُبقت بنجاح؟
- هل anon ممنوع من قراءة units؟
- هل authenticated محفوظ؟
- هل admin/content_manager محفوظان؟
- هل الامتحانات والأسئلة لم تتأثر؟
- هل correct_index/explanation لم تُمس؟
- هل تم Deploy؟ يجب أن تكون لا.
- هل تم تعديل/حذف بيانات؟ يجب أن تكون لا.
- القرار النهائي: PASS أو FAIL مع السبب.
```

---

## 6. تأكيد الامتثال (هذه المهمة)

| بند | الحالة |
|---|---|
| Deploy | **لا** |
| SQL production من Cursor | **لا** |
| Supabase migration apply من Cursor | **لا** |
| data writes | **لا** |
| import | **لا** |
| QA cleanup | **لا** |
| تعديل Auth/Storage/Payment | **لا** |
| merge لأي PR غير #34 | **لا** |
| تغييرات كود جديدة | **لا** (توثيق فقط) |

---

## 7. PRs الجديدة من Kimi (مراجعة فقط — بلا دمج)

| PR | العنوان | CI | التوصية |
|---|---|---|---|
| **#35** | docs: prepare content import dry-run package | pass | **READY_FOR_REVIEW** — توثيقي (runbook dry-run)؛ ضمن الخطة بعد apply |
| **#37** | docs: release stability snapshot before content import | pass | **READY_FOR_REVIEW** — توثيقي؛ ملاحظة: كُتب قبل commit Lovable `f5d714d` وقد يحتاج تحديث حالة الـ apply |
| **#36** | docs: independent pre-import review | pass | **READY_FOR_REVIEW** — مراجعة Cursor السابقة؛ أرشيف مفيد |
| **#33** | docs: content data readiness audit | pass | **READY_FOR_REVIEW** (اختياري/أرشيف) أو close كـ superseded بعد استقرار apply |
| **#30** | docs: K3 Swarm release-readiness cycle-01 reports | pass | OUT_OF_SCOPE للـ pre-import العاجل (أرشيف دورة سابقة) |
| **#26/#22/#21** | drafts قديمة | — | **OUT_OF_SCOPE** / HOLD |

لم تُدمج أي من هذه الـ PRs في هذه المهمة.

---

## 8. الخطوات المتبقية حسب الخطة

1. **تحقق/Lovable apply** للـ migration (إن لم تكن مطبّقة حياً بعد)
2. **تنظيف QA units** بموافقة المالك فقط
3. دمج PRs التوثيقية المناسبة (#35 ثم #37 بعد تصحيح حالة apply إن لزم، و#36/#33 اختياري)
4. **dry-run** للمحتوى (راجع runbook في #35)
5. **import فعلي** بتفويض صريح فقط
6. **smoke test طالب كامل**
