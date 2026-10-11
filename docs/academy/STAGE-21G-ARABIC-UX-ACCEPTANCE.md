# Stage 21G — Arabic UX acceptance, revised 2026-10-11

Status: **ACCEPTANCE DESIGN / NOT EXECUTED**. `ACADEMY_FULL_PROGRAMMING_GATE=CLOSED`.

This is a new, repository-backed revision. The October 9 reminder reported a 14-case document named `Stage-21G-Teacher-Academy-UX-Acceptance.md`, saved only in its conversation. Its complete original text is unavailable in this workspace; this revision does not claim to reproduce it. It closes the persistence gap with the following explicit criteria, derived from Stage 21D/21E and the current pilot UI baseline `63df942a8813f65935dd04c0daa0b69a13395030`.

| ID | Scenario | Required observable result |
|---|---|---|
| G01 | Arabic workspace at 320/360/390 px | RTL reading order; no clipped navigation or horizontal page overflow. |
| G02 | Mixed Arabic, Latin names and dates | Identifiers, times and certificate codes retain their intended direction and copy correctly. |
| G03 | Keyboard-only navigation | All controls reachable; visible focus; modal focus returns to its trigger. |
| G04 | Screen reader | Buttons have accessible names; field errors identify the affected field; navigation landmarks distinguish workspaces. |
| G05 | Pending login/profile/catalog request | One clear loading state; actions disabled while pending; no empty-state flicker. |
| G06 | Empty catalog, learning or certificates | Accurate Arabic explanation and an available next step; no fabricated progress. |
| G07 | Service error, timeout or rate limit | Actionable Arabic message; retry preserves entered data; no duplicate operation. |
| G08 | Save professional profile | Validate fields before submit; one pending request; success visible; saved profile shown. |
| G09 | Program enrollment | Program details remain visible; enrollment confirmation leads to the correct learning program. |
| G10 | Five mobile destinations | Home, programs, learning, certificates and profile remain accessible; downloads does not displace profile. |
| G11 | Offline without a saved program | Explain that a prior download is required; do not claim unavailable content is saved. |
| G12 | Offline with saved program | Display available text/files and omitted-resource notices; notes/progress show pending sync; official assessments/certificates remain online. |
| G13 | Android Back, keyboard and safe areas | Back closes overlays before leaving workspace; inputs and bottom controls remain visible above keyboard/system bars. |
| G14 | Update, logout or account switch | Update is explicit; pending work survives; previous user's content disappears after logout/switch. |

Record each execution with commit SHA, platform/version, viewport, account persona, expected/actual result and screenshot or accessibility evidence. Automated pilot tests cover selected behavior only; they do not close this complete UX gate. No production writes, migration application or deployment are authorized by this document.
