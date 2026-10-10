# Stage 21F — Teacher Academy Program Catalog, Versioning & Certificate Issuance Contract

Status: **DESIGN ONLY / NON-PRODUCTION / NOT APPROVED FOR RUNTIME**  
Baseline reviewed: `main@fed783774d10d48f776faaecf9b2e6bb57150aa7` (2026-10-08); PR #58 QB-03 remains open/draft with LEGACY default; PR #96 V2 import remains open/draft/HOLD. This document does not close any gate.

## 1. Product boundary and source of truth

The current Academy is a **Legacy/Pilot**. Its records are not automatically equivalent to the target catalog, paid entitlements, or issued certificates. The target Academy catalog is independent of Student curriculum/question-bank schemas, Student subscriptions, and Student progress. Shared authentication identity does not mean shared persona authorization.

**Student**, **Teacher**, **Academy Admin**, and **Organization** workspaces remain logically separate. Dual-persona users explicitly select an active workspace. All commands and audit records carry `persona` and effective `scope`. Teacher-only learning and certificates cannot be granted by Student capabilities.

## 2. Proposed catalog contract (not a migration)

Conceptual identifiers:
- `program_id`: stable Academy training-program identity, not a Student curriculum ID.
- `program_version_id`: immutable published training definition.
- `module_id` and `module_version_id`: module lineage and immutable content version.
- `assessment_blueprint_version_id`: immutable assessment specification used by a given program version.
- `catalog_release_id`: optional published catalog snapshot for discovery/contracting.

A published version must snapshot: Arabic display title; audience/eligibility; intended learning outcomes; estimated duration; module order and prerequisites; mandatory vs optional components; evaluation blueprint; minimum completion/pass rules; certificate template version; applicable policy version; publication effective time; and approved scope. No Student question bank cutover is implied.

Proposed states: `DRAFT → IN_REVIEW → APPROVED → PUBLISHED → RETIRED`. Rejection returns to `DRAFT`; `SUSPENDED` temporarily prevents new enrollment without deleting existing learner history. `PUBLISHED` content is immutable; correction requires a new version or an explicitly auditable erratum that does not change grading semantics.

A new program version never silently rewrites previous learner progress or regrades historical attempts. Program version is pinned at enrollment, assessment attempt, and certificate issuance.

## 3. Target enrollment and version-selection semantics

The commercial chain is `Plan → Contract → Entitlement → Enrollment`. Enrollment requires active Teacher persona, scoped entitlement, eligible program version, and capacity where organization seats apply. Legacy `self_enroll` is pilot-only and must not be interpreted as a paid contract.

A contract must explicitly select the program/version eligibility rule (`EXACT_VERSION` or `LATEST_ELIGIBLE_AT_ENROLLMENT`). `LATEST_ELIGIBLE` resolves **once**, at enrollment; it must not silently advance existing learners to a new version. Existing learners retain progress, assessment history, and certificate eligibility against their pinned version.

Proposed transition choices requiring owner approval:
- **Finish-on-old-version** (recommended default): current learners complete the version originally enrolled.
- **Opt-in upgrade**: only with an approved module/assessment equivalence map, explicit learner consent, and auditable transfer. Never copy raw assessment answers or issue a new certificate automatically.
- **Mandatory re-enrollment**: exceptional, separately approved safety/regulatory case, with explicit communications and refund/seat handling.

No option is activated by this design document.

## 4. Training program design template

For each candidate program, a curriculum owner prepares a non-runtime design sheet with: program title, intended teacher cohort, prerequisites, competency outcomes, module syllabus, theory/practice balance, sample tasks, assessment types, passing rules, estimated hours, accessibility/RTL requirements, and certificate text.

Suggested initial **design-only** tracks:
1. Effective secondary-school teaching and lesson planning.
2. Student assessment, item quality, and feedback.
3. Digital classroom methods and responsible AI use.
4. Subject-specific teaching methods and practical classroom applications.

These are candidate tracks, **not approved programs**, and require academic review before publication.

## 5. Certificate issuance decision contract

Issuance requires **all** of:
- Teacher persona enrollment pinned to a specific `program_version_id`;
- evidence of every mandatory learning component completed under the approved rules;
- a valid passing assessment result tied to the approved blueprint and integrity checks;
- no active issuance hold, fraud/security hold, or unresolved mandatory review;
- explicit authorization of the issuance service for Teacher Academy only;
- an idempotency key preventing duplicate issuance for the same eligible completion.

A certificate record conceptually includes: opaque certificate identifier, Teacher persona subject, exact program/version, issuance time, certificate/template/policy version, issuing organization, verification status, and immutable audit/evidence reference. Avoid exposing internal user IDs, scores, raw answers, or organization membership in public verification.

Certificate lifecycle: `ISSUED → SUSPENDED → REVOKED`, with `REINSTATED` permitted only through a separately authorized, audited review. Do not physically delete certificate history. Normal subscription expiry alone does not invalidate an already-valid certificate (recommended policy; owner approval still required). An appeal records reviewer independence, original decision, evidence, and outcome.

Public verification defaults to minimum necessary: certificate validity/status, program title, version or date, issuing entity, and issue date. **Whether the teacher's public display name is shown requires owner/privacy approval.** Never disclose assessment answers, scores, subscription details, Student-persona data, or internal identifiers.

## 6. Organization seats and visibility

An organization may allocate only seats from its scoped entitlement pool. Seat assignment does not transfer ownership of teacher progress or certificates. Organization reporting may show assigned seats and coarse program progress **only at an approved granularity**; no raw answers, Student records, or cross-organization lookup. Post-progress seat reuse requires an explicit approved release/reassignment rule and audit.

## 7. Non-production acceptance cases (future tests, not executed here)

| ID | Scenario | Required outcome |
|---|---|---|
| CAT-01 | Publish program version and then edit scoring threshold in place | DENY; new version required |
| CAT-02 | Enroll Teacher in version V1; publish V2 | V1 remains pinned |
| CAT-03 | Student-only persona attempts Teacher catalog enrollment | DENY |
| CAT-04 | Dual persona changes workspace | No inherited roles, subscriptions, progress, attempts, or certificates |
| CAT-05 | ORG-A seat manager attempts ORG-B enrollment | DENY |
| CAT-06 | Pilot self-enroll record presented as paid entitlement | DENY |
| CAT-07 | Repeat eligible certificate issuance command | Exactly one certificate; idempotent response |
| CAT-08 | Incomplete mandatory module or invalid assessment | No certificate |
| CAT-09 | Teacher entitlement expires after valid issuance | Preserve certificate validity unless separate revocation |
| CAT-10 | Public verification query requests raw answers or Student data | DENY / omit |
| CAT-11 | Version upgrade without consent/equivalence approval | DENY |
| CAT-12 | Revocation attempted by same unscoped client | DENY; privileged review/audit required |
| CAT-13 | Program retired after enrollment | Historical evidence remains readable under policy |
| CAT-14 | Organization requests individual answer sheets | DENY by default |

Future execution of these tests requires an isolated environment, a pinned schema/commit, positive and negative authorization evidence, and signed review. This document does not claim that any tests passed.

## 8. Owner decisions and blocking dependencies

Owner approval is required for: catalog publication authority; mandatory module/completion thresholds; assessment integrity and retake policy; certificate naming/public fields; appeal window (14 days proposed, not approved); certificate revocation and second-review authority; upgrade/equivalence policy; post-progress seat reuse; retention periods; and organization reporting granularity.

External gate dependencies remain: QB-03 formal cutover evidence (PR #58), V2 import CF10/CF11 and full PostgreSQL/E2E evidence (PR #96), scoped RBAC and entitlement lifecycle, and signed final-schema negative authorization/security tests. **Do not infer gate PASS from this document.**

## 9. Execution restrictions and exit criteria

This stage authorizes **documentation and future non-production contract/test design only**. It does **not** authorize application code, schema changes, migrations, database writes, deployment, payments, QB cutover, Student-app changes, or production pilot conversion.

Exit for this design package: academic owner reviews the catalog template, product/security owners resolve the listed policy decisions, and acceptance cases are linked to a future test evidence pack. Until then: `ACADEMY_FULL_PROGRAMMING_GATE=CLOSED`.
