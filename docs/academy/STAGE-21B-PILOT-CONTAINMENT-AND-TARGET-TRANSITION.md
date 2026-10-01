# Stage 21B — Pilot containment and target transition

Date: 2026-10-01

Documentation-only stage. No runtime changes, migrations, database writes, deploys, payment integration, question-bank cutover, or Student app changes.

## Current gate status

- Question bank: CLOSED. PR #58 is still open and draft; formal cutover is pending.
- Import contract: CLOSED. PR #96 is still open and draft/HOLD; final V2 approval remains pending.
- Academy data model: PARTIAL. Teacher profiles, programs, enrollments, learning, assessment and certificates exist in the pilot, but target scoped authorization and commercial entitlement contracts are not complete.
- Security closure: NOT YET FORMALLY CLOSED. Existing privileged operations use internal authorization checks, but launch still requires final negative-authorization regression evidence and documented sign-off.

Formal status: ACADEMY_FULL_PROGRAMMING_GATE=CLOSED.

## Pilot containment

Until the target baseline is approved, the Academy already present on main is treated as a legacy/pilot slice.

Do not design new target behavior around direct self-enrollment or unscoped user-level capability grants.

## Persona boundary

Student and Teacher remain separate product personas even when one account can use both.

- Student roles do not authorize Teacher Academy actions.
- Teacher roles do not authorize Student administration.
- Student and Teacher subscriptions, progress, attempts and certificates remain separate.
- Dual-persona accounts switch workspace explicitly.
- Organization administrators receive organization-scoped Academy permissions only.

## Target contracts

Scoped grants must include capability plus an explicit scope such as GLOBAL, ORGANIZATION or PROGRAM.

Commercial access should follow:

Plan → Contract → Entitlement → Enrollment → Progress → Certificate

Direct self-enrollment may remain only as a clearly marked pilot/free compatibility path until retirement.

Organization seats are derived from an organization entitlement pool. Seat assignment and reassignment rules remain policy decisions and are not inferred from the pilot tables.

Teacher Academy certificates belong to the Teacher persona and the exact program version. Student achievements do not satisfy Academy certification requirements.

## Safe implementation sequence after gates open

1. Approve question-bank cutover and import V2 contracts.
2. Complete security regression evidence and sign-off.
3. Approve commercial and organization policy decisions.
4. Introduce scoped Academy authorization.
5. Introduce Plan/Contract/Entitlement contracts without changing Student subscriptions.
6. Add an idempotent compatibility path for existing pilot enrollments.
7. Move Teacher enrollment UX to the entitlement-aware flow.
8. Add organization-seat operations.
9. Add certificate status, appeal and revocation workflows.
10. Run dual-persona, authorization and legacy-migration acceptance suites before any production cutover.

## Non-production acceptance cases

- Student-only users cannot enter Teacher learning/admin flows.
- Dual-persona users must explicitly enter the Teacher workspace and Student progress stays unchanged.
- Organization managers cannot see Student-persona data.
- Program-scoped managers cannot manage other programs.
- Pilot enrollment conversion is idempotent and does not create paid entitlement by assumption.
- Certificates remain tied to Teacher persona and program version.
- Privileged Academy operations reject unauthorized callers in database-level tests.

## Deferred owner decisions

Pricing, grace period, refund effects, seat reuse after learning starts, appeal window, certificate-revocation authority, retention periods, and whether the pilot itself becomes the long-term baseline remain owner decisions.

Recommendation: keep the current runtime as a contained legacy pilot and migrate deliberately to the target architecture only after all four gates are formally satisfied.
