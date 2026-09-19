# Offline cancellation follow-up — 2026-09-19

## Baseline and live evidence

Baseline: production `main@9e4cf20fbff7cb955972a39ae7a1b1b3be04b941` (PR #282).
The user completed Google sign-in in the cloud browser. No test answers or profile
changes were written during this verification.

- Physics, third secondary / Aden / semester 1: preview displayed 18 MB and 116 files.
- Deliberate pause retained 19 verified files, 38%.
- Closing the tab and opening the same subject in a fresh tab retained the same 19 files.
- Resume completed 116/116, 100%, with “available offline”.
- A second close/reopen retained 116/116 verified files. The lesson book rendered.
- Quran and its sciences has a lesson with 12 visible official questions, so it was
  selected to extend the test to assessment content. Its manifest returned
  `OFFLINE_MANIFEST_FETCH_503 / offline_capacity_busy`, including after retry.

The successful Physics run does not close the overall gate. Browser network
remained connected; physical-phone airplane-mode cold start and answer sync have
not been tested. Account identifiers and answers are deliberately omitted here.

## Failure mechanism and bounded change

The subject card requested expensive preparation on mount, download start, pause,
completion and deletion, and did not cancel preparation on navigation. The global
server limiter retained callbacks/timers belonging to waiting requests and only
released active counters in `finally`. A disconnected request can be abandoned
before cleanup, leaving later requests unable to acquire either of the two slots.
This mechanism is consistent with the observed repeated busy response; no live
server trace identified an individual orphaned ticket.

[Cloudflare duration documentation](https://developers.cloudflare.com/workers/platform/limits/#duration)
explains that request work may be cancelled after disconnection.
[Cloudflare request isolation documentation](https://developers.cloudflare.com/workers/observability/errors/#cannot-perform-io-on-behalf-of-a-different-request)
explains why request-owned I/O must not be shared between invocations.

This follow-up:

1. Reuses the exact displayed manifest for download and resume, with the same owner
   checks and per-file size/hash verification. Pause, success and deletion inspect
   local files rather than rebuilding server metadata. Integrity conflicts still
   refresh metadata.
2. Cancels preparation on navigation/download and ignores stale subject responses.
3. Keeps only primitive, expiring active/waiting tickets globally. Each waiter polls
   in its own request context; no invocation calls another invocation's timer or
   promise callback. Admission remains 2 active / 16 waiting, 15s queue timeout.
4. Bounds preparation to 120s. Parent cancellation and timeout abort downstream
   authenticated Supabase reads and answer-layer reads. Expired tickets are reclaimed
   by subsequent admissions even if the previous invocation's timers/finally never ran.
   Ticket identity prevents late cleanup from releasing a newer request's reservation.

This is a per-instance admission control, not a distributed capacity guarantee.
No schema, RLS, grants, stored content, labs/mindmaps publication contracts, offline
storage formats, learning progress or Android identity change. No Play upload.

## Verification / release gate

Focused tests include normal success/failure, fair bounded queuing, active and queued
cancellation, stuck work, orphaned timers/cleanup, late ticket release, cancellation
of downstream reads, exact preview reuse, navigation and stale responses.

Local focused suite: 137/137 PASS. TypeScript/lint and exact-head CI are required.
Live publication and the Quran assessment download must be repeated after release.
Phone acceptance remains pending. Rollback is a revert of this follow-up; device
content must not be deleted.

## Post-publish abrupt-close follow-up

PR #285 merged as `2db143e3b6f201296181eb439eebc0b10f5315e7`; the
source-identical sync trigger `922d3590c1843e177eff73f8c5838b0490cd709d`
was needed after the GitHub push notification was missed. The hosting UI showed
GitHub one commit ahead on main. An empty, non-forced fast-forward commit restored
sync; no files or repository connection were replaced.

Deployment `6d710b05-6a13-4dfc-85b3-fad29ba49cff` completed with the hosting
confirmation “Your website was updated”. The Quran manifest then succeeded and
all 21 files (displayed 28 MB) downloaded to 100%. Reopening after the update
retained both Physics 116/116 and Quran 21/21. The network remained connected.

Two subsequent abrupt closes during automatic metadata refresh reproduced a busy
response for a new subject before the 120s execution limit elapsed. The short
follow-up therefore separates abandonment expiry from the execution deadline:

- Active tickets have a 10s lease, renewed by a timer owned only by the live request.
  An abandoned request cannot renew, so later admission can reclaim it inside the
  existing 15s queue window. The 120s hard execution deadline still aborts stuck work.
- Saved packs load and verify local bytes without automatic server preparation.
  An explicit update-check button performs preparation and reports failure while
  keeping saved content available. New subjects still prepare a size preview.
- Regression tests prove orphan recovery with no old timer callbacks, renewal of
  genuinely active long work, local-only opening and manual update behavior.

Focused suite: 141/141 PASS. Exact-head CI, publication and the abrupt-close live
repeat remain required for the follow-up; physical-phone acceptance is still HOLD.
