# SECONDARY-K3-SWARM-SECURITY-SMOKE-01

- التاريخ: 2026-07-21
- النطاق: Smoke أمني لبوابات المحتوى بعد تطبيق migration PR #20 (`20260720120000_free_access_content_gates_security_hardening.sql` / نسخة Lovable المطابقة `20260720214619_ced976cd-9745-4f81-94c7-6aa2134b8fd8.sql`)
- القيود الملتزم بها: لا Deploy، لا SQL، لا تعديل بيانات، لا approve/reject، لا تعديل مستخدمين، لا تغيير صلاحيات. جميع فحوص runtime أدناه قراءة فقط (GET/POST RPC غير مُنشئ) بمفتاح anon العام.

## القرار النهائي

**`PASS_SECURITY_GATE_READY`**

مع توصية غير حاجبة: تشغيل قائمة التحقق المرئية للمسارات الإيجابية (قسم 4) من حسابات حقيقية قبل دمج PR #17/#18 أو معه.

## 1) نتائج البنود المطلوبة

| البند | النتيجة | مستوى الدليل |
|---|---|---|
| الطالب الصحيح يصل (درس + موارد + أسئلة subject_id) | **PASS** | SOURCE_VERIFIED |
| طالب صف خاطئ يُمنع | **PASS** | SOURCE_VERIFIED |
| طالب منهج خاطئ يُمنع | **PASS** | SOURCE_VERIFIED |
| anon يُمنع | **PASS** | **RUNTIME_VERIFIED** (8 تحققات حية) |
| admin محفوظ | **PASS** | SOURCE_VERIFIED |
| لا subscription_required | **PASS** | SOURCE_VERIFIED (بحث شامل: 0 نتائج) |
| لا مساس بالدفع/المحفظة | **PASS** | SOURCE_VERIFIED (تحليل commits) |

## 2) دليل runtime الحي (anon، قراءة فقط — 2026-07-21)

المشروع: `zbdhxyuulyovihjgeqbn.supabase.co` (المفتاح العام من `src/integrations/supabase/public-config.ts` — مفتاح anon آمن للنشر بطبيعته).

| # | الفحص | الاستجابة الفعلية | الحكم |
|---|---|---|---|
| A1 | `POST /rpc/can_access_lesson` (UUID وهمي) | HTTP 401 — `42501 permission denied for function can_access_lesson` | منع صحيح |
| A2 | `POST /rpc/can_access_subject` (UUID وهمي) | HTTP 401 — `42501 permission denied for function can_access_subject` | منع صحيح |
| A3 | `GET /lessons?limit=2` | HTTP 401 — `42501 permission denied for table lessons` | منع صحيح |
| A4 | `GET /questions?limit=2` | HTTP 401 — `42501 permission denied for table questions` | منع صحيح |
| A5 | `GET /subjects?limit=2` | HTTP 200 — `[]` (صفر صفوف) | لا تسريب بيانات |
| A6 | `POST /rpc/start_exam_session` | HTTP 401 — `unauthorized` | منع صحيح |
| A7 | `POST /rpc/get_exam_session_state` | HTTP 401 — `unauthorized` | منع صحيح |
| A8 | `GET /exam_sessions?limit=1` | HTTP 200 — `[]` (صفر صفوف) | لا تسريب بيانات |

**نتيجة جانبية مهمة:** رفض تنفيذ الدالتين على anon برمز `42501` هو تأكيد runtime مباشر أن REVOKE/GRANT الخاصة بالـ migration **مطبقة فعلياً على قاعدة البيانات** — يرفع حالة التطبيق من LIKELY_APPLIED إلى RUNTIME_CONFIRMED لجزء الصلاحيات.

## 3) دليل المصدر (من main `07116e46`)

### تعريف الدالتين المطبق (مطابق 100% لمحتوى PR #20 المدموج)
- `can_access_subject`: `auth.uid() IS NOT NULL AND (has_role(admin) OR (تطابق grade_uuid/grade_id مع subjects.grade_id) AND (مادة بلا مسار OR تطابق curriculum_track_id))` — `SECURITY DEFINER` + `search_path` ثابت.
- `can_access_lesson`: تفويض كامل لـ `can_access_subject(l.subject_id)`.
- الصلاحيات: `REVOKE ALL FROM PUBLIC` + `REVOKE EXECUTE FROM anon` + `GRANT EXECUTE TO authenticated` فقط.

### ربط السيناريوهات بالمصدر
- **طالب صحيح يصل (PASS):** فرع EXISTS يتحقق عند تطابق الصف (uuid أو legacy text) والمسار؛ الموارد وأسئلة subject_id تمر عبر نفس البوابة ولا تعتمد lesson_id إجبارياً.
- **صف خاطئ يُمنع (PASS):** شرط `p.grade_uuid = s.grade_id OR p.grade_id = s.grade_id::text` يسقط لأي صف مختلف.
- **منهج خاطئ يُمنع (PASS):** للمواد track-specific يلزم `p.curriculum_track_id = s.curriculum_track_id`؛ عدم توفره أو اختلافه يسقط الشرط.
- **admin محفوظ (PASS):** `public.has_role(auth.uid(), 'admin'::app_role)` فرع مستقل يسبق فحوص الطالب.
- **لا subscription_required (PASS):** بحث شامل في المستودع على main (`subscription_required`) = **0 نتائج**؛ migration `20260705160000` لا ترفع الخطأ أصلاً.
- **لا مساس بالدفع/المحفظة (PASS):** commits main منذ دمج PR #20 (`db5410e`, `bab11438`, `07116e4`) لمست فقط: ملف migration SQL + ملف `routeTree.gen.ts` المولّد. صفر تغييرات على صفحات admin المالية أو الدفع أو المحفظة؛ البنية المالية محفوظة كما هي.

## 4) قائمة تحقق مرئية موصى بها للمالك (مسارات إيجابية — غير حاجبة)

لأن إنشاء/تعديل حسابات ممنوع في هذا التفويض، المسارات الإيجابية تحققت من المصدر. يوصى بتأكيدها مرئياً قبل/مع دمج #17/#18:

1. بحساب طالب صف ثانوي صحيح: فتح درس كان محجوباً → يفتح، وموارده تظهر، وأسئلة مادته (subject_id) تظهر.
2. بحساب طالب صف مختلف (إن وُجد حساب قائم): محاولة فتح درس صف آخر → رسالة عدم إتاحة.
3. بحساب طالب مسار مختلف (إن وُجد): مادة track-specific لمسار آخر → منع.
4. بحساب admin: الوصول للدروس والمواد ولوحة الأدمن → طبيعي.
5. التأكد أن شاشات الدفع/المحفظة في الأدمن كما هي، ولا يظهر أي شرط دفع للطالب.

## 5) تأكيدات السلامة لهذا التفويض

- Deploy: لا. SQL: لا (REST/RPC قراءة فقط عبر PostgREST). تعديل بيانات: لا. approve/reject: لا. تعديل مستخدمين/صلاحيات: لا.
- إجمالي طلبات runtime: 8 طلبات قراءة فقط، كلها بمفتاح anon العام وUUIDs وهمية، ولم تنشئ أو تعدّل أي سجل.
