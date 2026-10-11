# Stage 21C — Policy decision baseline and compatibility contract

Date: 2026-10-02

Documentation-only stage. No runtime changes, migrations, database writes, deploys, payment integration, question-bank cutover, or Student app changes.

## Gate reconciliation

Formal status remains `ACADEMY_FULL_PROGRAMMING_GATE=CLOSED`.

- Question bank: CLOSED. PR #58 remains open/draft and explicitly states that runtime default is `LEGACY`; formal cutover is still pending.
- Import contract: CLOSED. PR #96 remains open/draft/HOLD; CF10/CF11 V2 materialization/publication closure and full PostgreSQL/E2E evidence are still prerequisites.
- Academy structure: PARTIAL. The pilot contains teacher profiles, programs, enrollments, learning, assessments, certificates, administration/reporting and direct `self_enroll`, but target scoped RBAC and the commercial entitlement chain are not complete.
- Security: NOT FORMALLY CLOSED. Privileged paths contain internal authorization checks, and later migrations alter grants, but launch still requires negative-authorization regression evidence for the final effective migration state plus documented sign-off.

No gate above may be inferred as satisfied merely because the pilot Academy is already deployed.

## Boundary freeze

Student and Teacher are separate product personas even when they share one authentication account.

1. Student roles never authorize Teacher Academy operations.
2. Teacher or Organization roles never authorize Student administration.
3. Student subscriptions never create Teacher entitlements.
4. Teacher entitlements never unlock Student paid content.
5. Student progress, attempts and certificates remain distinct from Teacher Academy progress, attempts and certificates.
6. Dual-persona accounts switch workspace explicitly; the active persona is part of authorization and audit context.
7. Organization administrators may see only Teacher Academy data inside their organization scope and may not traverse into Student-persona records.

## Target authorization contract

Every Academy grant must be understood as:

`principal + capability + scope + status + provenance`

Allowed target scopes:

- GLOBAL
- ORGANIZATION
- PROGRAM

A user-level capability without explicit scope is legacy/pilot behavior and must not become the target authorization baseline.

Recommended capability families for later implementation:

- catalog/program management
- teacher directory visibility
- learning/progress reporting
- organization-seat management
- certificate review/revocation
- support/appeal handling
- audit/report access

## Commercial entitlement contract

Target access remains:

`Plan → Contract → Entitlement → Enrollment → Progress → Certificate`

Compatibility rules:

- Existing pilot `self_enroll` records are grandfathered as pilot/free compatibility records only.
- A pilot enrollment must never be interpreted as evidence of a paid contract.
- Student subscriptions must not be reused or converted into Academy entitlements.
- Organization seats derive from organization entitlements, not from Student subscription tables.
- Conversion of pilot enrollments to the target model must be idempotent and preserve progress/certificate provenance.
- Direct `self_enroll` may remain only behind a clearly designated pilot/free path until retired.

## Proposed policy defaults requiring owner approval before runtime

These are recommendations, not executable decisions:

1. **Entitlement expiry:** expiry blocks new learning/assessment activity after the allowed grace policy, but does not erase historical progress.
2. **Certificate validity:** normal entitlement expiry does not revoke an already valid certificate.
3. **Certificate revocation:** limited to integrity, fraud, material assessment invalidation or an authorized policy decision; every revocation is auditable and reversible only through an explicit reviewed action.
4. **Appeal window:** 14 calendar days from the contested assessment/certificate decision, with a second reviewer for revocation-related appeals.
5. **Organization seat reuse:** a seat may be freely reassigned before learning begins; after first recorded progress, reassignment requires an explicit cancellation/release decision and must not transfer learner progress.
6. **Organization reporting:** organization managers may see enrollment state, completion percentage, completion date, certificate state and aggregate assessment outcome; they should not receive raw assessment answers by default.
7. **Pilot conversion:** no paid entitlement is created by assumption; a commercial entitlement must be created only from an approved plan/contract or an explicit grandfathering policy.

Pricing, currency, grace duration, refund rules and retention periods remain intentionally undecided.

## Security acceptance evidence required before programming gate opens

The security gate should close only after all of the following are captured against the final effective schema/migration state:

- anonymous callers cannot invoke privileged Academy admin operations;
- authenticated non-admin/non-scoped users are rejected by privileged RPCs;
- program-scoped users cannot affect another program;
- organization-scoped users cannot read or modify another organization;
- Teacher persona cannot inherit Student administration;
- Student persona cannot enter Teacher Academy administration or learning by role leakage;
- service-role-only maintenance paths are not callable through normal client credentials;
- privileged destructive actions produce immutable audit evidence;
- certificate revocation/restore and seat operations enforce separation of duties where configured.

## Gate-opening evidence pack

Runtime work may begin only when the evidence pack contains:

1. formal Question Bank cutover approval and a non-legacy target runtime decision;
2. approved lesson import V2 contract with HOLD removed and CF10/CF11 regression evidence;
3. approved scoped RBAC + entitlement + organization-seat contracts;
4. security negative-regression report and sign-off for the final effective database state;
5. approved owner decisions for the policy defaults that affect runtime behavior.

Until then, permitted Academy work remains vision, scope, curriculum/program design, roles, contracts, UX, subscriptions/entitlements, certificates, acceptance criteria and implementation sequencing only.
