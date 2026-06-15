# إصلاح التنقل داخل لوحة الإدارة

## المشكلة
- في TanStack Router، الملف `src/routes/_authenticated/admin.tsx` أصبح **parent route** لكل الملفات `admin.students.tsx` و `admin.subjects.tsx` و `admin.units.tsx` ... إلخ.
- أي parent route عنده أبناء **يجب** أن يعرض `<Outlet />` لتُركَّب الصفحة الفرعية بداخله.
- الملف الحالي `admin.tsx` يعرض UI لوحة الإدارة مباشرة (Stats + Cards) بدون `<Outlet />`، فعند الانتقال إلى `/admin/students` المسار يتطابق لكن لا شيء يظهر — تبقى لوحة الإدارة معروضة وكأن الزر لا يعمل.

## الحل
فصل المسؤوليتين:

1. **`admin.tsx`** يصبح Layout بسيطاً يعرض `<Outlet />` فقط (بدون أي UI خاص بالـ dashboard).
2. **`admin.index.tsx`** (ملف جديد) يحتوي على كل محتوى لوحة الإدارة الحالي (الإحصائيات، البطاقات، الترحيب) ويُركّب تلقائياً عند زيارة `/admin`.

بهذا:
- زيارة `/admin` → يعمل `admin.tsx` (layout) + `admin.index.tsx` (المحتوى) → نفس الشكل الحالي بالضبط.
- زيارة `/admin/students` → يعمل `admin.tsx` (layout) + `admin.students.tsx` → تظهر صفحة الطلاب فعلياً.
- نفس الشيء لبقية الأقسام: المواد، الوحدات، الدروس، الأسئلة، قوالب الاختبارات، طلبات الدفع، المحتوى الدراسي.

## الملفات المعدّلة

```text
src/routes/_authenticated/admin.tsx         (تعديل) → Layout يعرض <Outlet /> فقط
src/routes/_authenticated/admin.index.tsx   (جديد)  → محتوى لوحة الإدارة الحالي
```

## ملاحظات
- لن أعدّل أي صفحة فرعية أخرى (الطلاب، المواد، ...). جميعها تحتوي مسبقاً على `createFileRoute` صحيح و `AdminLayout` كـ wrapper.
- لن أعدّل `AdminLayout.tsx` أو روابط الـ sidebar — كلها سليمة.
- لا تغييرات على قاعدة البيانات أو الـ RLS.

## بعد التنفيذ
سيكفي إعادة تحميل الصفحة، وستعمل كل أزرار التنقل في الـ sidebar وكذلك بطاقات لوحة الإدارة بشكل صحيح.
