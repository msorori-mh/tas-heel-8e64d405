# Stage 21D — Gate evidence ledger and non-production acceptance blueprint

Date: 2026-10-04

Documentation-only stage. No runtime changes, migrations, database writes, deploys, payment integration, question-bank cutover, or Student app changes.

## Current gate verdict

Formal status remains `ACADEMY_FULL_PROGRAMMING_GATE=CLOSED`.

| Gate | Status | Current evidence | Evidence required to close |
|---|---|---|---|
| Question-bank stability | CLOSED | PR #58 remains open/draft and documents runtime default as `LEGACY` | Formal QB cutover approval; approved target runtime mode; successful local/remote preflight; zero-tolerance answer/score mismatch evidence during shadow/canary; rollback readiness |
| Lesson import contract | CLOSED | PR #96 remains open/draft/HOLD | CF10/CF11 updated for V2; PostgreSQL regression for V1+V2; 8 official-book questions + 20 self-test evidence without answer leakage; full build/E2E/RTL evidence; HOLD removed by explicit approval |
| Academy structure / roles / subscriptions | PARTIAL | Pilot Teacher Academy exists, including profiles/programs/enrollments/learning/assessment/certificates, but direct `self_enroll` and unscoped capability behavior remain part of the legacy/pilot shape | Approved scoped RBAC contract; approved Plan → Contract → Entitlement → Enrollment lifecycle; organization-seat rules; compatibility contract for pilot records |
| Security closure | NOT FORMALLY CLOSED | Privileged paths contain internal authorization checks, but final effective migration/schema state still lacks one signed negative-authorization evidence pack | Negative authorization tests against final effective DB state; scope isolation tests; service-only path checks; destructive-operation audit evidence; explicit security sign-off |

A deployed pilot feature does not by itself satisfy a formal gate.

## Persona and data boundary freeze

Student and Teacher are separate product personas even when they share the same authentication account.

- Student roles never authorize Teacher Academy learning, administration, organization, support, or certificate operations.
- Teacher, Academy Admin, and Organization roles never authorize Student administration.
- Student subscriptions never become Teacher entitlements.
- Teacher entitlements never unlock Student paid content.
- Student and Teacher progress, attempts, assessment records, and certificates remain separate.
- Dual-persona accounts switch workspace explicitly; the active persona is part of authorization and audit context.
- Organization users are constrained to Teacher Academy data within their organization/program scope and never traverse Student-persona records.

## Gate evidence ledger

Each gate closes only when its evidence is attached to a specific commit/schema baseline. “Implemented”, “deployed”, or “tests passed previously” is insufficient without a traceable baseline.

Required evidence record:

1. repository commit SHA;
2. database migration/schema baseline identifier;
3. exact test suite and command;
4. PASS/FAIL result with timestamp;
5. negative cases and cross-scope cases;
6. known deviations/HOLD queue;
7. rollback/disable condition;
8. approver and approval date.

Any later schema/RLS/RPC change that touches the gate invalidates the affected evidence and requires rerun.

## Non-production acceptance blueprint

### A. Persona isolation

- Student-only account cannot enter Teacher Academy learning or administration.
- Teacher-only account cannot access Student administration.
- Dual-persona account must explicitly switch workspace.
- Switching persona does not copy roles, subscriptions, progress, attempts, or certificates.
- Audit events record the active persona and effective scope.

### B. Scoped RBAC

Target grant shape:

`principal + capability + scope + status + provenance`

Supported target scopes:

- GLOBAL
- ORGANIZATION
- PROGRAM

Acceptance cases:

- PROGRAM-scoped manager cannot read or mutate another program.
- ORGANIZATION-scoped manager cannot read or mutate another organization.
- Revoked/expired grants fail closed.
- User-level unscoped legacy grants do not silently become target grants.
- Service-only capabilities are inaccessible to normal authenticated clients.

### C. Entitlement lifecycle

Target commercial path:

`Plan → Contract → Entitlement → Enrollment → Progress → Certificate`

Acceptance cases:

- Existing pilot `self_enroll` records do not imply a paid contract.
- Student subscription does not create Teacher entitlement.
- Organization seat assignment is derived from an organization entitlement pool.
- Re-running pilot compatibility conversion is idempotent.
- Expired entitlement preserves historical progress and certificate history.
- Refund/reversal behavior remains policy-gated until explicitly approved.

### D. Organization seats

- Seat may be assigned only inside the organization entitlement scope.
- Seat movement never transfers learner progress.
- Cross-organization reassignment is rejected.
- After first recorded learning progress, reuse requires an explicit release/cancellation policy and audit event.
- Organization reporting excludes Student-persona data and raw assessment answers by default.

### E. Certificates and appeals

- Certificate belongs to Teacher persona and exact program version.
- Normal entitlement expiry does not automatically revoke a valid historical certificate.
- Revocation is stateful/auditable rather than destructive deletion.
- Revocation and restoration require authorized scoped actors.
- Appeals preserve original decision, review history, and final outcome.
- A revocation-related appeal should use a second reviewer when the policy baseline is approved.

### F. Security-negative regression

Against the final effective schema/migration state:

- anonymous caller → privileged Academy RPC: DENY;
- authenticated non-admin/non-scoped caller → privileged Academy RPC: DENY;
- PROGRAM A actor → PROGRAM B resource: DENY;
- ORG A actor → ORG B resource: DENY;
- Student persona → Teacher admin/learning grant path: DENY;
- Teacher persona → Student admin path: DENY;
- normal client → service-only maintenance path: DENY;
- destructive action without required authorization/audit context: DENY.

## Runtime-opening rule

Runtime work may start only after all four formal gates are green at the same baseline and owner-required policy decisions that affect executable behavior are approved.

Until then, allowed work remains limited to vision, scope, training-program design, role/scope contracts, UX, subscription/entitlement policy, organization-seat policy, certificate/appeal policy, acceptance criteria, security evidence design, and implementation sequencing.

## Next safe design work

The next non-production package may define the Academy program catalog/versioning contract and certificate issuance criteria in a way that does not depend on Student-app state, database migrations, or production writes.
