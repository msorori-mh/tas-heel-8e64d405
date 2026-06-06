
# الخطة: Security Fix S1 + Phase A1 Admin Foundation MVP

سننفّذ بالترتيب التالي. كل مرحلة منفصلة وقابلة للمراجعة قبل الانتقال للتالية.

---

## المرحلة 0 — Security Fix S1 (RLS على profiles)

### الوضع الحالي (تم فحصه)
سياسات `public.profiles` الفعلية الآن:

| السياسة | الأمر | USING | WITH CHECK |
|---|---|---|---|
| Admins can view all profiles | SELECT | `has_role(auth.uid(),'admin')` | — |
| Users can insert own profile | INSERT | — | `auth.uid() = user_id` ✅ |
| Users can update own profile | **UPDATE** | `auth.uid() = user_id` | **NULL ❌** |
| Users can view own profile | SELECT | `auth.uid() = user_id` | — |

المشكلة المؤكَّدة: سياسة UPDATE تسمح للمستخدم بتعديل صفّه بناءً على `USING` فقط، لكن غياب `WITH CHECK` يعني نظرياً يمكنه تحديث `user_id` إلى UUID مستخدم آخر (الصف لا يزال يطابق USING قبل التغيير) — ثغرة Account-Takeover صامتة.

### الإصلاح
Migration واحد يعيد إنشاء سياسة UPDATE فقط، مع `WITH CHECK` مطابق:

```sql
DROP POLICY "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

- لا يُلمَس أي policy آخر.
- لا تغييرات في schema أو الكود.
- التقرير سيُسلَّم: السياسة قبل/بعد + تأكيد أن باقي السياسات الأربع لم تتغيّر.

---

## المرحلة A1.1 — Admin Dashboard

### Route
- `src/routes/_authenticated/admin.tsx` → layout يعرض `<Outlet />` ويفحص `has_role(auth.uid(),'admin')`. غير الأدمن يُعاد توجيهه إلى `/app`.
- `src/routes/_authenticated/admin.index.tsx` → الـ Dashboard.

### Data
- استدعاء RPC `get_dashboard_stats()` الموجودة بالفعل (تتطلب admin وإلا تُلقي forbidden) عبر `createServerFn` + `useSuspenseQuery`.
- لو رجعت forbidden → redirect إلى `/app`.

### UI (Cards عربية RTL)
- إجمالي الطلاب
- إجمالي الصفوف / المواد / الوحدات (الوحدات بـ count مباشر إن لم تكن في الـ RPC) / الدروس / الأسئلة
- المحاولات الإجمالية (`unit_practice_attempts` count عبر serverFn admin-only)
- الاشتراكات النشطة / المعلّقة / المنتهية
- المدفوعات المعلّقة / المعتمدة / المرفوضة
- إجمالي الإيرادات

ملاحظة: `get_dashboard_stats()` لا يُرجع units/attempts صراحةً — سنضيف serverFn admin-only صغيرة (بدون RPC جديدة) تقرأ هاتين القيمتين فقط عبر `supabaseAdmin` بعد التحقق من has_role، أو نكتفي بما يرجعه الـ RPC ونؤجّل الباقي.

---

## المرحلة A1.2 — Admin Navigation Shell

### Route
نفس layout `admin.tsx` يحوي:
- Sidebar (RTL) فيه روابط:
  - لوحة التحكم → `/admin`
  - الصفوف → `/admin/grades` (Placeholder)
  - المواد → `/admin/subjects` (سيُنفَّذ فعلياً في A1.3)
  - الوحدات → `/admin/units` (Placeholder)
  - الدروس → `/admin/lessons` (Placeholder)
  - الأسئلة → `/admin/questions` (Placeholder)
- Header فيه اسم المستخدم + رابط العودة لـ `/app`.

### الصفحات Placeholder
كل واحدة تعرض عنوان القسم + رسالة "قريباً" + يحترم has_role check من الـ layout.

ملفات:
- `src/routes/_authenticated/admin.grades.tsx`
- `src/routes/_authenticated/admin.subjects.tsx` (سيُملأ في A1.3)
- `src/routes/_authenticated/admin.units.tsx`
- `src/routes/_authenticated/admin.lessons.tsx`
- `src/routes/_authenticated/admin.questions.tsx`

---

## المرحلة A1.3 — Subjects CRUD (أول CRUD حقيقي)

### الجدول `subjects` (مفحوص)
الحقول المطلوبة في الواجهة:
- name (NOT NULL)
- slug (NOT NULL) — يُولَّد تلقائياً من name مع إمكانية التعديل
- grade_id (NOT NULL) — Select من `grades`
- curriculum_track_id (nullable) — Select من `curriculum_tracks` (صنعاء / عدن / أخرى) + خيار "بدون"
- sort_order (default 0)
- color (default `#3b82f6`) — Color picker
- icon (default `BookOpen`) — نص (Lucide icon name) مع معاينة
- semester (nullable) — Select 1/2/null

### الـ RLS
- جدول `subjects` فيه policy للأدمن (الكتابة عبر has_role). سنستخدمه مباشرة عبر `supabase` client الموثَّق من المستخدم — لا حاجة لـ serverFn هنا، الـ RLS يكفي.
- لو RLS الحالي لا يسمح بـ insert/update/delete للأدمن، نضيف policy مفقودة في migration منفصل قبل تنفيذ A1.3 (سنفحص ذلك أول خطوة في A1.3).

### الصفحة `/admin/subjects`
- جدول يعرض كل المواد مع: الاسم، الصف، المسار، الترتيب، اللون، عدد الوحدات (subquery)، إجراءات.
- زر "إضافة مادة" → Dialog (sheet/modal) فيه form بالحقول أعلاه.
- زر تعديل لكل صف → نفس الـ Dialog يفتح بالقيم الحالية.
- زر حذف → AlertDialog تأكيد + رسالة "سيتم حذف كل الوحدات والدروس والأسئلة المرتبطة؟" — إذا كانت هناك وحدات مرتبطة، نمنع الحذف ونعرض تنبيهاً (نتحقق قبل DELETE).
- جميع نصوص الواجهة عربية، RTL، Cairo، Mobile-first.

### Validation (Zod في الـ client)
- name: 2-120 حرف
- slug: regex `^[a-z0-9-]+$` ، 2-120
- sort_order: integer ≥ 0
- color: regex hex
- icon: 2-40 حرف

---

## الترتيب الزمني والتسليم

| المرحلة | المخرج | يتطلب موافقة قبلها؟ |
|---|---|---|
| S1 | Migration واحد + تقرير قبل/بعد | نعم (migration tool) |
| A1.1 | Admin layout + Dashboard + serverFn للإحصاءات | لا (كود فقط) |
| A1.2 | Sidebar + 5 صفحات Placeholder | لا |
| A1.3 | Subjects CRUD كامل + RLS check | احتمال migration صغير لـ RLS |

كل مرحلة تنتهي بتقرير قصير قبل البدء في التي بعدها — لا قفز.

---

## ما لن نفعله في هذه الخطة
- لا CRUD للوحدات/الدروس/الأسئلة الآن (تأتي في A1.4–A1.6).
- لا Subscription Plans / Payments / Wallet / Reports.
- لا تعديل على واجهة الطالب.
- لا تغييرات في الـ schema باستثناء migration S1 + (احتمال) إضافة policy ناقصة على subjects.

## القسم التقني (مرجعي)
- جميع admin routes تحت `_authenticated/admin.*` لضمان أن SSR/prerender لا يضرب RPC محمية بـ session.
- has_role check يتم في `beforeLoad` للـ layout عبر serverFn `requireAdmin()` مع `requireSupabaseAuth` middleware.
- استخدام `createServerFn` للـ Dashboard stats بدلاً من استدعاء RPC مباشرة من الـ client لمزيد من الصلابة.
- التحقق من تسجيل `attachSupabaseAuth` في `src/start.ts` قبل أي serverFn محمية (سنفحص أول شيء في A1.1).
