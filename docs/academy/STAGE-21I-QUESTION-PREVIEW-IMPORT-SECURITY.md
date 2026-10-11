# Stage 21I — Question preview and import security, revised 2026-10-11

Status: **ACCEPTANCE DESIGN / NOT EXECUTED**. `ACADEMY_FULL_PROGRAMMING_GATE=CLOSED`.

The October 11 reminder reported `Stage-21I-Academy-Question-Preview-Security-and-Import-Contract.md` with 20 acceptance cases and unchanged gates. Its complete locally saved text is unavailable. This repository revision newly specifies the criteria below; it does not claim to recover the original, approve Import V2, or perform a QB cutover.

Authoritative contract references: [Stage 21D](STAGE-21D-GATE-EVIDENCE-LEDGER.md), [Stage 21E](../teacher-academy/stage-21e-gate-closure-decision-register.md), and the separately reviewed QB/import packages #58/#96. Keep those packages' runtime and approval states explicit. Their proposed contracts are not the active production schema merely because they have test vectors.

| ID | Scenario | Required result |
|---|---|---|
| I01 | Anonymous question preview | No private draft question, correct answer or grading material. |
| I02 | Student request | Only permitted published question presentation; no answer material in JSON, HTML, attributes, chunks or logs. |
| I03 | Teacher persona without content capability | Training enrollment does not grant student question-bank editing or answer access. |
| I04 | Authorized scoped content reviewer | Preview restricted to approved content scope; access auditable. |
| I05 | Forged lesson, subject or program ID | Cross-scope lookup denied at the server. |
| I06 | Official-book question entry | User-entered answers kept separate from model answers and grading keys. |
| I07 | Self-test response | Scoring occurs through the approved server contract; no premature correct-option exposure. |
| I08 | Draft/replaced resource | Unpublished or replaced resources remain inaccessible to students under effective visibility/RLS rules. |
| I09 | Published lab correction | Immutable content hash and atomic audit linkage retained; prior replaced asset not exposed. |
| I10 | V1 known-good import | Existing approved semantics and identity mapping remain intact. |
| I11 | V2 proposed import | Stays Draft/HOLD until publication/materialization semantics and explicit approval are recorded. |
| I12 | Missing/reordered/extra columns | Approved parser rejects ambiguous files with stable actionable errors. |
| I13 | Duplicate import/operation | Idempotent result; no duplicate question, lesson or published resource. |
| I14 | Conflicting identity or payload | Reject rather than silently reassign or overwrite. |
| I15 | Mixed subjects/books/grades | Validate the full declared scope; no cross-curriculum substitution. |
| I16 | Rich-text/script/link payload | Preview rendering rejects executable payloads and unsafe destinations. |
| I17 | Partial validation/materialization failure | No partially published lesson; transaction/rollback and retry evidence required. |
| I18 | Offline/downloaded question package | No grading secrets or draft content; owner boundary preserved; online eligibility not inferred. |
| I19 | V1/V2 regression fixture | Prove the approved eight official-book and twenty self-test question example, identity replay and absence of answer leakage. |
| I20 | Shadow/canary/cutover | Zero tolerated answer/score mismatch, explicit mode selection, rollback rehearsal and approval before changing runtime. |

For every case capture commit, effective migrations, parser/runtime mode, persona/scope, expected denial or success, and sanitized result. Current closed QB/import gates require a separate reviewed closure packet. No production DB write, migration application, deployment or payment activation is authorized here.
