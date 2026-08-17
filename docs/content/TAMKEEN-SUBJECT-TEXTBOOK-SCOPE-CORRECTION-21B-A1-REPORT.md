# TAMKEEN-SUBJECT-TEXTBOOK-SCOPE-CORRECTION-21B-A1

## 1. AUDIT (قبل التصحيح)

| مفتاح | القيمة قبل | ملاحظة |
|---|---|---|
| SEMESTER_IN_PRIMARY_IDENTITY | YES | عمود `semester` داخل الفهرس الفريد |
| SEMESTER_IN_UNIQUE_CONSTRAINT | YES | `subject_textbooks_scope_path_uidx (subject_id, track, COALESCE(semester,0), storage_path)` |
| SEMESTER_IN_ADMIN_FORM | YES | حقل "الفصل الدراسي" في `SubjectTextbooksManager.tsx` + `bindSubjectTextbookFile` |
| SEMESTER_IN_STUDENT_QUERY | YES | فلترة client-side في `listStudentTextbooks({ subjectId, semester })` |
| SEMESTER_IN_CACHE_KEY | NO | مفتاح التخزين = `textbook.id` فقط (`pdf-cache` / `resourceId`) |
| SEMESTER_IN_RLS | NO | سياسات RLS تعتمد على المادة والمسار فقط |
| SEMESTER_IN_OFFLINE_KEY | NO | نفس `resourceId` للفصلين |

## 2. النموذج

CURRENT_MODEL = subject × curriculum_track × semester × textbook
TARGET_MODEL = subject × curriculum_track × textbook/version (FULL_ACADEMIC_YEAR)

الهوية بعد التصحيح: `subject_id × curriculum_track_id × storage_path`،
مع `title, file_size, version, sha256, sort_order, is_active`
و metadata: `coverage = 'FULL_ACADEMIC_YEAR'`.
`semester` أُبقي كعمود مهجور (DEPRECATED) مقيّد بـ `CHECK (semester IS NULL)` — أقل تعديل ممكن، دون حذف جدول أو أعمدة مستخدمة.

## 3. النتائج

- SEMESTER_REMOVED_FROM_IDENTITY = YES
- FULL_YEAR_TEXTBOOK_MODEL = YES
- ADMIN_UPLOAD_ONCE = YES (اختيار الفصل أُزيل؛ يظهر بدلاً منه "كتاب واحد يغطي الفصلين")
- STUDENT_SAME_BOOK_BOTH_SEMESTERS = YES (`SubjectTextbooksSheet` يستعلم بالمادة فقط، `queryKey = ["subject-textbooks", subjectId]`)
- OFFLINE_DOWNLOAD_ONCE = YES

### OFFLINE CONTRACT
- DOWNLOAD_ONCE_FOR_BOTH_SEMESTERS = YES
- SAME_CACHE_KEY_FOR_BOTH_SEMESTERS = YES (`resourceId = textbook.id`)
- NO_DUPLICATE_LOCAL_BYTES = YES
- VERSION_UPDATE_PROPAGATES_TO_BOTH_SEMESTERS = YES (فحص `version` واحد لكلا العرضين)

### TRACK REUSE
- نفس `storage_path`/`sha256` يمكن ربطه بمسارين (صنعاء/عدن) دون تكرار bytes — تم إثباته في اختبار PG17 (TRACK_REUSE_OK).
- الصلاحية تبقى محكومة بـ RLS: `can_access_subject` + `user_can_access_subject_curriculum` + مسار الطالب.

## 4. الترحيل

- MIGRATION_REQUIRED = YES
- MIGRATION_FILE = `docs/migrations-pending/20260820010000_subject_textbook_scope_correction_21b_a1.sql` (PENDING — غير مطبّق)
- PRODUCTION_ROWS_CURRENT = 0
- PRODUCTION_WRITE = NO
- STORAGE_MUTATION = NO

### PG17 GATES (محلي)
| البوابة | النتيجة |
|---|---|
| Upgrade from current 21B production schema | APPLY_OK |
| Idempotent replay | REPLAY_OK |
| Fresh replay بعد rollback | FRESH_REPLAY_OK |
| Unique index بدون semester | PASS |
| CHECK (semester IS NULL) يمنع كتابة فصل | SEMESTER_WRITE_BLOCKED |
| منع تكرار نفس النطاق | DUP_BLOCKED |
| إعادة استخدام نفس الملف لمسار آخر | TRACK_REUSE_OK |
| RLS مفعّل + صلاحيات authenticated = SELECT فقط | PASS |
| Rollback | ROLLBACK_OK |

## 5. التعديلات في الكود
- `src/lib/textbooks/subject-textbook.server.ts` — إزالة semester من الهوية/الكتابة/الترتيب.
- `src/lib/api/subject-textbook.functions.ts` — إزالة `semesterSchema` من عقد الربط.
- `src/components/admin/SubjectTextbooksManager.tsx` — رفع مرة واحدة، بلا اختيار فصل.
- `src/lib/textbooks/subject-textbook-client.ts` + `src/components/textbooks/SubjectTextbooksSheet.tsx` — نفس الكتاب في الفصلين، بلا فلترة فصل.

## 6. النطاق المستبعد
لا رفع كتب حقيقية، لا 21B1، لا storage mutation، لا Publish/Deploy.

## الحكم

TAMKEEN_SUBJECT_TEXTBOOK_SCOPE_CORRECTION_21B_A1 = PASS_READY_FOR_SCOPE_CORRECTION_GATE

بانتظار: `APPROVED_PRODUCTION_21B_TEXTBOOK_SCOPE_CORRECTION_APPLY`
