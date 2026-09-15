# Offline incomplete-assessment recovery

Baseline: 403d7c5dbaa85b826e34cb9a5e67b3314d0166c0, after diagnostic PR #254.

Live grade-12 Aden Chemistry failed before transfer with OFFLINE_MANIFEST_FETCH_500 / OFFLINE_ASSESSMENT_ANSWER_MISSING. A read-only aggregate of current published official-book question revisions found eight EXTENDED_RESPONSE questions with no nonempty model answer and no marked correct options. No question/answer data was changed or invented.

The previous source builder threw on one answerless official question, aborting the whole subject manifest and blocking unrelated books and lessons. The new builder excludes only official questions without a model answer, after student authorization, exact revision loading and option-binding validation. Valid questions retain deterministic bodies; a lesson with no eligible questions produces no assessment artifact. The artifact endpoint uses the same builder as the manifest, preserving byte/hash consistency. Self-test, permission, revision and malformed answer-layer failures still reject.

An additive top-level unavailableQuestions count accompanies the manifest response and is shown as a warning on the subject card. Manifest schema and artifact fields remain unchanged for older Android clients. The warning is refreshed online; an older client can download valid files but does not render the new warning. The eight source questions remain online as before and need editorial completion separately.

Validation includes mixed/all-missing official answers, deliberate option-binding mismatch with a missing answer, existing access/answer isolation, byte-integrity, resume and component warning checks. Release gates: focused suite, typecheck, lint, CI, publication and real Chemistry download. Native airplane-mode acceptance remains separate because no Android device/emulator is attached.

Rollback: revert this source commit and redeploy. No database rollback is needed. Previously verified files remain on the device.
