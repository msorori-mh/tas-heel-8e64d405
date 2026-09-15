# Live student download check — 2026-09-15

Baseline: production main afdb470d907b518593e2cd3a2d0b6bf605a5802f (PR #247).

The Cloud Browser reached the signed-in student homepage after the callback fix. Settings confirmed grade 12, Aden curriculum. No credentials or account identifiers are recorded here.

The student opened My Subjects, semester 1, Reading and Story. The UI offered 15 lessons and an offline pack of 19 files, approximately 22 MB. Two download attempts stopped at 3% with 0/19 verified files. The UI briefly showed a generic download failure; a successful manifest refresh cleared that message and retained “verifying current file” progress after the operation ended.

This change separates download feedback from metadata feedback and clears transient byte progress after the operation settles. Verified local progress is then shown from the refreshed local record. A successful retry clears the previous failure. Pause feedback also survives metadata refresh.

Validation: two jsdom component regression tests fail on the production baseline and pass after the fix; TypeScript passes. These tests exercise the rendered component with controlled downloader outcomes. They do not prove the cause of the actual artifact failure.

HOLD: live offline download and native airplane-mode use remain unproven. The browser surface does not expose a supported offline-network toggle. The actual artifact failure code was not available through the rendered UI or captured console logs. PR #246 contains separate recovery work on the Android review branch; this small UI patch does not replace it or prove the original mobile issue resolved.

Integration update: main advanced to 8f6d8223 (PR #250) during this investigation. Retained its safe error translations while keeping operation feedback separate and resetting transient progress. The earlier baseline observations remain historical; current merged behavior needs a new live check.
