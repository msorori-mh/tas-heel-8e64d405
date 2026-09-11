# Subject cards correction — stage 2

Release decision: HOLD for user visual acceptance; keep PR #220 draft.
The PR description records the latest verified source SHA, CI result and screenshots.

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

## Browser gate and review

The `Student subject cards UI` workflow runs Chromium against the actual route,
tab, card and sheet components with synthetic account identity and cached query
data. It measures 320/360/390/430/768/1280px layouts and checks title fit, card
heights, touch targets, tab keyboard behavior, URL history and subject navigation.
The test records geometry and screenshots as a GitHub Actions artifact. This
isolated UI fixture does not authenticate a real student or modify production.

The first Chromium run detected a text-fit failure at 320px. Geometry showed
Cairo text extending 3px beyond the 20px line box. The follow-up uses 26px mobile
line boxes and reallocates internal spacing while retaining 148px cards and
44px books actions. A green build alone does not establish visual acceptance;
the latest browser evidence is recorded in the PR description.

The initial push was held by automatic approval review. The user then explicitly
approved updating the existing feature branch and running screenshot verification,
while keeping merge on hold. The approved local tree was published through the
GitHub connector as `1234d378f72a0a81ae059ac28b33dedc2584e678`; its tree hash exactly
matches the approved local `74abc3f` checkpoint.
