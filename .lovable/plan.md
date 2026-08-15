# TAMKEEN_STUDENT_APP_OVERNIGHT_CLOSURE_BATCH_16

ثلاث مراحل متتابعة لإغلاق أكبر قدر من العمل التقني لتطبيق الطالب، بلا Publish ولا Deploy ولا أي تطبيق على القاعدة المشتركة (SHARED_DB_APPLIES = ZERO).

## PHASE 1 — تحليل الأداء الموحد 15C (منجز مسبقاً — مراجعة وإقفال فقط)

نُفّذت هذه المرحلة بالفعل في الدور السابق:
- الترحيل المعلق `supabase/migrations-pending/20260818010000_unified_performance_dual_surface_15c.sql` (RPC للطالب + RPC تجميعية للأدمن، بلا جداول أو نسخ محسوبة).
- صفحة الطالب `/performance` وصفحة الأدمن `/admin/learning-insights/performance` ومكتبة `unified-performance-api`.
- بروفة PG17 ناجحة 41/41، اختبارات ثابتة 10/10، فحص أنواع نظيف، والتقرير `docs/reuse/TAMKEEN-UNIFIED-PERFORMANCE-DUAL-SURFACE-15C-REPORT.md` بحكم PASS_READY_FOR_APPLY.

المتبقي في هذه المرحلة: إعادة تشغيل البروفة والاختبارات وفحص البناء بعد أي تعديل في المرحلتين التاليتين، وتثبيت الحكم في التقرير. لا Shared Apply.

## PHASE 2 — أثر الأدمن للمراجعة السريعة (15A_A)

صفحة جديدة `/admin/learning-insights/quick-review` تُظهر جاهزية المراجعة السريعة، بإعادة استخدام عقد `ReviewItem` ومكوّنات العرض الحالية:

- مؤشرات: إجمالي الدروس، دروس بملخص، دروس بلا ملخص، نسبة التغطية.
- تغطية حسب الصف، المسار، المادة، ثم جدول تفصيلي بالدروس.
- لكل درس: العنوان، المادة، الوحدة (قد تكون فارغة للدروس المباشرة)، نمط التسليم، وجود ملخص، حالة الجاهزية، رابط تحرير الدرس، ومعاينة الملخص بنفس بطاقة المراجعة.
- دروس PDF: جاهزة إذا كان لها ملخص فقط — بلا قراءة PDF وبلا توليد ملخصات آلياً.
- عوامل تصفية: الصف، المسار، المادة، حالة الجاهزية. مع ترقيم صفحات يمنع سقف 1000 صف.

الهدف `MIGRATION_REQUIRED = NO`. نقطة تحقق واحدة قبل ذلك: التأكد من أن حساب مدير المحتوى (وليس الأدمن الكامل فقط) يستطيع قراءة الملخصات عبر السياسات الحالية؛ إن لم يستطع، تُقيّد الصفحة على الأدمن الكامل ويُسجّل التوسيع كترحيل معلق لاحق — بلا أي تطبيق مشترك.

الاختبارات: درس داخل وحدة، درس مباشر، درس PDF، مادة مشتركة بين مسارات، حراسة دور الأدمن، مادة بلا ملخصات، جاهزية مختلطة، سلامة أكثر من 1000 درس، وقابلية الاستخدام على الجوال وRTL.

التقرير: `docs/reuse/TAMKEEN-QUICK-REVIEW-ADMIN-READINESS-15A-A-REPORT.md`.

## PHASE 3 — تدقيق جاهزية الإطلاق (Audit 16)

تدقيق وتحقق وإصلاحات عيوب صغيرة فقط — بلا توسيع ميزات. يغطي المحاور C1–C11:

المصادقة والملف الشخصي، بوابات الاشتراك والوصول (خادم + واجهة)، رحلة الطالب الكاملة عبر fixtures معزولة، الإشعارات (تدقيق فقط)، الجوال وRTL بلقطات Playwright، الإنترنت الضعيف (عدد الطلبات، أحجام الحمولات، حالات التحميل، الترقيم)، حالات الخطأ والفراغ بالعربية، الانحدار الأمني (RLS، منح الـRPC، عزل الطلاب والمسارات، ANSWER_LEAK = ZERO)، ومصفوفة الازدواج طالب/أدمن لكل ميزة رئيسية، ثم انحدار شامل (استيراد 01–09، TCS-2، الدروس المباشرة، PDF، بنك الأسئلة، الاختبارات العادية، 14A–14H، 15A/15B/15C) مع فحص الأنواع والبناء.

تصنيف كل ملاحظة: MUST_FIX_BEFORE_LAUNCH / SHOULD_FIX_BEFORE_LAUNCH / SAFE_AFTER_LAUNCH / OPTIONAL_V2 / PHYSICAL_DEVICE_REQUIRED / CONTENT_DEPENDENT. أي سلوك خاص بتطبيق أندرويد لا يمكن إثباته محلياً يُسجّل PHYSICAL_DEVICE_REQUIRED ولا يُدّعى نجاحه.

التقرير: `docs/go-live/TAMKEEN-STUDENT-APP-GO-LIVE-READINESS-AUDIT-16.md` بجميع حقول الحالة المطلوبة.

## الملخص النهائي

`docs/go-live/TAMKEEN-OVERNIGHT-CLOSURE-BATCH-16-SUMMARY.md` بالحقول المطلوبة فقط، مع تثبيت `SHARED_DB_APPLIES = ZERO`.

## تفاصيل تقنية

- الملفات الجديدة المتوقعة: `src/lib/review/admin-review-coverage.ts`، `src/routes/_authenticated/admin.learning-insights.quick-review.tsx`، رابط في `AdminLayout` و`admin-route-access`، اختبار ثابت `tests/import/quick-review-admin-readiness-15a-a.test.ts`، وتقارير Markdown.
- الاشتقاق من `lessons` + `lesson_summaries` + `subjects` + `units` + `subject_curriculum_tracks` بقراءات مرقّمة الصفحات، بلا جداول أو أعمدة جديدة.
- أي عيب يحتاج SQL: يُصلح محلياً على PG17 ويوضع في `supabase/migrations-pending/` بانتظار بوابة تطبيق منفصلة.
- التحقق: بروفات PG17 القائمة + `bunx vitest run` + `bunx tsgo --noEmit` + بناء، ولقطات Playwright للجوال.
