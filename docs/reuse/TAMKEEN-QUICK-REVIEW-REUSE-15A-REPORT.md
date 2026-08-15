# TAMKEEN-QUICK-REVIEW-REUSE-15A — Quick Review (إعادة استخدام من مفاضلة)

- المرحلة: `TAMKEEN_QUICK_REVIEW_REUSE_15A`
- المرجع: `docs/reuse/TAMKEEN-MUFADALA-REUSE-INTEGRATION-READINESS-15.md`
- النطاق: **UI + Read-only**، بلا Migration، بلا كتابة في قاعدة البيانات.
- الحكم: **TAMKEEN_QUICK_REVIEW_REUSE_15A = PASS**

## 1. ما تم بناؤه

| الملف | الدور |
|---|---|
| `src/lib/review/review-format.ts` | منطق نقي: `chunkSummary` / `estimateReadMinutes` / `reviewPercent` |
| `src/lib/review/review-types.ts` | عقد `ReviewItem` و `ReviewGroup` + `buildReviewIndex` / `filterReviewItems` |
| `src/lib/review/review-paging.ts` | `fetchAllPaged` — Pagination صريح (إغلاق B5) بلا أي اعتماديات |
| `src/lib/review/review-data.ts` | قراءات Supabase المفلترة بالـ RLS فقط |
| `src/components/common/{EmptyState,ChipButton,ListSkeleton}.tsx` | عناصر واجهة عامة بـ Design Tokens |
| `src/components/review/FocusReader.tsx` | Focus Mode معاد استخدامه (Data-agnostic) |
| `src/components/review/ReviewCard.tsx` | بطاقة ملخص مع مؤشر PDF والاكتمال |
| `src/routes/_authenticated/quick-review.tsx` | الصفحة `/quick-review` |
| `src/components/home/QuickReviewEntry.tsx` | مدخل من الصفحة الرئيسية |

## 2. تصنيف إعادة الاستخدام مقابل مفاضلة

| العنصر | الحكم |
|---|---|
| Focus Mode (Swipe/Keyboard/Back-intercept/Scroll-lock) | **REUSE_AS_IS** بعد تجريده من البيانات |
| منطق تقطيع النص وتقدير زمن القراءة | **REUSE_AS_IS** |
| عقد `ReviewItem` | **ADAPT** — مشتق من دروس تمكين (يدعم الدرس بلا وحدة و `external_pdf`) |
| طبقة بيانات مفاضلة | **REJECT** — بُنيت طبقة تمكين الأصلية فوق RLS الحالي |
| بوابات الوصول / عزل المسار | **ALREADY_SOLVED_IN_TAMKEEN** — `can_access_lesson` / `can_access_subject` / TCS-2 |
| ألوان وهوية مفاضلة | **REJECT** — Design Tokens الخاصة بتمكين فقط |

## 3. الأمان

- لا توجد أي عملية `insert/update/upsert/delete` في كامل الميزة (مُختبَرة ثابتاً).
- لا تُقرأ أي أسئلة أو إجابات — الملخصات فقط، فلا مسار لتسريب الإجابات.
- الوصول يُحسم في قاعدة البيانات (RLS)، والواجهة تعرض ما يعيده الخادم فقط.
- مفتاح React Query مقيّد بـ (المستخدم، الصف، مسار المنهج) لمنع تسرب الكاش بين المسارات.

## 4. إغلاق B5 (سقف 1000 صف)

كل قراءة قائمة تمر عبر `fetchAllPaged` بـ `.range(from, to)` وحجم صفحة 500 وسقف أمان 40 صفحة، مع تقطيع معرّفات `IN` إلى دفعات 100. الاختبارات تثبت الاستمرار بعد الصفحة الممتلئة، والتوقف عند السقف، ورفع الخطأ بدل إرجاع بيانات ناقصة.

## 5. التحقق

| الفحص | النتيجة |
|---|---|
| `tests/review/quick-review-15a.test.ts` (منطق) | 15/15 PASS |
| `tests/review/quick-review-ui-15a.static.test.mjs` (حراس ثابتة) | 13/13 PASS |
| `tsgo --noEmit` | PASS |
| `vitest run` (خط الأساس) | 91/91 PASS |
| Migrations | لا شيء — صفر تغييرات في القاعدة |

## 6. الحكم النهائي

**TAMKEEN_QUICK_REVIEW_REUSE_15A = PASS**
