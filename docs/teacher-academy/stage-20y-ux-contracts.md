# Stage 20Y — UX and Commercial Contracts

Design-only continuation. No runtime, database migration, production write, deploy, payment integration, Question Bank runtime integration, or Student app changes.

## Current gate state
- Question Bank: HOLD; PR #58 remains open and draft.
- Import Contract V2: HOLD; PR #96 remains open and draft.
- Academy curriculum/program foundation: partial pass.
- Academy role scoping: not yet ready for full runtime.
- Subscription/entitlement lifecycle: not yet ready for full runtime.
- Critical release blockers: not yet fully closed.

Therefore full Academy programming remains closed.

## Persona boundary
The Student, Teacher, Academy Administration, and Organization workspaces remain separate. A shared login may switch workspaces, but subscriptions, learning progress, certificates, organization rights, and administrative responsibilities do not merge.

## Academy administration navigation
Proposed modules:
Overview; Catalog; Programs; Program Versions; Teachers; Enrollments; Progress; Assessments; Certificates; Organizations; Contracts; Seat Pools; Support; Appeals; Audit & Decisions; Reports; Settings.

## Organization workspace
Proposed modules:
Contract Summary; Seats; Seat Assignments; Teachers; Allowed Programs; Enrollment/Completion Summary; Organization Managers; Support; Exports.

The default organization view excludes Student workspace data, detailed assessment answers, private appeal evidence, and unrelated Academy programs.

## Commercial lifecycle
Plan → Contract → Entitlement → Enrollment → Learning → Completion → Certificate Eligibility → Certificate.

Contract, entitlement, enrollment, and certificate are separate records and should never be represented as a single generic status.

## Edge cases to preserve
- Access expiry preserves prior progress and attempts.
- Expiry alone does not invalidate an already valid certificate.
- Grace, if later approved, must not widen the purchased program scope.
- Two valid access sources for the same program may coexist; losing one source must not remove access while the other remains valid.
- Refund or payment reversal must not erase learning history.
- Program-version replacement must not silently move an active enrollment.
- Organization contract expiry must not delete teacher progress or certificates.
- Seat reassignment must never transfer progress or certificates to another teacher.
- Suspension preserves historical learning records.

## Organization contract states
DRAFT → PENDING_APPROVAL → ACTIVE → SUSPENDED | EXPIRED | TERMINATED.

A contract screen should show organization, contract reference, validity, allowed programs, purchased seats, seat policy, reporting scope, organization managers, renewal status, support route, and decision history.

## Organization reporting defaults
Allowed: seat counts, assignment identity needed for operations, entitlement status, enrollment/completion summary when contract permits, certificate-issued indicator when contract permits.

Not default: assessment answers, per-question details, private support notes, appeal evidence, Student workspace records, unrelated programs.

## Certificate wording
Default safe title: **شهادة إتمام برنامج تدريبي — أكاديمية معلم الثانوية**.

Do not use “شهادة معتمدة”، “اعتماد مهني”، or similar external-accreditation claims unless formal accreditation is documented.

Public verification should expose only the minimum needed to verify holder, program/version, issue date, certificate reference, and current validity state.

## Decisions pending before commercial runtime
D1 appeal window.
D2 certificate-revocation authority.
D3 second-level review model.
D4 seat reuse after enrollment starts.
D5 organization-visible teacher progress detail.
D6 support/appeal retention.
D7 service hours and SLA targets.
D8 exact public certificate fields.
D9 audit retention.
D10 detailed organization reporting boundary.
D11 expiry behavior for an in-progress paid program.
D12 refund/reversal effect on access and certificate eligibility.
D13 program-version transition policy.

## Next safe stage
If gates remain closed: Stage 20Z — End-to-End Acceptance Pack & Launch Readiness Checklist, still design-only.
