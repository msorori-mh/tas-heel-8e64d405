# Content completion report

Baseline: main 6ac874eaed7bc7e77765c8caadd4691eae7eb4c1. Staff entry: /admin/academic (existing content-manager route).

Replaces generic counts with a subject-scoped seven-component matrix using the existing lesson content contract, lifecycle/applicability overlay and student visibility gate. Filters cover grade, track (including subject-track links), subject, semester, lesson name and component state. Summary denominators include required components only. NA and optional components do not inflate gaps. Upload, readiness and publication are distinct; question drafts are not counted as published. Missing backend reads reject the report rather than turning unobserved records into missing content.

All catalog/content lists are paginated (200 rows); at most three lesson workers run concurrently. Abort signals follow scope changes. Requests use the caller's existing Supabase session and RLS. No SQL migration, service-role client, content write, school population or learner-data write. The original database has staff SELECT policies for textbook and lifecycle reads. The existing subject and unit management links remain available.

Full subject textbooks form a separate report section and Excel worksheet. Annual books cover both semesters without becoming multiple records; shared-track books can cover both tracks; inactive/unbound files and exercise books do not satisfy primary textbook coverage. Required term coverage follows the selected semester or known lesson semesters, not guessed requirements. Metadata completeness is not a binary PDF validity check.

Excel export contains lesson matrix, full textbooks, and primary textbook coverage gaps for the current filters. Text is written as string cells, not formulas. Editor names are not guessed; lesson modification attribution is unavailable in this source, while textbook creator IDs are exported when recorded. Publication is catalog/lifecycle visibility, not a semantic audit of every answer or offline artifact validation.

Validation: model/pagination/abort/error/UI tests, TypeScript, ESLint and production build. Dedicated Chromium fixture checks 390/1280px overflow, actual edit link navigation and the generated workbook's three sheets. Fixtures do not replace real-account acceptance. Screenshot review and CI required before release.

Recovery: revert application commit and republish. No database rollback needed. The review APK branches are separate and are not merged by this change.
