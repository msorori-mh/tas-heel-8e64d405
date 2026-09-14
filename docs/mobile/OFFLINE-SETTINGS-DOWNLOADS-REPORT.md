# Offline content downloads in Settings

Baseline: original application `main` at `571a25baf770197a4627f88c3820f643bd65205f` (PR #236). Branch: `feat/offline-downloads-settings`. No staging migration, native shell, database, authentication, or service-worker changes.

## User-visible change

The existing Settings → المحتوى دون إنترنت accordion now contains the full-download option. Students explicitly prepare a preview of their grade/track subjects across both semesters, see the total size and excluded content, and start all subjects or one subject. Opening the section reads local saved records; it does not fetch manifests or download artifacts.

Downloads use the existing authenticated manifest API and verified private storage. Subjects download sequentially. Stop, network failure, or leaving the section preserves completed verified files. Retrying skips identical files. Account/grade/track changes reset the section and abort pending requests. The section shows saved bytes, incomplete downloads, available updates, and confirmed per-subject/all-pack deletion.

The previous bulk-download card and its import were removed from the subject page (only six route lines changed). The Settings shell, home, subject grid, units, lessons, reader controls, and data-saver behavior retain the current design. The obsolete card component was removed.

## Scope and limitations

“All” means the currently eligible downloadable content for the student's subjects in both semesters. Existing manifest eligibility and server access checks remain authoritative. Video, remote links, unpublished/unready or otherwise ineligible content are excluded and the preview says so. No request silently claims that these exclusions work offline.

The download must remain in the open Settings section; closing it pauses network requests, and completed files remain. This is file-level resume, not byte-range resume of a partially transferred file. No new content download occurs when Settings opens.

The existing cold-start/embedded Android implementation is reused. Browser evidence is not a physical closed-track Android test, and this change does not upload a new Play bundle.

## Verification

- Local focused regression: **153/153** across offline foundation, manifest/downloader, assessments, local lesson hydration, Settings service/client/UI, mobile placement contract, data saver and previous performance fixes.
- Includes 25 new behavioral checks: Settings catalog/queue (11), UI (8), client/account/cancellation (4), late-byte cancellation and pre-aborted downloader (2).
- TypeScript: PASS. Production build: PASS. Changed-file ESLint: no errors (one development-only fixture refresh warning).
- Chromium workflow covers 320, 390, 768 and 1280 px, zero content requests on initial open, metadata-only preview, both-semester downloads using real IndexedDB and downloader, interrupted transfer/resume without redownloading the first subject, offline saved lesson read and local list reopen, explicit cancellation, and confirmed deletion. CI/screenshots pending at the initial checkpoint.

Release gate at initial checkpoint: implementation and local regression PASS; browser/CI review pending. No production write or Play upload performed for this branch.
