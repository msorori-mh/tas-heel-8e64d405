# TAMKEEN — STUDENT APP GO-LIVE READINESS AUDIT 16

الحالة: **PASS_WITH_PENDING_APPLY**
النطاق: تطبيق الطالب فقط (لا محتوى حقيقي مطلوب).
قيد ملزم: `SHARED_DB_APPLIES = ZERO` — لم تُطبَّق أي ترحيلات على القاعدة المشتركة في هذه الدفعة.

## 1. ملخص الحكم

| المحور | النتيجة |
| --- | --- |
| بناء التطبيق و TypeScript | PASS (لا أخطاء) |
| الاختبارات الآلية | PASS — 172/172 (node runner) + 135/135 (vitest) |
| RTL على الجوال (390×844) | PASS — كل الصفحات `dir=rtl` |
| الفيضان الأفقي | PASS — 0px على كل الصفحات المفحوصة |
| عزل الإجابات (Answer Leak Zero) | PASS — الاختبارات الثابتة لـ 14E/15B سارية |
| عزل المسار الدراسي | PASS — مفروض عبر RPCs و RLS |
| جاهزية البيانات | PENDING — ترحيل 15C ما زال في `migrations-pending` |

## 2. الفحص الميداني (Playwright — جوال 390×844، RTL)

| الصفحة | الاتجاه | الفيضان | الحالة |
| --- | --- | --- | --- |
| `/app` | rtl | 0px | تعمل |
| `/quick-review` | rtl | 0px | تعمل — حالة فارغة عربية سليمة (لا ملخصات بعد) |
| `/my-mistakes` | rtl | 0px | تعمل |
| `/performance` | rtl | 0px | تعرض إشعار «تحليل الأداء غير متاح حالياً» (RPC غير مطبَّق) |
| `/settings` | rtl | 0px | تعمل |
| `/subjects` | rtl | 0px | 404 مقصود — المسار غير موجود، صفحة الخطأ العربية تظهر بشكل صحيح |

## 3. العيوب المرصودة والمعالجة

### DEFECT-16-01 — دوران لا نهائي عند تعذر تحليل الأداء (FIXED)
عند غياب RPC (`PGRST202`) كان `useQuery` يعيد المحاولة وفق السياسة الافتراضية، فيبقى الطالب أمام مؤشر تحميل بدل الرسالة العربية — سلوك سيئ خصوصاً على الإنترنت الضعيف.
الإصلاح (واجهة فقط): تعطيل إعادة المحاولة لخطأ `PerformanceUnavailableError` في:
- `src/routes/_authenticated/performance.tsx`
- `src/routes/_authenticated/admin.learning-insights.performance.tsx`

التحقق: طلب واحد فقط للـRPC ثم ظهور الرسالة «تحليل الأداء غير متاح حالياً. حاول لاحقاً.» فوراً.

### DEFECT-16-02 — اختباران هشّان في تحقق أسماء المواد (FIXED)
`src/lib/content-import-subject-names.test.ts` كان يشترط `status === "pass"`، بينما يُصدر المحرك تشخيص `INFO` إرشادياً (اشتقاق `slug` من `subject_code`) يرفع الحالة إلى `warn` دون منع الاستيراد.
الإصلاح: تجاهل تشخيصات `INFO` عبر `blockingCodes`/`isCleanRun`. النتيجة 172/172 PASS.

## 4. البنود المعلقة قبل الإطلاق

1. **APPLY 15C** — `supabase/migrations-pending/20260818010000_unified_performance_dual_surface_15c.sql` بحاجة تفويض صريح للتطبيق على القاعدة المشتركة؛ حتى ذلك الحين تبقى صفحة `/performance` في الحالة غير المتاحة (بسلوك سليم).
2. **المحتوى** — الملخصات والدروس والنماذج الوزارية بانتظار فريق التشغيل؛ الحالات الفارغة عربية وواضحة ولا تعطل الاستخدام.

## 5. الحكم النهائي

`STUDENT_APP_GO_LIVE_READINESS_AUDIT_16 = PASS_WITH_PENDING_APPLY`
تطبيق الطالب جاهز تقنياً للإطلاق فور تطبيق ترحيل 15C وإدخال المحتوى.
