# Live student download check — 2026-09-15

Baseline: production main afdb470d907b518593e2cd3a2d0b6bf605a5802f (PR #247).

The Cloud Browser reached the signed-in student homepage after the callback fix. Settings confirmed grade 12, Aden curriculum. No credentials or account identifiers are recorded here.

The student opened My Subjects, semester 1, Reading and Story. The UI offered 15 lessons and an offline pack of 19 files, approximately 22 MB. Two download attempts stopped at 3% with 0/19 verified files. The UI briefly showed a generic download failure; a successful manifest refresh cleared that message and retained “verifying current file” progress after the operation ended.

This change separates download feedback from metadata feedback and clears transient byte progress after the operation settles. Verified local progress is then shown from the refreshed local record. A successful retry clears the previous failure. Pause feedback also survives metadata refresh.

Validation: two jsdom component regression tests fail on the production baseline and pass after the fix; TypeScript passes. These tests exercise the rendered component with controlled downloader outcomes. They do not prove the cause of the actual artifact failure.

HOLD: live offline download and native airplane-mode use remain unproven. The browser surface does not expose a supported offline-network toggle. The actual artifact failure code was not available through the rendered UI or captured console logs. PR #246 contains separate recovery work on the Android review branch; this small UI patch does not replace it or prove the original mobile issue resolved.

Integration update: main advanced to 8f6d8223 (PR #250) during this investigation. Retained its safe error translations while keeping operation feedback separate and resetting transient progress. The earlier baseline observations remain historical; current merged behavior needs a new live check.

## Additional live journey on 2026-09-15

After server delivery fix #252, Reading and Story showed 19/19 verified (100%) across reload; the official textbook page rendered visually in the first lesson. Quran started at 0/21 (approximately 28 MB). Clicking Stop retained 12/21 verified files (80% by bytes), still present after a full reload. Resume completed 21/21 (100%); another reload retained the completed state. These are real authenticated browser UI observations. Network remained online: this proves persistence and user-requested pause/resume, not a physical network interruption or Android airplane-mode operation.

Chemistry failed to prepare its manifest twice before downloading. Its generic message hides the response diagnostic. This follow-up reuses the existing bounded error translator for manifest preparation too; it does not claim the chemistry failure is resolved. Read-only aggregation found 19 book rows totaling 18,918,319 bytes; size alone is not a confirmed cause.

Current source baseline f455c120 includes the separately merged #251 pause and feedback improvements. No attached Android device/emulator or supported cloud-browser offline toggle is available. Native airplane-mode, all-subject completion, and Chemistry remain HOLD.
