# SECONDARY-K3-SWARM-SECURITY-GATE-01 — بوابة الأمان: أدوات القرار والأوامر (للمالك فقط — لا تنفيذ من الوكلاء)

## 1. حالة الأدلة (Cycle-01)

| الدليل | المصدر | الاستنتاج |
|---|---|---|
| PR #20 مدموج في GitHub | merge commit `b213bee5` | المصدر مدموج |
| ملف migration مكرر `20260720214619_ced976cd-9745-4f81-94c7-6aa2134b8fd8.sql` أنشأه Lovable على main | commits `db5410e` + `07116e4` («Applied free access hardening», X-Lovable-Edit-ID) | Lovable أنشأ Migration مطابقاً — وهو نمط Lovable عند **تطبيق** migration على مشروع Supabase المرتبط |
| مطابقة المحتوى | مقارنة نصية Cycle-01 | DDL مطابق 100% لمحتوى migration PR #20 (الدوال + REVOKE/GRANT)، الفرق تعليقات فقط |
| التحقق من قاعدة البيانات مباشرة | غير متاح للوكلاء (ممنوع SQL production) | **غير مؤكد 100%** |

الخلاصة: `LIKELY_APPLIED` — مؤشر قوي جداً أن Lovable طبّق migration الأمان مساء 2026-07-20، لكن القرار النهائي يتطلب تحقق read-only عبر Lovable.

## 2. أمر Lovable رقم 1 — تحقق READ-ONLY (شغّله أولاً)

```text
المهمة: تحقق قراءة فقط من حالة تطبيق migration الأمان في قاعدة البيانات.

قواعد إلزامية:
- READ-ONLY فقط. لا تطبق Migration أو SQL، ولا Deploy أو Publish.
- لا تعدّل schema أو functions أو grants أو policies أو البيانات.
- لا تعرض أسراراً أو بيانات طلاب.
- إذا تعذر التحقق بالقراءة فقط، أعد NEEDS_USER_ACTION ولا تُصلح.

المطلوب:
1. اعرض تعريف public.can_access_subject(uuid) الحالي في قاعدة البيانات (من pg_proc / information_schema).
2. اعرض تعريف public.can_access_lesson(uuid) الحالي.
3. تحقق أن can_access_subject: تتطلب auth.uid()، وتحفظ تجاوز admin، وتطابق grade_uuid/grade_id، وتفرض curriculum_track، ولا تحتوي أي فحص اشتراك.
4. اعرض grants الحالية للدالتين على anon وauthenticated وPUBLIC وservice_role، ووضّح هل يملك anon أو PUBLIC أي EXECUTE.
5. أعد النتيجة بإحدى الصيغ حرفياً:
   - APPLIED_VERIFIED: التعريفات والـ grants مطابقة لمحتوى supabase/migrations/20260720120000_free_access_content_gates_security_hardening.sql
   - NOT_APPLIED_VERIFIED
   - UNKNOWN_INSUFFICIENT_READONLY_EVIDENCE

اختم حرفياً:
"تم تنفيذ فحص read-only فقط. لم يحدث Deploy أو SQL apply أو Migration apply أو schema/data write."
```

## 3. أمر Lovable رقم 2 — APPLY مشروط (فقط إذا عاد الأمر رقم 1 بـ NOT_APPLIED_VERIFIED)

```text
المهمة: تطبيق migration أمنية واحدة فقط بتفويض مستقل من المالك.

المسموح حصراً:
- طبّق فقط محتوى الملف: supabase/migrations/20260720120000_free_access_content_gates_security_hardening.sql
- لا تنشئ migration جديداً بمحتوى مختلف؛ المحتوى المطبق يجب أن يطابق الملف حرفياً.

الممنوع:
- أي SQL آخر، أي تعديل schema أو بيانات، أي Deploy أو Publish، أي تغيير في الدفع/المحفظة/الاشتراكات.

بعد التطبيق أعد تقريراً:
APPLY_MIGRATION_RESULT ثم: اسم الـ migration المطبق، هل نجح، تعريفي الدالتين بعد التطبيق، grants على anon/authenticated/PUBLIC، وأي أخطاء.
```

> ملاحظة: إن كان Lovable قد طبّقها فعلاً (ملف `20260720214619_...`) فالأمر رقم 1 سيؤكد ذلك ولا حاجة للأمر رقم 2.

## 4. مصفوفة الـ Smoke الأمني (بعد APPLIED_VERIFIED)

| # | السيناريو | المتوقع |
|---|---|---|
| S1 | طالب مسجل بصف/منهج صحيح يفتح درساً | وصول ناجح |
| S2 | طالب مسجل يطلب أسئلة subject_id بدون lesson_id | وصول ناجح لأسئلة مادته فقط |
| S3 | طالب بصف مختلف يحاول درس/مادة صف آخر | منع (can_access = false) |
| S4 | طالب بمسار منهجي خاطئ لمادة track-specific | منع |
| S5 | مستخدم anon (غير مسجل) يستدعي الدوال/المحتوى | منع — لا EXECUTE |
| S6 | حساب admin | وصول محفوظ (bypass سليم) |
| S7 | لا ظهور لرسالة subscription_required في أي مسار طالب | تأكيد |
| S8 | شاشات الدفع/المحفظة/الاشتراك | لا تغيير عن ما قبل الـ migration |

القاعدة: أي فشل في S3/S4/S5 = مخاطرة CRITICAL → إيقاف فوري وعدم دمج أي PR.

## 5. قرار WAVE-1

بانتظار تشغيل المالك للأمر رقم 1:
- إن عاد `APPLIED_VERIFIED` + Smoke ناجح → `PASS_SECURITY_GATE_READY` → فك تجميد دمج PR #17 ثم #18.
- إن عاد `NOT_APPLIED_VERIFIED` → شغّل الأمر رقم 2 ثم Smoke.
- إن عاد `UNKNOWN...` → `HOLD_SECURITY_GATE` وسجّل NEEDS_OWNER_DECISION.
