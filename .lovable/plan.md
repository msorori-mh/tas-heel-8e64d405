# PAST_MINISTERIAL_EXAMS_ARCHITECTURE_14A — إعادة الاعتماد على TCS-2

بعد اعتماد `SHARED_CURRICULUM_SUBJECT_MAPPING_13C = PASS`، أصبح تصميم 14A الحالي مبنياً على افتراض قديم: أن المسار محفوظ داخل `subjects.curriculum_track_id` (مادة لكل مسار). هذا لم يعد صحيحاً — التوفّر صار في `subject_curriculum_tracks`.

هذه المرحلة **تصميم/توثيق فقط**: لا Migration، لا كتابة على القاعدة، لا UI. المخرجات مستندات معتمدة يُبنى عليها التنفيذ في مرحلة لاحقة (14B).

## 1) تحديث وثيقة 14A إلى النموذج المشترك

في `docs/ministerial-exams/PAST-MINISTERIAL-EXAMS-ARCHITECTURE-14A.md`:

- تصحيح قسم AUDIT: المادة قد تكون مشتركة بين صنعاء وعدن؛ العزل لم يعد على مستوى `subjects` بل على مستوى **النموذج الوزاري نفسه**.
- تثبيت المبدأ صراحة:
  ```text
  Shared Subject ≠ Shared Ministerial Exam
  subject  = identity (TCS-2, track-independent)
  model    = (subject_id, curriculum_track_id, academic_year, exam_round, model_label)
  ```
- استبدال شرط الاتساق القديم (subject.track == model.track) بالبوابة الجديدة:
  ```text
  ministerial_exam_models.curriculum_track_id
  MUST EXIST IN subject_curriculum_tracks(subject_id, curriculum_track_id)
  AND that assignment MUST be active
  ```
- تشديد `assert_ministerial_question_publishable`: يكفي أن يشير `question_targets` إلى نفس `subject_id` — لا يجوز اشتراط تطابق مسار على السؤال، لأن سؤال المادة المشتركة صالح للمسارين. عزل المسار يتم على مستوى النموذج فقط.
- إبقاء بقية القرارات كما اعتُمدت: إعادة استخدام `exam_templates(mode='ministry')`، `exam_sessions/questions/answers`، رفض تخزين الإجابات داخل جداول الوزاري، رفض `past_exam_attempts`، `exam_sessions.ministerial_model_id` بدل جدول ربط ثالث.

## 2) حالات اختبار الخروج (تُضاف للوثيقة، تُنفَّذ في 14B)

```text
مادة مشتركة + نموذج صنعاء 2025        ALLOW
مادة مشتركة + نموذج عدن 2025          ALLOW  (صفّان مستقلان)
نموذج بمسار غير مرتبط بالمادة          DENY
نموذج على مادة بلا ارتباطات مسار       DENY
سؤال منشور مستهدف للمادة المشتركة      ALLOW في المسارين
طالب صنعاء يرى نموذج عدن              DENY
تكرار (مادة, مسار, سنة, دور, نموذج)    DENY (UNIQUE)
```

## 3) تحديث تعليمات المشغّل (يوسف)

إضافة الجملة الحاكمة صراحةً، وبنفس الصياغة، في:
- `docs/import/OPERATOR-RUNBOOK-AR.md` (قسم جديد "المادة المشتركة بين المسارات" قبل الخطوات)
- `docs/import/NAMING-CONVENTION.md` (تعزيز البند الموجود)

النص:
```text
لا تنشئ نسخة من المادة لكل مسار إذا كان المحتوى واحداً؛
استخدم مادة واحدة وحدد جميع المسارات التي تتاح فيها من القالب السياقي.
```

مع توضيح الحالتين:
- محتوى واحد → مادة واحدة، `track_codes = sanaa|aden`، والوحدات والدروس والأسئلة تُدخل مرة واحدة.
- محتوى مختلف فعلاً → مادتان مستقلتان، كل واحدة بمسارها.
- أي قالب TCS-1 قديم مرفوض: الحزمة الرسمية الوحيدة هي القوالب التسعة المولّدة بـ TCS-2.

وتحديث ترويسة مرحلة الرنبوك إلى `SHARED_CURRICULUM_SUBJECT_MAPPING_13C` وإعادة توليد حزمة المشغّل (ZIP) لتحمل النصوص المحدثة.

## تفاصيل تقنية

- لا تغيير على `src/` باستثناء ما يلزم لإعادة توليد حزمة المشغّل من الأدلة المحدثة (`scripts/build-operator-pack.mjs` يقرأ الملفات كما هي، فالأرجح لا تعديل كود).
- لا استدعاء لأداة الترحيل في هذه المرحلة؛ نصوص SQL المقترحة تبقى داخل الوثيقة فقط.
- مخرَج المرحلة: `PAST_MINISTERIAL_EXAMS_ARCHITECTURE_14A = RE-APPROVED (TCS-2 aligned)` وتحديد 14B كمرحلة التنفيذ (Migration + RPC + UI).
