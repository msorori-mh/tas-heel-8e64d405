# Subject cards correction — stage 2

Decision: HOLD for visual acceptance. Implementation and local interaction checks pass.

Baseline: PR #220, `feat/mobile-subject-cards-compact-grid`, commit
`4f4beacb9ceae211fa17bb40a7706861a6793abf`.

Scope: student subject catalog presentation only. Existing grouping IDs, lesson
availability, curriculum selection, textbook queries, and role/data contracts
are preserved. No merge or production publication is part of this checkpoint.

## Changes

- Ordinary subjects and groups share one card renderer. Mobile cards specify a
  uniform 148px height, a two-line title beside its icon, numeric progress and a
  progress bar, and a labeled curriculum-books action with a 44px touch target.
- Group curriculum-books actions drill into real branches instead of assigning
  the group's books to its first subject. Each branch retains its existing ID.
- Known subject names take priority over stale stored icons. Quran uses BookOpen;
  unknown subjects can still use their configured icon.
- Both `/semesters` and `/semesters/$semester` use the same Radix RTL tabs.
  Direct semester URLs remain valid. Deep-link changes use router navigation.
- The mobile introduction and summary spacing are reduced. Subject accents,
  Arabic font, and the six-item/show-all interaction are retained.

## Local evidence

- TypeScript `tsc --noEmit`: PASS.
- Scoped ESLint, Prettier and `git diff --check`: PASS.
- Production build: PASS with TEST_ONLY public configuration placeholders.
- Focused tests: 24/24 PASS across four files. Two runtime tests include real
  route/tab/card/sheet rendering under jsdom, with synthetic account identity
  and cached query data. They cover group drill-down, the correct branch's
  textbook sheet, unavailable-subject books, progress changes between semesters,
  show-all reset, and icon selection. They are not real-account or browser E2E.
- The standalone real-component Vite fixture builds successfully.
- PDF.js emits its Node legacy-build notice during the jsdom sheet test; the
  PDF reader itself is not exercised by this presentation change.

## Remaining gate

Chromium layout and screenshot verification has NOT run. The committed CI job
is prepared to measure 320/360/390/430/768/1280px layouts and verify text fit,
card heights, touch targets, actual tab keyboard behavior, URL history and
navigation. The font, dimensions and final appearance remain unverified until
that job runs and its screenshots are inspected.

The automatic approval review rejected the push to the existing feature branch,
classifying implementation authorization as insufficient for external publication
of the modified source and new test/workflow files. The changes remain committed
locally. Explicit approval to push this correction to the named repository and
branch is required to run that gate and update the non-production branch preview.
