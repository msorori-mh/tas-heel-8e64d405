# Stage 21 persistence and gate reconciliation — 2026-10-11

## Completed in this revision

PR #320 already contains Stage 21A–21F. Reminder history additionally reports Stage 21G (October 9, 14 cases), 21H (October 10, 24 cases) and 21I (October 11, 20 cases). Their original complete local documents could not be retrieved from this workspace. New dated revisions now preserve the intended scope in GitHub:

- [21G: Arabic UX](STAGE-21G-ARABIC-UX-ACCEPTANCE.md)
- [21H: Identity/persona boundaries](STAGE-21H-IDENTITY-PERSONA-ACCEPTANCE.md)
- [21I: Preview/import security](STAGE-21I-QUESTION-PREVIEW-IMPORT-SECURITY.md)

The 58 cases are acceptance plans, not 58 executed tests. No Stage 21J execution is established by the retrieved history. Future reminder runs must persist a new milestone in a reviewable repository commit/PR before calling it delivered; a conversation-only artifact is recorded as incomplete persistence.

## Current readiness

`ACADEMY_FULL_PROGRAMMING_GATE=CLOSED`. Target scoped RBAC, entitlements, seat policy and formal QB/import/security approvals retain their Stage 21E HOLDs. Existing main Academy remains a pilot. User-authorized maintenance/offline review of that pilot is separately scoped and does not close the full target gate.

Main baseline used for implementation reconciliation: `63df942a8813f65935dd04c0daa0b69a13395030`. Android local-current-UI work is reviewed in #322. A fresh port of #245 is reviewed separately; neither this document nor automated tests apply its notes migration to a live database.

## External release dependencies

- Official Supabase access is required for fresh source/target row and file-byte parity. A sign-in wall prevented the fresh private verification; historical equal counts are insufficient.
- Six receipt objects without established owners remain quarantined; ownership is never guessed.
- Physical Android acceptance remains required for Google login, downloaded content after force-stop, offline input retention, and exactly-once reconnect/account isolation.
- Production Play readiness requires the approved signed artifact and observed console state; generating a debug APK does not publish it.

Reminders retain their existing schedules/enabled states. Replace outdated Lovable-first and completed CF10 instructions with direct official access, current GitHub baselines, explicit evidence and actionable HOLD reasons. Lovable may be used only after practical alternatives are exhausted and the necessity is explained to the user.
