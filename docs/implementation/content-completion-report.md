# Content completion report

Baseline: main 6ac874eaed7bc7e77765c8caadd4691eae7eb4c1. Staff entry: /admin/academic (existing content-manager route).

Replaces generic counts with a subject-scoped seven-component matrix using the existing lesson content contract, lifecycle/applicability overlay and student visibility gate. Filters cover grade, track (including subject-track links), subject, semester, lesson name and component state. Summary denominators include required components only. NA and optional components do not inflate gaps. Upload, readiness and publication are distinct; question drafts are not counted as published. Missing backend reads reject the report rather than turning unobserved records into missing content.

All catalog/content lists are paginated (200 rows); at most three lesson workers run concurrently. Abort signals follow scope changes. Requests use the caller's existing Supabase session and RLS. No SQL migration, service-role client, content write, school population or learner-data write. The original database has staff SELECT policies for textbook and lifecycle reads. The existing subject and unit management links remain available.

Full subject textbooks form a separate report section and Excel worksheet. Annual books cover both semesters without becoming multiple records; shared-track books can cover both tracks; inactive/unbound files and exercise books do not satisfy primary textbook coverage. Required term coverage follows the selected semester or known lesson semesters, not guessed requirements. Metadata completeness is not a binary PDF validity check.

Excel export contains lesson matrix, full textbooks, and primary textbook coverage gaps for the current filters. Text is written as string cells, not formulas. Editor names are not guessed; lesson modification attribution is unavailable in this source, while textbook creator IDs are exported when recorded. Publication is catalog/lifecycle visibility, not a semantic audit of every answer or offline artifact validation.

Validation: model/pagination/abort/error/UI tests, TypeScript, ESLint and production build. Dedicated Chromium fixture checks 390/1280px overflow, actual edit link navigation and the generated workbook's three sheets. Fixtures do not replace real-account acceptance. Screenshot review and CI required before release.

Recovery: revert application commit and republish. No database rollback needed. The review APK branches are separate and are not merged by this change.


## Seven-component operational reporting upgrade

The admin page now exposes a separate operational summary for each canonical lesson component:
`officialBookContent`, `tamkeenExplanationHtml`, `lessonSummaryHtml`, `mindMapHtml`,
`labExperimentHtml`, `officialBookQuestions`, and `selfTest`.

For every component the report shows:
- applicable lesson count, split into REQUIRED / OPTIONAL / NA;
- uploaded count and remaining-to-upload count;
- ready and published counts;
- remaining-to-publish count;
- review, invalid/correction and draft counts;
- upload percentage and publication percentage.

"Remaining to upload" is calculated only across applicable rows (REQUIRED + OPTIONAL). NA is never counted as a gap. OPTIONAL remains visibly separate so, for example, an optional lab experiment is not presented as a mandatory curriculum defect.

The lesson table can now be filtered by a specific component as well as lifecycle state. The per-component cards provide a direct "show lessons remaining to upload" action. Selecting one component reduces the matrix to that component while retaining the lesson remediation link.

Excel export now contains five worksheets:
1. `اكتمال المحتوى` — lesson matrix.
2. `كتب المادة الكاملة` — registered subject books.
3. `نواقص كتب المادة` — primary textbook coverage.
4. `ملخص المكونات السبعة` — one operational row per component.
5. `المتبقي حسب المكون` — actionable lesson/component backlog with upload state, publication state and remediation URL.

This upgrade is application-only. It adds no table, migration, service-role path or content write.


## General platform overview and hierarchical analytics

The page now starts with a platform-wide operational overview before a subject is selected. It reads the lesson catalog, editorial lifecycle rows, and the existing batch student-visibility gate in paginated/batched calls; it does not issue the expensive per-lesson content reads used by the deep subject report.

The general overview shows:
- total lessons in the selected scope;
- editorially managed versus legacy/unmanaged lessons;
- lessons visible to students;
- managed lessons whose REQUIRED lifecycle capabilities are all READY;
- managed lessons that still need work;
- REQUIRED capability backlog and readiness/publication percentages;
- a seven-component lifecycle summary across managed lessons.

Legacy/unmanaged lessons are reported separately and are excluded from lifecycle gap denominators. This prevents old content from being misclassified as missing merely because it predates the editorial lifecycle table.

The general analytics can be switched between five dimensions: grade, curriculum track, semester, subject, and lesson. Each row reports lesson counts, managed/visible counts, completed/attention counts, required-capability backlog and readiness percentage. Grade/track/semester/subject rows can be used as drill-down filters; lesson rows link directly to the lesson remediation workspace.

A separate attention table ranks up to 25 managed lessons by the number of REQUIRED components that are not READY and identifies missing, review, and draft components.

The general Excel export is independent from the subject export and contains eight sheets:
1. `نظرة عامة`
2. `المكونات السبعة العامة`
3. `تحليل الصف`
4. `تحليل المنهج`
5. `تحليل الفصل`
6. `تحليل المادة`
7. `تحليل الدرس`
8. `الدروس التي تحتاج معالجة`

The deep subject report remains unchanged in purpose: once a subject is selected it performs the direct content-table validation, textbook coverage, per-component upload/publication matrix, and per-lesson remediation links. The general report is deliberately lifecycle/visibility-oriented and never substitutes inferred global counts for the deeper content validation.
