# TAMKEEN_FINAL_REAL_TEXTBOOK_UPLOAD_AND_E2E_21B1 — REPORT

الحكم: **PASS_READY_FOR_UI_DEPLOY_GATE** (البيانات والكتب الحقيقية منشورة في الإنتاج؛ نشر واجهات الكتب موقوف على موافقتك)

## G0 — BASELINE قبل الرفع
```
HEAD_SHA=e5bb7a1c
SUBJECT_TEXTBOOK_ROWS=0 / STORAGE(subject-textbooks/%)=0
LESSON_RESOURCES=40 / lesson-pdfs objects=40
```

## 1–2 — FILES + CLASSIFICATION MATRIX
FILES_RECEIVED=7 (كلها كتب كاملة — لا ملفات دروس، لا Dummy، لا تجميع يدوي)

| FILE | SUBJECT | GRADE | BOOK_TYPE | COVERAGE_TYPE | SEM | PAGES | SIZE | SHA256 | FULL_BOOK | TRACK |
|---|---|---|---|---|---|---|---|---|---|---|
| القران_..._الجزء_1.pdf | القرآن الكريم | 1 ثانوي | MAIN_TEXTBOOK | SEMESTER_SPECIFIC | 1 | 66 | 32,136,004 | 021b42a6…39116 | YES | BOTH |
| القران_..._الجزء_2.pdf | القرآن الكريم | 1 ثانوي | MAIN_TEXTBOOK | SEMESTER_SPECIFIC | 2 | 56 | 29,312,640 | ea3b919b…4cdf4fce | YES | BOTH |
| الرياضيات_..._الجزء_1.pdf | الرياضيات | 1 ثانوي | MAIN_TEXTBOOK | SEMESTER_SPECIFIC | 1 | 120 | 3,332,642 | a0e9dfb2…4bed1 | YES | BOTH |
| الرياضيات_..._الجزء_2.pdf | الرياضيات | 1 ثانوي | MAIN_TEXTBOOK | SEMESTER_SPECIFIC | 2 | 128 | 3,911,893 | d2946ad2…b22ace | YES | BOTH |
| الرياضيات_..._كتاب_التمارين.pdf | الرياضيات | 1 ثانوي | EXERCISE_BOOK | FULL_ACADEMIC_YEAR | NULL | 48 | 3,582,372 | e257d4c4…8c65c | YES | BOTH |
| الكيمياء_-_صف_اول_ثانوي.pdf | الكيمياء | 1 ثانوي | MAIN_TEXTBOOK | FULL_ACADEMIC_YEAR | NULL | 192 | 24,309,600 | 92d4f68a…03877 | YES | BOTH |
| الكيمياء_..._كتاب_التمارين.pdf | الكيمياء | 1 ثانوي | EXERCISE_BOOK | FULL_ACADEMIC_YEAR | NULL | 40 | 2,830,599 | fcc0f238…39ee/…b539e0 | YES | BOTH |

التصنيف المبدئي المقترح تطابق مع الفحص الفعلي (عدد الصفحات وحجم كل ملف يثبت أنه كتاب كامل وليس درساً).

## 3 — TRACK RESOLUTION
المواد الثلاث مرتبطة فعلياً بالمسارين (`subject_curriculum_tracks`: aden + sanaa) ⇒
`TRACK_APPLICABILITY=BOTH` لكل كتاب ⇒ `curriculum_track_id = NULL` (صف منطقي واحد، كائن تخزين واحد، بلا تكرار bytes).
المسار مشتق من المحافظة (`current_student_track_id()`) — الطالب لا يختاره.

## 4–5 — UPLOAD + DATA MODEL (منفَّذ على الإنتاج)
```
LOGICAL_TEXTBOOK_ROWS=7
PHYSICAL_STORAGE_OBJECTS=7
DISTINCT_SHA256=7 / DISTINCT_STORAGE_PATHS=7
DUPLICATE_BYTES_CREATED=0
CASE A (MAIN+SEM1)  = القرآن ج1 b63438ac / الرياضيات ج1 cbb26df8   ✅
CASE B (MAIN+SEM2)  = القرآن ج2 7340854d / الرياضيات ج2 ae11af23   ✅
CASE C (MAIN+FULL)  = الكيمياء الأساسي 8f1a1882                    ✅
CASE D (EXER+FULL)  = الرياضيات التمارين 8873ab76 / الكيمياء 32646e84 ✅
```

## 6 — QURAN E2E (طالب حقيقي غير أدمن، 1 ثانوي)
```
QURAN_SEM1_VISIBLE_IN_SEM1=YES
QURAN_SEM1_VISIBLE_IN_SEM2=NO
QURAN_SEM2_VISIBLE_IN_SEM1=NO
QURAN_SEM2_VISIBLE_IN_SEM2=YES
CACHE_KEYS_DIFFER=YES (textbookId مختلف + version مختلف)
```

## 7 — MATHEMATICS E2E
```
MATH_MAIN_SEMESTER_ISOLATION=PASS (ج1 في الفصل1 فقط، ج2 في الفصل2 فقط)
MATH_EXERCISE_VISIBLE_IN_BOTH=YES
MATH_EXERCISE_TEXTBOOK_ID_SAME=YES (8873ab76…)
MATH_EXERCISE_CACHE_KEY_SAME=YES (نفس id + نفس version msxt1kkrchna90)
SECOND_EXERCISE_DOWNLOAD_REQUIRED=NO
```

## 8 — CHEMISTRY E2E
```
CHEM_MAIN_SAME_BOTH_SEMESTERS=YES (8f1a1882…)
CHEM_EXERCISE_SAME_BOTH_SEMESTERS=YES (32646e84…)
MAIN_AND_EXERCISE_TEXTBOOK_IDS_DIFFER=YES
MAIN_AND_EXERCISE_CACHE_KEYS_DIFFER=YES
```

## 9 — DOWNLOAD / OFFLINE (عبر مسار التسليم الآمن `/api/subject-textbook/{id}`)
| الكتاب | النمط | النتيجة |
|---|---|---|
| القرآن ج1 | SEMESTER_SPECIFIC | 200، content-length=32,136,004، x-file-version=msxt1bd1r728au |
| الكيمياء الأساسي | FULL_YEAR MAIN | 200، content-length=24,309,600، x-file-version=msxt1o1nda1zpo |
| الرياضيات التمارين | FULL_YEAR EXERCISE | 200، تنزيل كامل وSHA256 مطابق للملف الأصلي بايت-ببايت |
```
DOWNLOAD=PASS (بايت-ببايت مطابق) / RANGE=PASS (206، 1024 بايت)
ETag + x-file-version موجودان ⇒ REDOWNLOAD/UPDATE يعتمد نفس آلية 18C
OPEN_ONLINE=PASS
OPEN_OFFLINE / DELETE_LOCAL / REDOWNLOAD = CONTRACT_PASS (كاش IndexedDB لكل textbookId، منطق 18C غير معدّل هذه الجولة)
AUTO_DOWNLOAD=NO (كل تنزيل بطلب صريح من الطالب)
Android=Native PDF Renderer القائم (18C2) دون تغيير
```

## 10 — STUDENT UX
قائمة "كتب المنهج" لكل مادة مرتبة: الكتاب الأساسي ← كتاب التمارين ← ملحق، مع شارة النوع وسطر التغطية
(«كتاب الفصل الأول/الثاني» أو «كتاب الفصلين»)، وأزرار تنزيل/فتح/تحديث/حذف من الجهاز.

## 11 — SECURITY
```
AUTHORIZED_STUDENT=ALLOW (طالب حقيقي غير أدمن، 1 ثانوي، مسار صنعاء — رأى 5 كتب لكل فصل)
ANON=DENY (REST 401 permission denied / مسار التسليم 401)
WRONG_GRADE=DENY (can_access_subject + user_can_access_subject_curriculum)
WRONG_TRACK=DENY (curriculum_track_id IS NULL أو = current_student_track_id())
STUDENT_WRITE=ZERO (POST بحساب طالب ⇒ 403)
CURRICULUM_TRACK=مشتق من المحافظة، غير قابل لإدخال الطالب
```

## 12 — DEDUPLICATION
```
PHYSICAL_STORAGE_OBJECTS=7
LOGICAL_TEXTBOOK_ROWS=7
DUPLICATE_BYTES_CREATED=0
FULL_YEAR book ⇒ نفس الكائن ونفس مفتاح الكاش للفصلين
Different book ⇒ هوية كائن/كاش مستقلة
```

## 13 — LESSON REGRESSION
```
LESSON_RESOURCES=40 (unchanged)
QURAN_LESSON_01: 31/31 blocks — 3/3 figures (approval_manifest غير ممسوس)
18B=PASS
LESSON_PDF_LEGACY_PRESENT=YES (لم يُحذف أي PDF درس)
```

## 14 — DEPLOY
```
DEPLOY_REQUIRED=YES
HEAD_SHA=e5bb7a1c
CHANGED_FILES=
  docs/content/TAMKEEN-SUBJECT-TEXTBOOK-FINAL-REAL-E2E-21B1-REPORT.md
  (واجهات 21B-A2/A3 مطبقة سابقاً في الكود وغير منشورة:
   src/lib/textbooks/subject-textbook.server.ts,
   src/lib/textbooks/subject-textbook-client.ts,
   src/lib/api/subject-textbook.functions.ts,
   src/components/admin/SubjectTextbooksManager.tsx,
   src/components/textbooks/SubjectTextbooksSheet.tsx)
TYPECHECK=PASS
BUILD=PASS (preview)
SECURITY_REVIEW=NO_NEW_FINDINGS (لا Schema/RLS/RPC جديدة — بيانات فقط)
```
موقوف عند: `APPROVED_21B1_FLEXIBLE_TEXTBOOK_UI_DEPLOY`

## BLOCKERS
```
BLOCKERS=NONE (اختبارات الكاش دون إنترنت على الجهاز تبقى تحقّقاً يدوياً على الأندرويد بعد النشر)
```

## الحكم
```
TAMKEEN_SUBJECT_TEXTBOOK_FINAL_REAL_E2E_21B1 = PASS_READY_FOR_UI_DEPLOY_GATE
```
