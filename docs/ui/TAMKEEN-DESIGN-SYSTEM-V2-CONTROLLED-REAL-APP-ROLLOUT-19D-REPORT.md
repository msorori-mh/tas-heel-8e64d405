# TAMKEEN_DESIGN_SYSTEM_V2_CONTROLLED_REAL_APP_ROLLOUT_19D — Report

19D_BASE_SHA=d6981ea09092496e2e4de555dfc6ac9df96dd243
19D_HEAD_SHA=(source rollout in working tree at report time; commit created by platform)

## Scope applied
| Item | Value |
|---|---|
| LANDING_REAL_APP | YES — `src/routes/index.tsx` (hero rebuilt on FM V2 direction + pillars row) |
| STUDENT_HOME_REAL_APP | YES — `src/routes/_authenticated/app.tsx` (order: greeting → continue → daily goal → quick actions → needs attention/progress → subjects → achievements/AI) |
| LESSON_REAL_APP | YES — `src/routes/_authenticated/lessons.$lessonId.tsx` (DS scope on the article root only) |
| ROUTE_LEVEL_OPT_IN | YES — `.ds-v2` class applied per screen root |
| GLOBAL_DS_V2_ENABLED | NO — `DS_V2_APP_ROLLOUT_ENABLED = false` untouched |
| BUSINESS_LOGIC_CHANGED | NO |
| DB_CHANGED | NO |
| RLS_RPC_CHANGED | NO |
| STRUCTURED_READER_PRESERVED | YES — 20A1B reader untouched |
| DYNAMIC_CAPABILITIES_PRESERVED | YES — 18B capability engine untouched |
| HERO_PROJECT_MANAGED | YES — `src/assets/hero-tamkeen.png` (real project asset) |
| EXTERNAL_CDN_DEPENDENCY | NO — real landing no longer imports the CDN pointer (prototype 19A still does, by design) |

## Responsive / quality
| Check | Result |
|---|---|
| MOBILE_390 | PASS (landing/home/lesson, overflow=0) |
| TABLET_768 | PASS (overflow=0) |
| DESKTOP_1440 | PASS (overflow=0) |
| RTL | PASS |
| TOUCH_TARGETS | PASS |
| READABLE_LINE_LENGTH | PASS (max-[46ch] hero copy, fm-read for official content) |
| RESPONSIVE_IMAGES | PASS (width/height set, fluid widths) |
| TYPECHECK | PASS |
| CONSOLE_ERRORS | ZERO |
| VISUAL_REGRESSION | PASS — direction matches approved 19A/19B |
| FUNCTIONAL_REGRESSION | PASS on landing CTAs (`/auth?mode=signup|login`), home navigation, bottom nav, breadcrumbs |
| NO_DUPLICATE_COMPONENTS | PASS |
| NO_RAW_HEX_WHERE_DS_TOKEN_EXISTS | PASS |
| NO_UNRELATED_REFACTOR | PASS |
| PUBLISH | NO |
| DEPLOY | NO |

Screenshots: `/tmp/browser/19d/{landing,home,lesson}-{390,768,1440}.png`.

## BLOCKERS
- LESSON_CONTENT_VISUAL_PARTIAL: the available test session resolves to an admin account without a student curriculum track, so lesson pages render the real gated state ("هذا الدرس غير متاح"). Scope/RTL/overflow/console verified; full structured-reader visual re-check needs a student session with track access.

## Verdict
TAMKEEN_DESIGN_SYSTEM_V2_CONTROLLED_REAL_APP_ROLLOUT_19D = PASS_READY_FOR_PRODUCTION_BASELINE_CHECK
(with the lesson content visual re-check noted above)

---

## TAMKEEN_19D_AUTHORIZED_LESSON_VISUAL_CLOSURE (read-only verification)

Session: existing authorized student `omh692022@gmail.com` (grade 1ث `ae2fd78d…`, curriculum track `7751f472…`, non-admin). No data created, no permissions widened, no writes.
Lesson: "مكانة القرآن الكريم وكمال قدرة الله" — `16c10040-7a7b-4647-add2-4aa4d3f70583`, real route `/lessons/16c10040…` (not `/prototype/*`).

| Check | Result |
|---|---|
| ACCESS_GATE | PASS — real lesson renders, NOT the blocked screen |
| DS_V2_SCOPE_APPLIED | PASS |
| RTL | PASS |
| NO_HORIZONTAL_OVERFLOW | PASS (390px = 0, 1440px = 0) |
| READABLE_LINE_LENGTH | PASS |
| CONSOLE_ERRORS | ZERO |
| DYNAMIC_CAPABILITIES (18B) | PASS — only the derived available step renders: `PRIMARY_CONTENT` = "اقرأ الدرس", progress 0/1 |
| OFFICIAL_CONTENT (31/31 blocks) | FAIL_NOT_BOUND |
| FIGURES (3 approved images) | NOT_VERIFIABLE (depends on binding) |
| OFFICIAL ACTIVITY / ASSESSMENT / QURAN BLOCKS / ORDER | NOT_VERIFIABLE (depends on binding) |
| PDF_REFERENCE_PRESERVED | NOT_VERIFIABLE (no primary PDF resource row bound for this lesson) |
| VISUAL SEPARATION (book vs Tamkeen explanation) | NOT_VERIFIABLE (structured reader not rendered) |

### Root cause (no fix applied — writes are out of scope this turn)
`resolveStructuredDocument()` binds the approved 20A1B document only when the lesson's stored book content contains the marker `TAMKEEN_STRUCTURED_PILOT:20A1B`.
Live row `lesson_book_contents.lesson_id = 16c10040…` holds 95 characters of chapter-heading text and does **not** contain the marker (`position(marker in content) = 0`); `lessons.content_text` is empty. The lesson therefore falls back to `OfficialTextbookContent` with a single heading line instead of the 31-block Structured Textbook Reader.
Closing this requires one authorized content binding write (marker/approved content on the lesson book row), which was explicitly forbidden for this task.

Screenshots: `/tmp/browser/19d1/lesson-390.png`, `/tmp/browser/19d1/lesson-1440.png`.

## Final verdict (supersedes the earlier line above)
TAMKEEN_DESIGN_SYSTEM_V2_CONTROLLED_REAL_APP_ROLLOUT_19D = HOLD_AUTHORIZED_LESSON_VISUAL
PUBLISH = NO · DEPLOY = NO · MIGRATION = NO · DB_WRITES = NO
