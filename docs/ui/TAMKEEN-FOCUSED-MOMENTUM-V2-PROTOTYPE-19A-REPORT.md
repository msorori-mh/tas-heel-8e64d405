# TAMKEEN_FOCUSED_MOMENTUM_V2_PROTOTYPE_19A — Visual Prototype Report

الحالة: **PASS_VISUAL_REVIEW (بانتظار اعتماد المستخدم للصور الست)**

## 1. النطاق المنفذ

نموذج بصري لثلاث شاشات فقط، معزول تماماً عن بقية التطبيق:

| الشاشة | المسار |
| --- | --- |
| Landing | `/prototype/19a/landing` |
| Student Home | `/prototype/19a/home` |
| Lesson | `/prototype/19a/lesson` |
| فهرس النموذج | `/prototype/19a` |

الملفات:

- `src/routes/prototype.19a.tsx` (غلاف `.fm-v2` + `dir="rtl"`)
- `src/routes/prototype.19a.index.tsx` / `.landing.tsx` / `.home.tsx` / `.lesson.tsx`
- `src/components/prototype/fm-v2/primitives.tsx` (Bar, SectionTitle, BottomNav)
- `src/styles.css`: كتلة `.fm-v2` وأدوات `fm-card` / `fm-press` / `fm-bar` / `fm-grad` / `fm-read`

## 2. الالتزام بالقيود

- لا Migration، لا تغيير DB / RLS / RPC.
- لا Publish / Deploy.
- لا Feature expansion؛ كل التفاعلات بصرية فقط.
- لا تعميم للتصميم: كل الرموز اللونية داخل `.fm-v2` فقط، وبقية التطبيق لم تُمس.
- النص الرسمي غير معدّل: صفحة الدرس تستهلك `PILOT_20A1B_DOCUMENT` عبر
  `StructuredTextbookReader` نفسه المعتمد في 20A1B (نفس البلوكات، نفس الترتيب).

## 3. الهوية البصرية

| الوظيفة | القيمة |
| --- | --- |
| Primary (Deep Indigo/Navy) | `#1E2A63` |
| Interactive (Electric Blue) | `#0EA5E9` |
| Accent (Cyan) | `#06B6D4` |
| Success (Emerald) | `#10B981` |
| Challenge (Warm Amber) | `#F59E0B` |
| Warning (Soft Coral) | `#F87171` |
| Background (Warm Off-White) | `#FBFAF7` |
| Surface | `#FFFFFF` |
| Signature Gradient | Indigo → Purple → Cyan (شارة الهوية، زر «ابدأ مجانًا»، بطاقة Continue Learning، أشرطة التقدم) |

لكل وظيفة لون مستقل: التحدي = Amber، التنبيه = Coral، الإتقان = Emerald، التفاعل = Cyan/Blue.

## 4. الشاشات

### Landing (Mobile-first)
- تصغير الـ Hero إلى 62% من عرض العمود على الجوال (~35% أصغر من النسخة الأولى) لتظهر
  الرسالة والأزرار في الشاشة الأولى.
- التسلسل: تمكين → العنوان → الجملة التوضيحية → [ابدأ مجانًا] [لدي حساب] → الركائز الأربع Compact.
- الركائز: تعلم / تدرب / تحسن / استعد للوزاري في شبكة 2×2 على الجوال و 4×1 على الديسكتوب.

### Student Home (Personal Learning Feed)
الترتيب المطبق: تحية صغيرة ← واصل من حيث توقفت ← هدف اليوم ← أدوات سريعة
(مراجعة سريعة / أخطائي / مستواي / الوزاري) ← يحتاج انتباهك ← تحدي وزاري (ثالث ثانوي فقط)
← موادك.
- بطاقة Continue Learning هي أقوى عنصر بصري (إطار Gradient + زر تنفيذ بارز).
- لا توجد بطاقة «متاح مجاناً للطلاب» داخل الرئيسية.
- Gamification خفيف فقط: Streak، Daily Goal، نسب التقدم/الإتقان. لا عملات ولا متجر.

### Lesson
- أعلى الصفحة شارة «📖 محتوى الكتاب الرسمي» ثم Structured Reader مباشرة.
- عرض القراءة: 100% على الجوال، حد أقصى 860px على الديسكتوب، padding 14–16px، RTL.
- تمييز بصري لكل نوع: الأهداف (Indigo)، Quran Blocks (إطار Primary وخط 19–21px)،
  معاني الآيات (قائمة تعريف بحد جانبي)، الصور (Figure + caption)، نشاط الكتاب (Cyan)،
  التقويم (كتلة مفصولة مرقمة). لا بطاقة لكل فقرة.
- بعد المحتوى الرسمي تظهر القدرات الفعلية فقط: شرح تمكين، محاكاة، مراجعة، اختبر فهمك،
  اختبار الدرس، نسخة الكتاب الأصلية. لا عناصر «غير متوفر».

## 5. Typography
- نص عربي: 16px جوال / 17px ديسكتوب داخل القارئ، line-height 1.95–2.1.
- عناوين متدرجة 15/17/19/24–38px، ولا اعتماد مفرط على الرمادي الصغير.

## 6. Screenshots (6)

| # | الشاشة | العرض | الملف |
| --- | --- | --- | --- |
| 1 | Landing | 390px | `19a/landing-390.png` |
| 2 | Landing | 1440px | `19a/landing-1440.png` |
| 3 | Student Home | 390px | `19a/home-390.png` |
| 4 | Student Home | 1440px | `19a/home-1440.png` |
| 5 | Lesson | 390px | `19a/lesson-390.png` |
| 6 | Lesson | 1440px | `19a/lesson-1440.png` |

## 7. Acceptance

| المعيار | النتيجة | الدليل |
| --- | --- | --- |
| RTL | PASS | `dir="rtl"` مقاس آلياً على الشاشات الست |
| NO_HORIZONTAL_OVERFLOW | PASS | scrollWidth == clientWidth في 6/6 (390 و 1440) |
| MOBILE_FIRST | PASS | التصميم يبدأ من 390px ويتوسع بـ `sm:`/`lg:` |
| WHITE_SPACE_REDUCTION | PASS | تقليل الـ Hero والحشو الرأسي (py 3–4) |
| CARD_HIERARCHY | PASS | Continue Learning > Goal > بقية البطاقات، بدون بطاقات متداخلة |
| TYPOGRAPHY | PASS | المقاسات والـ line-height أعلاه |
| COLOR_HIERARCHY | PASS | لون مستقل لكل وظيفة |
| CONTENT_DENSITY | PASS | Compact but breathable |
| STUDENT_MOMENTUM | PASS | Feed شخصي يبدأ بالاستكمال ثم الهدف ثم نقاط الضعف |
| OFFICIAL_CONTENT_READABILITY | PASS | القارئ المعتمد 20A1B بعرض قراءة مضبوط |

## 8. الحكم

**TAMKEEN_FOCUSED_MOMENTUM_V2_PROTOTYPE_19A = PASS_VISUAL_REVIEW**

لن يبدأ 19B ولن يُعمَّم التصميم قبل اعتماد المستخدم للصور الست.

---

## 9. تحديث الصور (IMAGE_SET_REPLACEMENT)

القرار الوارد من المستخدم: `PROTOTYPE_LAYOUT_APPROVED / IMAGE_SET_REJECTED`
(السبب: الشخصية السابقة بمظهر خليجي — عقال).

### الصور الست الجديدة

| # | الملف | الموضع | المحتوى |
| --- | --- | --- | --- |
| 1 | `src/assets/prototype/fm-v2-hero.png` | Landing — Hero | طالب ثانوية يمني معاصر بسويتر كحلي، يراجع من هاتفه وكتابه |
| 2 | `src/assets/prototype/fm-v2-feature.png` | Landing — «لماذا تمكين؟» | طالبة بحجاب بسيط تنظّم خطة مراجعتها |
| 3 | `src/assets/prototype/fm-v2-continue.png` | Home — «واصل من حيث توقفت» | كتاب + حلقة تقدم + زر تشغيل |
| 4 | `src/assets/prototype/fm-v2-first-step.png` | Home — قبل «موادك» | بطاقات مواد وخطوة أولى مضيئة |
| 5 | `src/assets/prototype/fm-v2-official-book.png` | Lesson — ترويسة الدرس | كتاب رسمي بختم اعتماد |
| 6 | `src/assets/prototype/fm-v2-ministerial.png` | Home — «تحدي وزاري» | تقدم + كأس + ورقة اختبار |

كلها PNG بخلفية شفافة، مستوردة كـ ES6 imports، بنص بديل عربي و`loading="lazy"`
عدا الـ Hero.

### جدول القبول

| المعيار | النتيجة |
| --- | --- |
| LAYOUT_UNCHANGED | YES — لم يتغير ترتيب أي قسم؛ إضافة عناصر `<img>` فقط |
| IMAGE_SET_REPLACED | YES — 6/6 |
| YEMENI_STUDENT_FIT | YES — طالب/طالبة ثانوية عربية معاصرة بمظهر بسيط |
| NO_GULF_SPECIFIC_ATTIRE | YES — لا عقال ولا غترة ولا شماغ ولا أي زي دولة أخرى |
| NO_DB_CHANGE | YES — لا Migration ولا RLS ولا RPC |
| NO_DESIGN_GENERALIZATION | YES — التغيير داخل `/prototype/19a/*` فقط |
| NO_PUBLISH | YES |
| NO_HORIZONTAL_OVERFLOW | PASS — 6/6 (390px و1440px) |

### اللقطات المعاد التقاطها

`19a/landing-390.png`, `19a/landing-1440.png`, `19a/home-390.png`,
`19a/home-1440.png`, `19a/lesson-390.png`, `19a/lesson-1440.png`.

---

## 10. تلميع 19B (19B Polish)

بعد الاعتماد النهائي لـ 19A، نُفذت تلميعات محضة لا تُغيّر الهيكل أو المكونات:

### التغييرات

| الملف | التعديل | الدليل |
| --- | --- | --- |
| `src/routes/prototype.19a.landing.tsx` | تصغير صورة «لماذا تمكين؟» (`w-[46%]` → `w-[40%]`، `max-w-[170px]` → `max-w-[150px]`) وتقليص هوامش الأقسام (`mt-6` → `mt-5`، `mt-5` → `mt-4`) و padding البطاقة | توازن أفضل بين Hero والركائز |
| `src/routes/prototype.19a.home.tsx` | تقليص صور continue (`h-12` → `h-10`)، ministerial (`h-10` → `h-8`)، first-step (`h-11` → `h-9`)؛ تخفيف هوامش الأقسام (`mb-4` → `mb-3.5`) وتقليص padding الداخلي | كثافة مرنة دون ازدحام |
| `src/routes/prototype.19a.lesson.tsx` | تصغير شارة الكتاب الرسمي (`h-9` → `h-8`) وتقليص هوامش header و activities (`mt-5` → `mt-4`) | توازن الهيدر مع القارئ |

### القيود المحترمة

- لا تغيير في الترتيب أو المكونات.
- لا Migration / DB / RLS / RPC.
- لا تعميم للتصميم خارج `/prototype/19a/*`.
- لا Publish.

### جدول قبول 19B

| المعيار | النتيجة |
| --- | --- |
| LAYOUT_UNCHANGED | YES — تقليص المساحات والصور فقط |
| SECONDARY_IMAGES_REDUCED | YES — continue / ministerial / first-step / feature / official-book |
| SPACING_BALANCE_IMPROVED | YES — هوامش الأقسام والبطاقات مُخففة |
| NO_DB_CHANGE | YES |
| NO_DESIGN_GENERALIZATION | YES |
| NO_PUBLISH | YES |
| NO_HORIZONTAL_OVERFLOW | PASS — 6/6 (390px و1440px) |

### اللقطات المعاد التقاطها (19B)

`19b/landing-390.png`, `19b/landing-1440.png`, `19b/home-390.png`,
`19b/home-1440.png`, `19b/lesson-390.png`, `19b/lesson-1440.png`.

### الحكم النهائي

**TAMKEEN_FOCUSED_MOMENTUM_V2_PROTOTYPE_19A + 19B_POLISH = PASS_VISUAL_REVIEW**

جاهز للانتقال إلى المرحلة التالية (19C أو تعميم التصميم حسب قرار المنتج).
