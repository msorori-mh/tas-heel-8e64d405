## المشكلة

ثلاثة طلاب من محافظة مأرب يحملون `curriculum_track_id = sanaa` في `profiles` رغم أن `governorate_curriculum_map` يسمح بمنهج **عدن فقط** لمأرب.

سبب البقاء: هذه الصفوف أُنشئت/حُدّثت **قبل** migration Fix-A الذي ثبّت الـ default ودرّب الـ trigger على التحقق. تعليمات Fix-A نصّت على عدم تحديث الـ profiles الحالية تلقائيًا، فبقيت بياناتهم بحالة غير صالحة.

الـ trigger الحالي + الخريطة + الـ defaults **كلها صحيحة الآن** — أي طالب جديد يختار مأرب يحصل تلقائيًا على عدن. الإصلاح المطلوب يخص فقط الـ legacy rows.

## نطاق الإصلاح (Backfill فقط)

Migration واحدة تصحّح الصفوف التي `curriculum_track_id` فيها **غير موجود في `governorate_curriculum_map`** لمحافظة الطالب — تستبدله بـ `governorates.default_curriculum_track_id` للمحافظة.

### المعيار الصارم للتحديث

```sql
UPDATE public.profiles p
SET curriculum_track_id = g.default_curriculum_track_id
FROM public.governorates g
WHERE p.governorate_id = g.id
  AND p.governorate_id IS NOT NULL
  AND p.curriculum_track_id IS NOT NULL
  AND g.default_curriculum_track_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.governorate_curriculum_map m
    WHERE m.governorate_id = p.governorate_id
      AND m.curriculum_track_id = p.curriculum_track_id
  );
```

هذا الشرط:
- يصحّح فقط الصفوف **غير الصالحة** (track ليس في خريطة المحافظة).
- لا يلمس تعز (لأن sanaa و aden كلاهما مسموح في الخريطة لتعز).
- لا يلمس أي طالب اختار track صالح طوعيًا.
- لا يلمس profiles بدون `governorate_id` أو بدون `curriculum_track_id`.

العدد المتوقع للصفوف المتأثرة: **3** (طلاب مأرب الحاليون).

## ما لن يتم تغييره

- لا تعديل على `governorate_curriculum_map`.
- لا تعديل على `governorates.default_curriculum_track_id`.
- لا تعديل على trigger `sync_profile_curriculum_track`.
- لا تعديل على RLS أو grants.
- لا تعديل على UI، complete-profile، settings، EditProfileDialog.
- لا تعديل على المحتوى/الاختبارات/الاشتراكات.

## التحقق بعد التشغيل

```sql
-- يجب = 0
SELECT COUNT(*) FROM profiles p
WHERE p.governorate_id IS NOT NULL
  AND p.curriculum_track_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM governorate_curriculum_map m
    WHERE m.governorate_id=p.governorate_id
      AND m.curriculum_track_id=p.curriculum_track_id
  );

-- يجب أن يُظهر aden لطلاب مأرب الثلاثة
SELECT p.full_name, g.name, ct.track_code
FROM profiles p
JOIN governorates g ON g.id=p.governorate_id
JOIN curriculum_tracks ct ON ct.id=p.curriculum_track_id
WHERE g.name='مأرب';
```

## النتيجة المتوقعة في الواجهة

بعد تشغيل الـ migration وإعادة تحميل التطبيق:
- الطالبة `ريما مختار alsorori` ستشاهد **منهج عدن** بدل **منهج صنعاء**.
- بطاقة `StudentProfileCard` ستعرض شارة "منهج عدن".
- المواد المعروضة في `/app` ستُفلتر تلقائيًا بـ `curriculum_track_id=aden` (المنطق موجود مسبقًا — لا تعديل كود).

## ملف واحد فقط

`supabase/migrations/<timestamp>_backfill_marib_curriculum_track.sql`
