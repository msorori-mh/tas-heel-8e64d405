# Stage 21H — Identity and persona boundaries, revised 2026-10-11

Status: **ACCEPTANCE DESIGN / NOT EXECUTED**. `ACADEMY_FULL_PROGRAMMING_GATE=CLOSED`.

The October 10 reminder reported a 24-case document, `Stage-21H-Academy-Identity-Persona-Boundary-Acceptance.md`, saved locally. Its full original text is unavailable here. These are newly authored, traceable acceptance criteria, not a recovered original or evidence of 24 passing tests. Baseline: Stage 21D/21E/21F contracts and pilot main `63df942a8813f65935dd04c0daa0b69a13395030`.

| ID | Scenario | Required result |
|---|---|---|
| H01 | Anonymous teacher learning request | Denied by server; sign-in shown without private data. |
| H02 | Valid teacher Google login | Same authenticated identity enters teacher workspace; authorized teacher profile is checked. |
| H03 | Android OAuth callback and duplicate delivery | Original PKCE verifier used; exchange once; correct requested workspace restored. |
| H04 | Offline cold-start | Saved identity enables only owner-scoped downloaded content; no cached identity grants online permission. |
| H05 | Explicit sign-out | Both persona presentations cleared; private downloaded data remains inaccessible until its owner signs in. |
| H06 | Account switch during a download/sync | Previous operation stops; no cross-owner commit, acknowledgement or display. |
| H07 | Student-only account calls teacher RPC | Denied without inheriting student role or subscription. |
| H08 | Teacher-only account calls student administration | Denied without inheriting teacher capability. |
| H09 | Dual-persona workspace switch | Explicit workspace choice; roles and views recomputed for the selected persona. |
| H10 | Student paid subscription | Does not create teacher entitlement or enrollment. |
| H11 | Teacher entitlement | Does not unlock student paid content. |
| H12 | Progress, attempts and certificates | Stored and queried within their persona and enrollment; never copied on workspace switch. |
| H13 | Teacher opens Academy admin | Server denies ungranted capabilities; hiding controls alone is insufficient. |
| H14 | Program-scoped manager | Cannot read/write another program. |
| H15 | Organization-scoped manager | Cannot read/write another organization or student records. |
| H16 | Revoked/expired grant | Requests fail closed; stale UI capability cannot authorize a write. |
| H17 | Suspended teacher reconnects | Download/sync authorization fails; cached presentation revoked; pending work retained without unauthorized replay. |
| H18 | Unenrolled program/lesson | Direct download, completion and note writes rejected by server. |
| H19 | Offline official assessment | Cannot submit or issue a certificate; online server eligibility remains authoritative. |
| H20 | Lost sync response and retry | Same operation ID/payload retried; successful effect appears once. |
| H21 | Same note ID, changed payload | Collision rejected; original immutable note preserved. |
| H22 | Admin/verification route while offline | Teacher library never substitutes for admin or public verification workspace. |
| H23 | Entitlement expiry/refund/seat reuse | Apply only approved policy; preserve historical progress and certificate audit trail; no inferred commercial policy. |
| H24 | Service role, support or certificate revocation | Least privilege, explicit scope and auditable action; normal user cannot invoke service-only paths. |

Execute positive and negative cases on a pinned effective schema and separate Student, Teacher, Dual-Persona and cross-scope accounts. Preserve trace IDs and sanitized evidence; never place tokens in reports. Missing target RBAC/entitlement behavior is **HOLD**, not an assumed pilot pass. This matrix does not authorize production migration, payment activation, cutover or deployment.
