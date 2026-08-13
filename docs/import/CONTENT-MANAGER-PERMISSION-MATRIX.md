# مصفوفة صلاحيات مدير المحتوى (content_manager)

المرحلة: CURRICULUM_CONTENT_ENTRY_READINESS_13 — الضابط رقم 3.
الهدف: تحديد ما يُسمح به للمشغّل (يوسف) بدقة، وما يبقى حصراً للمشرف الكامل (Full Admin).

## الأدوار

| الدور | التعريف في قاعدة البيانات | الوصف |
| --- | --- | --- |
| `admin` (Full Admin) | `is_full_admin()` | صلاحية كاملة: الحذف النهائي، النشر، الأمان، المدفوعات. |
| `content_manager` | `is_content_staff()` | مشغّل المحتوى: يُدخل ويجهّز ويراجع، بلا حذف نهائي ولا نشر. |
| `moderator` / `user` | — | لا وصول إلى مركز الاستيراد ولا إلى إدارة المنهج. |

## المصفوفة

| العملية | content_manager | admin | نقطة الفرض |
| --- | --- | --- | --- |
| فتح مركز الاستيراد وتحميل القوالب | ✅ | ✅ | `useRequireAdminSection("content")` |
| فحص الملفات (Dry Run) | ✅ | ✅ | server fn — content staff |
| تجهيز الصفوف (Staging) | ✅ | ✅ | `assert_import_job_operator` |
| تنفيذ الاستيراد (Execute) داخل معاملة | ✅ | ✅ | `import_execute_template` |
| إنشاء/تعديل المواد والوحدات والدروس | ✅ | ✅ | RLS — `is_content_staff()` |
| تثبيت `subject_code` عند الإنشاء | ✅ | ✅ | `assert_natural_code_immutable` |
| تعديل `group_code` بعد تعيينه | ❌ | ❌ | `assert_subject_group_code_immutable` (ممنوع للجميع) |
| تعديل `group_name` | ✅ | ✅ | `assert_subject_group_name_consistent` (تناسق إلزامي) |
| إنشاء أسئلة كمسودات (Draft Revision) | ✅ | ✅ | `can_edit_question_bank` |
| مراجعة المحتوى وتغيير حالة المراجعة | ✅ | ✅ | `can_review_question_content` |
| نشر مراجعة سؤال (Publish Revision) | ❌ | ✅ | `can_publish_question_revision` (قدرة صريحة) |
| حذف مسودة سؤال | ✅ | ✅ | `can_delete_draft_question` |
| الحذف النهائي لأي عنصر منهج | ❌ | ✅ | `admin_curriculum_delete` (Full Admin فقط) |
| حذف مباشر عبر PostgREST | ❌ | ❌ | لا يوجد مسار في التطبيق — يثبته اختبار `no-direct-curriculum-delete` |
| منح القدرات (capability grants) | ❌ | ✅ | `grant_question_bank_capability` |
| إدارة المستخدمين والأدوار | ❌ | ✅ | RLS على `user_roles` |
| المدفوعات والمحفظة والاشتراكات | ❌ | ✅ | RLS + دوال المدفوعات |
| إعدادات الأمان والسجلات الحساسة | ❌ | ✅ | `audit_logs` / RLS |

## قواعد ثابتة

1. الحذف النهائي مسار واحد فقط: RPC `admin_curriculum_delete` بعد معاينة الأثر، ويُمنع إذا وُجد نشاط طالب.
2. النشر ليس صلاحية دور، بل قدرة صريحة تُمنح من المشرف الكامل.
3. `group_code` للعرض فقط ولا يدخل في أي قرار صلاحيات أو استهداف أسئلة.
4. كل تنفيذ استيراد يُسجَّل باسم المشغّل في سجل العمليات (`import_jobs.created_by`).
