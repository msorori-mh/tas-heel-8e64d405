# TEACHER_ACADEMY_STAGE_19A — Scoped RBAC & Commerce Acceptance Spec

**Mode:** Non-production acceptance specification / fixtures only  
**Reviewed main:** `9713cdb165109987d9d1b672fc44d80b184c6939`  
**Production writes:** NO  
**Migration apply:** NO  
**Deploy:** NO  
**Question-bank runtime integration:** DISABLED

## 1. Gate decision at Stage 19A start

The Academy already has an implemented and tested isolated application baseline, including a dedicated teacher OAuth callback and Academy RLS/capability controls. That does **not** close the full programming gate.

Current blockers remain external to this acceptance package:

- QB-03 PR #58 remains open/draft and states that runtime still defaults to `LEGACY`; runtime cutover is not closed.
- Import-contract PR #96 remains open/draft/HOLD; its own contract states that V2 materialization/publication work is not the final merged contract.
- The Academy target commercial authorization model is not yet frozen as executable production schema: scoped organization/program/cohort grants and paid entitlements/contracts must first pass the acceptance cases below.

Therefore Stage 19A authorizes **tests/fixtures/specification only**. It does not authorize backend expansion, migrations, production data changes, or deployment.

## 2. Separation invariants

Every future implementation must preserve all of these invariants:

1. `auth.users` may be shared for identity only.
2. Teacher profiles, Academy memberships, commercial records, progress, assessments, and certificates belong to `academy.*`.
3. Academy roles/capabilities never extend, reinterpret, or write student `app_role`.
4. No Academy role implies `qb_edit`, `qb_review`, `qb_publish`, student grading, or access to student PII.
5. `/academy` and `/academy/callback` stay isolated from student `/app`, `/complete-profile`, Student AuthProvider/PWA/mobile providers, and student service-worker behavior.
6. Academy Commerce never reuses student wallet/subscription authorization as an entitlement shortcut.
7. Academy certificates stay separate from student certificates.
8. QB integration remains disabled until an independent QB runtime-cutover PASS exists.

## 3. Canonical scoped-RBAC fixture model

The acceptance fixture may model grants as:

```text
principal_user_id
capability
scope_type = GLOBAL | ORGANIZATION | PROGRAM_VERSION | COHORT
scope_id
valid_from
valid_until
revoked_at
```

A missing scope is **deny by default** unless the capability is explicitly classified platform-global.

Required capability families for acceptance coverage:

- `ACADEMY_CATALOG_MANAGE`
- `ACADEMY_PROGRAM_PUBLISH`
- `ACADEMY_TEACHERS_VIEW`
- `ACADEMY_PROGRESS_VIEW`
- `ACADEMY_COHORT_MANAGE`
- `ACADEMY_ORG_MEMBERSHIP_MANAGE`
- `ACADEMY_CONTRACT_VIEW`
- `ACADEMY_CONTRACT_MANAGE`
- `ACADEMY_SEAT_ASSIGN`
- `ACADEMY_CERTIFICATE_ISSUE`
- `ACADEMY_CERTIFICATE_REVOKE`
- `ACADEMY_SUPPORT_AUDIT_VIEW`

## 4. RBAC acceptance cases

The eventual isolated PostgreSQL/RPC implementation must prove all cases below.

| ID | Case | Expected |
|---|---|---|
| RBAC-01 | Organization manager reads own active organization memberships | ALLOW |
| RBAC-02 | Same manager reads another organization | DENY |
| RBAC-03 | Trainer reads progress for assigned cohort | ALLOW |
| RBAC-04 | Trainer reads progress for another cohort | DENY |
| RBAC-05 | Program-scoped editor changes another program version | DENY |
| RBAC-06 | Expired grant is presented | DENY |
| RBAC-07 | Revoked grant is presented | DENY immediately |
| RBAC-08 | Expired organization membership with otherwise valid grant | DENY |
| RBAC-09 | Certificate officer issues certificate with dedicated capability | ALLOW subject to completion evidence |
| RBAC-10 | Certificate officer mutates contract without contract capability | DENY |
| RBAC-11 | Support user attempts training/progress/certificate mutation | DENY |
| RBAC-12 | Any Academy principal requests student-profile PII through Academy RPC | DENY / no row |
| RBAC-13 | Academy grant attempts mapping to student `app_role` | DENY / impossible contract |
| RBAC-14 | Academy grant attempts `qb_edit`, `qb_review`, or `qb_publish` | DENY / impossible contract |

## 5. Commerce acceptance fixture model

Canonical access flow:

```text
product
  -> order OR organization_contract
  -> entitlement
  -> enrollment
  -> completion evidence
  -> certificate
```

Fixtures must represent, without production schema creation:

- free program version;
- paid individual product;
- active paid entitlement;
- expired entitlement;
- cancelled entitlement retaining history;
- organization with active/inactive memberships;
- organization contract with exact seat quantity and validity window;
- assigned/released seats;
- immutable program version;
- enrollment/completion evidence;
- issued and revoked Academy certificate.

## 6. Commerce and entitlement acceptance cases

| ID | Case | Expected |
|---|---|---|
| COM-01 | Free program enrollment through explicit free path | ALLOW; no fake paid entitlement |
| COM-02 | Paid program uses free `self_enroll` bypass | DENY |
| COM-03 | Active individual entitlement enrolls matching program version | ALLOW |
| COM-04 | Entitlement for another product/program scope | DENY |
| COM-05 | Expired entitlement requests protected content | DENY while history remains |
| COM-06 | Cancellation deletes progress/history | DENY; history retained |
| COM-07 | Active institutional membership + available seat | ALLOW atomic seat assignment |
| COM-08 | Seat allocation above contract quantity | DENY atomically |
| COM-09 | Seat assignment after contract expiry | DENY |
| COM-10 | Seat assignment to inactive organization membership | DENY |
| COM-11 | Released seat erases prior learner progress | DENY |
| COM-12 | Program publishes new version during active cohort | Existing cohort remains pinned |
| COM-13 | Certificate requested with entitlement but no completion evidence | DENY |
| COM-14 | Certificate references mutable program identity only | DENY; exact `program_version_id` required |
| COM-15 | Certificate revocation hard-deletes certificate | DENY; append audit/revocation state |
| COM-16 | Academy purchase path reads/writes student wallet | DENY / forbidden dependency |

## 7. Authentication and route-isolation regression cases

Current Academy isolation work must remain protected by acceptance tests:

| ID | Case | Expected |
|---|---|---|
| ISO-01 | Teacher Google login callback | Returns only to Academy flow |
| ISO-02 | Missing/stale Academy return intent | Never routes teacher to `/app` or `/complete-profile` |
| ISO-03 | Academy route mounts student root AuthProvider/PWA/mobile providers | MUST NOT occur |
| ISO-04 | Teacher profile insert without actual Google identity | DENY |
| ISO-05 | Anonymous execution of Google-identity guard | DENY |
| ISO-06 | Academy admin password path creates teacher/self-service account | DENY |

## 8. Certificate invariants

Before certificate issuance is accepted:

1. enrollment is pinned to immutable `program_version_id`;
2. learner identity belongs to Academy domain;
3. completion/assessment evidence satisfies that version's policy;
4. entitlement policy is satisfied where the version is not free;
5. issuing principal has `ACADEMY_CERTIFICATE_ISSUE` in the required scope;
6. verification token/public lookup returns only certificate-safe public data;
7. revocation requires `ACADEMY_CERTIFICATE_REVOKE` and creates an audit event.

## 9. Required non-production evidence for a future implementation candidate

A later implementation branch must provide all of the following before any migration/apply request is considered:

- isolated PostgreSQL 17 positive/negative matrix for RBAC-01..14, COM-01..16, ISO-01..06;
- RLS enabled on every new Academy table;
- zero direct client mutation grants on sensitive Academy tables;
- SECURITY DEFINER RPCs with pinned `search_path` and explicit capability/scope checks;
- transaction-safe seat allocation with concurrency/over-allocation test;
- immutable program-version/cohort/certificate references;
- audit coverage for capability changes, contract/seat changes, certificate issue/revoke;
- regression proof that student roles, student profile data, wallet/subscription tables and QB authoring capabilities are untouched;
- Academy and root typecheck/build/tests green;
- no remote/production database access in the acceptance run.

## 10. Gate after Stage 19A

```text
STAGE_19A=STARTED_NONPROD_ACCEPTANCE_SPEC
QUESTION_BANK_RUNTIME_CUTOVER=HOLD
IMPORT_CONTRACT_FORMAL_STATE=HOLD
ACADEMY_STUDENT_ISOLATION=PASS_BASELINE_WITH_REGRESSION_GUARDS_REQUIRED
ACADEMY_SCOPED_RBAC=SPEC_FROZEN_FOR_ACCEPTANCE
ACADEMY_COMMERCE_ENTITLEMENTS=SPEC_FROZEN_FOR_ACCEPTANCE
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
```

The next safe action, while QB/import gates remain open, is to create **non-production executable fixtures/tests** for this specification against an isolated local schema only. Those tests must not create or apply production migrations and must not connect to the production database.
