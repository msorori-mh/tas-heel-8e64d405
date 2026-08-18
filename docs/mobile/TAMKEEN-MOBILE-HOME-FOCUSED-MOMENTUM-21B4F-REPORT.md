# TAMKEEN_MOBILE_HOME_FOCUSED_MOMENTUM_SIMPLIFICATION_21B4F

Source / UX batch only. No deploy, no merge, no DB migration, no DB writes, no storage
mutation, no OAuth config change.

## G0 — SOURCE LOCK

- BRANCH: `edit/edt-db582825-22b9-4fe7-b5cc-83b53e18fece`
- START_HEAD: `854ba4b6`
- END_HEAD: `6ad39e05`
- `git status`: clean at start (no unrelated working-tree changes) → no `STOP_SOURCE_MISMATCH`

Stack lineage (built on top of the latest approved stack only):

- `21B4B_SHA = 64a87ae0` (Android offline shell + local textbook registry)
- `21B4C_R1_SHA = bcd1053f` (Google OAuth HTTPS App Link rebase)
- `21B4D_SHA = 465e446f` (textbook download & open UX)
- `21B4E_SHA = 854ba4b6` (`Sanitized lesson journey V3` — original PDF removed from lesson journey)

## CHANGED FILES

Added:

- `src/components/home/HomeGreeting.tsx`
- `src/components/home/ContinueLearningCard.tsx`
- `src/components/home/DailyGoalCard.tsx`
- `src/components/home/NeedsAttentionSection.tsx`
- `src/components/home/CompactProgress.tsx`
- `tests/student/mobile-home-focused-momentum-21b4f.static.test.mjs`
- `docs/mobile/TAMKEEN-MOBILE-HOME-FOCUSED-MOMENTUM-21B4F-REPORT.md`

Modified:

- `src/routes/_authenticated/app.tsx` (order + zero-state + secondary placement)
- `src/components/home/SemesterPicker.tsx` (compacted to a "موادي" entry, two rows)

Untouched (data / backend / other batches): all hooks, `use-home-dashboard.ts`, auth,
curriculum track derivation, subject visibility, textbook components, lesson journey.

## SECTIONS — BEFORE

1. `WelcomeCard` (large hero: greeting + big % ring + progress bar + CTA)
2. `HomeSubscriptionBanner`
3. `ContinueSection` (list of up to 4 lessons + "كل المواد")
4. `TodayMissionCard` (large card, second competing CTA)
5. `LearningToolsSection`
6. `ProgressSummary` (4 KPI cards — all zeros for a new student)
7. `SemesterPicker` (two tall cards with duplicate "ابدأ" CTAs)
8. `AchievementsSection` (always rendered, padded with unearned placeholder badges)
9. `AiAssistantCard`

## SECTIONS — AFTER

1. Greeting — `HomeGreeting` (one line + one helper line)
2. Continue Learning — `ContinueLearningCard` (the page's single primary CTA)
3. Daily Goal — `DailyGoalCard` (one compact strip)
4. Needs Attention — `NeedsAttentionSection` (rendered only when signals exist)
5. Quick Actions — `LearningToolsSection` (unchanged, 4 tiles)
6. Subjects — `SemesterPicker` (compact)
7. Compact Progress — `CompactProgress` (3 small cells, guidance line when empty)

Secondary tail: earned achievements (only when earned) and `AiAssistantCard`.
The free-access banner stays directly under the greeting (informational, not a CTA).

## REMOVED / COLLAPSED / HIDDEN

| Item | Action | Reason |
| --- | --- | --- |
| `WelcomeCard` hero | replaced by compact greeting | wasted vertical space, duplicated progress + CTA |
| `TodayMissionCard` | collapsed into `DailyGoalCard` | competing CTA with Continue Learning |
| `ContinueSection` (4-item list) | collapsed to the single next lesson | Home answers "ماذا أعمل الآن؟", full list lives in موادي |
| `ProgressSummary` 4 KPI cards | collapsed to `CompactProgress` | repeated analytics, all-zero grid for new students |
| `SemesterPicker` tall cards | compacted, per-card CTA removed | duplicate CTA + tall rows |
| Achievements placeholders | hidden unless earned | achievement placeholder noise |
| AI assistant | kept, moved to the tail | must never precede Continue Learning |

Nothing was deleted from the system: progress analytics remain on `/progress` and
`/performance`, all lessons remain on `/semesters`, achievements still render when earned.

## ZERO-STATE CHANGES

- New student sees `ابدأ أول درس` instead of `0 درس / 0 اختبار / 0 نقطة`.
- Daily goal shows `0/1` with the guidance line `أكمل درساً واحداً اليوم…` (a target, not an analytic zero).
- Needs Attention is fully hidden when empty.
- Compact Progress becomes `ابدأ التعلم ليظهر تقدمك هنا` when there is no real data.

## MOBILE EVIDENCE

Playwright, authenticated preview session, `/app`:

| Viewport | Result |
| --- | --- |
| 360×780 | `scrollWidth - clientWidth = 0` (no horizontal overflow) |
| 390×844 | `0` — greeting, primary CTA, daily goal all above the fold; quick actions and موادي within one short scroll |
| 1280×900 (desktop smoke) | `0` — layout intact, no regression |

Screenshots captured at `/tmp/browser/home21b4f/{mobile360,mobile390,desktop}.png`.
RTL (`dir="rtl"`), Arabic text truncation (`truncate` + `min-w-0`) and ≥44px touch
targets (`min-h-11`) verified on all new components.

## REGRESSIONS

| Guard | Status |
| --- | --- |
| AUTH | UNCHANGED |
| CURRICULUM TRACK DERIVATION | UNCHANGED |
| SUBJECT VISIBILITY | UNCHANGED |
| TEXTBOOK UX 21B4D | PASS |
| LESSON JOURNEY 21B4E | PASS |
| OFFLINE 21B4B | UNCHANGED |
| GOOGLE AUTH 21B4C | UNCHANGED |
| Backend / DB / Storage | No change |

## TESTS

- New: `tests/student/mobile-home-focused-momentum-21b4f.static.test.mjs` — 14 guards
  covering section order, new-student CTA, hidden Needs Attention, exact Quick Actions set,
  no duplicate CTA, hidden achievements placeholder, AI assistant secondary, subjects and
  textbook entry reachable, RTL, mobile no-overflow static guard, routing unchanged,
  touch targets, and attention derivation.
- Suites run: `tests/student`, `tests/mobile`, `tests/review` → **129 tests passed, 0 failed**
  (3 pre-existing `node:test`-style files report "No test suite found" under vitest; unrelated to this batch).
- `tsgo --noEmit`: clean.
- `bun run build`: success.

## FINAL VERDICT

**PASS_SOURCE_READY_FOR_MOBILE_UI_REVIEW**
