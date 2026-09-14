# Teacher Academy — Stage 20C: Pricing, Plan Catalog, Organization Contract UX & Certificate Acceptance

**Mode:** design / non-production only  
**Baseline main:** `ddf4517d12155cae25ba36da3dcb7454fb6cdbdc`  
**Production writes:** forbidden  
**Migration apply:** forbidden  
**Deploy:** forbidden  
**Runtime/schema changes:** forbidden  
**QB runtime integration:** disabled

## 1. Gate review at start of Stage 20C

The full Teacher Academy programming gate remains closed.

| Gate | State | Current evidence / decision |
|---|---|---|
| Question-bank runtime stability | HOLD | PR #58 remains open + draft and explicitly states runtime default remains `LEGACY`; no final cutover is approved. |
| Import contract | HOLD_FORMAL | PR #96 remains open + draft with an explicit HOLD pending CF10/CF11 completion, PostgreSQL regression, publication proof, E2E and build evidence. |
| Student curriculum/content baseline | PASS_STRONG_BASELINE | Current main includes Offline-First student runtime, track-specific ministerial flows and Android session-persistence release work. These improve the student baseline but do not close QB/import formal gates. |
| Teacher/student isolation | PASS_BASELINE | Academy teacher OAuth/profile routes are separated from student app routes/providers; `auth.users` is only the shared identity anchor. |
| Academy scoped RBAC | PARTIAL | Current `academy.capability_grants` remains global by `(user_id, capability)`; organization/program/cohort scoping is still a frozen target, not runtime. |
| Academy commerce / contracts / entitlements | NOT_IMPLEMENTED_TARGET | Current learner API still exposes `academy.self_enroll`; no canonical Academy entitlement layer exists on main. |
| Critical security blockers | NOT_ZERO | `admin_curriculum_force_delete` remains callable by `authenticated` on current main through a later migration. It must be retired or constrained outside client reach before any production expansion gate is opened. |

## 2. Product separation rule

Teacher Academy remains a separate product surface and authorization/commercial domain.

- Shared `auth.users` means identity only.
- Student `app_role`, profile fields, student wallet/subscription, student certificates and student PII never create Academy access.
- Academy roles/capabilities never imply student-admin capabilities.
- Academy roles never imply `qb_edit`, `qb_review` or `qb_publish`.
- Academy purchases/contracts/entitlements are independent from Student Tamkeen commerce.
- Academy certificate records are independent from Student Tamkeen certificate records.
- No Academy UX failure state redirects to `/app`, `/complete-profile` or student purchase flows.

## 3. Plan catalog — frozen architecture, prices intentionally unset

Exact monetary values are owner/business decisions and are not invented in this stage.

### PLAN-A — Public / Preview

Purpose: discovery before purchase or institutional assignment.

Includes only:

- public program catalog metadata;
- public instructor/program information approved for publication;
- explicitly public sample material;
- certificate verification by verification code.

Does not create an entitlement or enrollment.

Price field: `TBD_OWNER_DECISION`.

### PLAN-B — Individual Program Access

Purpose: one teacher purchases/accesses one immutable `program_version`.

Commercial path:

`product -> order -> payment/approval -> ACTIVE entitlement -> enrollment`

Rules:

- one entitlement is tied to one teacher and one immutable program version;
- purchase cannot be inferred from a student subscription;
- entitlement state controls protected learning access;
- completed historical evidence is not silently deleted after expiry/revocation;
- refund/cancellation behavior must be explicit and auditable.

Price field: `TBD_OWNER_DECISION`.

### PLAN-C — Individual Multi-Program / Period Pass

Purpose: optional future bundle giving an individual teacher access to a bounded set of Academy products for a fixed period.

Not authorized for runtime implementation yet.

Required safeguards before implementation:

- explicit included-product list or catalog rule;
- start/end dates;
- no automatic access to future products unless contractually specified;
- entitlement snapshots retain the products/program versions originally granted;
- renewal creates a new commercial period rather than rewriting history.

Price field: `TBD_OWNER_DECISION`.

### PLAN-D — Organization Contract

Purpose: school, education office or other organization purchases a bounded number of teacher seats.

Commercial path:

`organization -> contract -> seat pool -> temporal membership -> seat assignment -> entitlement -> enrollment`

Contract must define at minimum:

- organization identity;
- contract reference;
- start and end dates;
- seat quantity;
- included products/program versions or catalog scope;
- renewal policy;
- suspension/termination policy;
- reporting scope;
- certificate policy if contract-specific;
- audit owner.

Price/discount fields: `TBD_OWNER_DECISION`.

## 4. Pricing governance rules

No price is hard-coded into a program definition.

Target model:

`program_version` = educational artifact  
`product` = sellable Academy offer  
`price/version` = commercial decision  
`entitlement` = access right produced by an approved commercial/free policy

Rules:

1. Editing a price never mutates historical orders/contracts.
2. Editing catalog marketing text never mutates a published program version.
3. A zero-price/free offer must still generate an explicit entitlement policy; profile existence is not enough.
4. Discounts must be represented as commercial evidence, not hidden changes to the educational program.
5. Institutional pricing must never expose another organization's contract terms.
6. Taxes/currency/payment-provider rules remain out of scope until the business owner selects the operating jurisdiction/provider.

## 5. Organization contract UX journey

### 5.1 Organization Manager — contract overview

The non-production UX contract must show:

- active contract reference;
- validity period;
- seats purchased;
- seats assigned;
- seats available;
- included program/product scope;
- contract state;
- renewal/expiry warning;
- link to organization-scoped audit history.

Must not show:

- student data;
- unrelated organizations;
- another organization's prices or contract documents;
- private teacher learning details outside the approved reporting contract.

### 5.2 Seat assignment journey

Expected states:

1. select eligible organization member;
2. select eligible product/program version within contract scope;
3. preview seat impact;
4. confirm assignment;
5. create organization-derived entitlement;
6. show assignment audit reference.

Mandatory rejection states:

- contract expired;
- contract suspended;
- no seats remaining;
- teacher not an active organization member;
- wrong organization;
- product outside contract scope;
- teacher already has an equivalent active entitlement;
- attempted cross-organization operation.

### 5.3 Seat release / membership expiry

Design rule:

- releasing a seat or expiring membership stops future organization-derived protected access according to contract policy;
- historical progress is retained;
- already issued valid certificates are not silently deleted;
- every transition is audited;
- a seat may not be silently transferred across organizations.

## 6. Individual purchase UX journey

The future learner UX must distinguish clearly between:

- `متاح مجانًا` — explicit free entitlement policy;
- `متاح لك` — active entitlement already exists;
- `يتطلب اشتراكًا/شراءً` — no entitlement;
- `قيد التفعيل` — pending order/approval;
- `موقوف مؤقتًا` — suspended entitlement;
- `انتهت الصلاحية` — expired entitlement;
- `تم سحب الوصول` — revoked entitlement.

`self_enroll` must not be a paid-access bypass. Before commerce runtime is implemented, mock/design journeys only are permitted.

## 7. Certificate acceptance journey

### 7.1 Eligibility

Certificate issue requires all of:

- Academy teacher identity;
- enrollment bound to one immutable `program_version_id`;
- required Academy learning completion;
- required Academy assessment threshold;
- valid entitlement origin or explicitly approved free-product policy;
- certificate-specific capability for manual issue/revoke operations when manual action is needed.

### 7.2 Learner certificate screen

Must show:

- certificate title;
- teacher name according to approved certificate identity policy;
- program and immutable version reference;
- issue date;
- verification code/link;
- current certificate state.

It must not expose student-profile fields or unrelated Academy administration data.

### 7.3 Public verification

Public verification exposes only the minimum approved payload:

- verification result;
- certificate title/program;
- certificate holder display name according to policy;
- issue date;
- state `ISSUED` or `REVOKED`;
- public verification reference.

No email, phone, organization-private contract data, progress details, assessment answers or student data.

### 7.4 Revocation

Revocation:

- requires explicit certificate capability and reason;
- records actor/time/reason;
- keeps issuance evidence;
- changes public verification state to revoked;
- does not delete learning evidence.

## 8. Role-specific acceptance boundaries

### Teacher Learner

Can see only own Academy entitlements, enrollments, progress, orders visible to the learner, and certificates.

### Trainer

Can see only explicitly assigned program/cohort learning operations. Trainer does not inherit commerce, organization contract or certificate-officer powers.

### Organization Manager

Can manage only organization members/seats/contracts allowed by organization scope. No cross-organization access and no Student Tamkeen data.

### Certificate Officer

Can perform certificate operations only within certificate scope. Cannot alter learner progress or commercial records.

### Support

Uses purpose-limited support views and audit references only; support is never a super-admin shortcut.

## 9. Non-production UX acceptance matrix

Before backend commerce work, mock/prototype acceptance must cover at least:

| Journey | Success | Mandatory failure states |
|---|---|---|
| Individual program access | active entitlement -> enrollment | pending, suspended, expired, revoked, no entitlement |
| Organization seat assignment | valid contract + member + available seat | expired/suspended contract, no seats, wrong org, inactive member |
| Contract renewal | new commercial period | no mutation of historical contract |
| Program version retired from sale | historical enrollment remains usable per entitlement policy | cannot silently rebind to another version |
| Certificate eligibility | completion + assessment + valid entitlement | incomplete learning, failed threshold, invalid entitlement |
| Certificate verification | minimum public payload | unknown code, revoked certificate |
| Role boundaries | in-scope operation succeeds | cross-org/cross-role/student/QB operations denied |

## 10. Owner/business decisions intentionally deferred

The following require explicit business approval before runtime implementation and are not decided here:

- actual prices;
- currency/currencies;
- payment gateway;
- refund windows and fees;
- whether PLAN-C ships in MVP;
- organization discount model;
- seat reuse rules after withdrawal;
- invoice/tax requirements;
- grace period after entitlement/contract expiry;
- certificate fee, if any.

Until approved, UX should use neutral placeholders and state transitions rather than fabricated commercial amounts.

## 11. Production/security blockers carried forward

No production Academy expansion until all applicable gates are PASS:

- `QUESTION_BANK_FINAL_RUNTIME_CUTOVER=PASS`, or a formally approved MVP proves zero QB runtime dependency;
- `IMPORT_CONTRACT_FORMAL_GATE=PASS`;
- `ACADEMY_SCOPED_RBAC_RUNTIME=PASS`;
- `ACADEMY_COMMERCE_ENTITLEMENT_RUNTIME=PASS`;
- curriculum force-delete client execution is retired or constrained behind a non-client server/environment gate;
- critical security blockers = 0.

## 12. Stage 20C decision

```text
STAGE_20C=STARTED_DESIGN_ONLY
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
ACADEMY_NONPROD_DESIGN_GATE=OPEN
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED
TEACHER_STUDENT_ISOLATION=PASS_BASELINE
ACADEMY_PLAN_CATALOG=FROZEN_ARCHITECTURE_PRICES_TBD
ACADEMY_ORG_CONTRACT_UX=FROZEN_DESIGN
ACADEMY_CERTIFICATE_ACCEPTANCE=FROZEN_DESIGN
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
```

## 13. Next safe stage if gates remain closed

**Stage 20D — Non-production clickable subscription/contract/certificate UX prototype and role-denial acceptance pack**, using mock data only. It must not call Supabase, payment APIs, student runtime APIs or QB runtime APIs and must not add schema/migrations.