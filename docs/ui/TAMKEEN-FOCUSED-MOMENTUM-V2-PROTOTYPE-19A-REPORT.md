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
