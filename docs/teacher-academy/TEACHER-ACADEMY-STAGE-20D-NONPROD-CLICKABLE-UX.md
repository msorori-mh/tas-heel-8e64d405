# Teacher Academy — Stage 20D: Non-Production Clickable Subscription / Contract / Certificate UX

**Mode:** UX prototype / mock data only  
**Parent design:** Stage 20C  
**Production writes:** forbidden  
**Migration apply:** forbidden  
**Deploy:** forbidden  
**Runtime/schema changes:** forbidden  
**Supabase/API/payment/QB calls:** forbidden

## 1. Gate review

The full Teacher Academy programming gate remains closed.

| Gate | State | Decision |
|---|---|---|
| Question-bank runtime stability | HOLD | PR #58 remains open + draft and states runtime default remains `LEGACY`; no final cutover approval. |
| Import contract | HOLD_FORMAL | PR #96 remains open + draft with explicit HOLD pending CF10/CF11, PostgreSQL regression, publication proof, E2E and build evidence. |
| Student curriculum/content baseline | PASS_STRONG_BASELINE | Current main remains at `ddf4517d12155cae25ba36da3dcb7454fb6cdbdc`; student/mobile progress does not close Academy backend gates. |
| Teacher/student isolation | PASS_BASELINE | Shared identity may use `auth.users` only; Academy UX/roles/commerce/certificates remain separate. |
| Academy scoped RBAC | PARTIAL | Target scope by organization/program/cohort is frozen, but current runtime is not yet the target model. |
| Academy commerce / contracts / entitlements | NOT_IMPLEMENTED_TARGET | Current runtime still contains `academy.self_enroll`; canonical Academy entitlements are not yet implemented. |
| Critical security blockers | NOT_ZERO | Curriculum force-delete client reachability remains a pre-production blocker until retired or constrained outside client reach. |

## 2. Stage objective

Stage 20D converts the frozen Stage 20C UX contracts into a clickable, Arabic RTL, non-production prototype using only hard-coded mock data.

The prototype covers:

- plan catalog states without inventing prices;
- individual entitlement states;
- organization contract and seat allocation states;
- certificate eligibility, issue and verification states;
- role-specific screens and denial states;
- explicit teacher/student product separation.

It intentionally does **not** implement backend behavior.

## 3. Hard isolation rules

The prototype must remain safe even if opened locally in a browser.

- No `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` or external network libraries.
- No Supabase client import or environment variables.
- No payment provider integration.
- No `/app`, `/complete-profile` or student purchase navigation.
- No student `app_role`, wallet, subscription, certificate or PII fields.
- No `qb_edit`, `qb_review` or `qb_publish` capabilities.
- No production identifiers, secrets or real teacher data.
- All data shown in the prototype is synthetic.

## 4. Prototype roles

### Teacher Learner

Can inspect only mock own-plan/entitlement/enrollment/certificate states.

### Organization Manager

Can inspect only mock organization contract, seats and assignments for one synthetic organization.

### Trainer

Can inspect only a mock assigned cohort summary; no commerce or certificate administration.

### Certificate Officer

Can inspect mock certificate eligibility and revocation states; cannot edit learner progress or contracts.

### Support

Can inspect a purpose-limited mock audit/support view only.

## 5. Mock state coverage

### Individual entitlement

The prototype exposes:

- `ACTIVE` — access allowed;
- `PENDING` — activation not complete;
- `SUSPENDED` — temporary access stop;
- `EXPIRED` — access period ended;
- `REVOKED` — access withdrawn;
- `NONE` — no entitlement.

No state is derived from a student subscription.

### Organization contract

The prototype exposes:

- active contract with seats available;
- active contract with no seats remaining;
- expired contract;
- suspended contract;
- inactive organization membership;
- wrong-organization denial;
- product outside contract scope.

### Certificate

The prototype exposes:

- eligible / not yet eligible;
- issued;
- revoked;
- unknown verification code;
- minimum public verification payload.

## 6. Role-denial acceptance

The prototype must make denials visible rather than merely hiding controls.

Required denial examples:

1. Teacher Learner attempts organization seat management → denied.
2. Organization Manager attempts cross-organization assignment → denied.
3. Trainer attempts contract access → denied.
4. Certificate Officer attempts progress mutation → denied.
5. Support attempts certificate issuance → denied.
6. Any Academy role attempts student/QB administration → denied by product boundary.

## 7. Pricing behavior

No numeric prices are introduced in Stage 20D.

UI labels use neutral placeholders such as:

- `السعر يحدد لاحقًا`;
- `متاح لك`;
- `يتطلب اشتراكًا/شراءً`;
- `قيد التفعيل`.

This prevents mock UX from accidentally becoming a business decision.

## 8. Certificate public verification privacy

The mock public verification result may show only:

- verification status;
- certificate title/program;
- approved display name;
- issue date;
- `ISSUED` / `REVOKED` state;
- synthetic verification reference.

It must not show email, phone, assessment answers, progress details, organization contract terms or any student data.

## 9. Manual acceptance matrix

| Scenario | Expected outcome |
|---|---|
| Teacher with ACTIVE entitlement opens program | access CTA is enabled in mock UX |
| Teacher with PENDING/SUSPENDED/EXPIRED/REVOKED entitlement | protected access CTA is blocked with the correct reason |
| Organization Manager with valid contract and available seat | seat assignment preview is shown |
| Contract expired/suspended or no seats | assignment blocked with explicit reason |
| Cross-organization assignment | explicit denial |
| Certificate eligible | issue-preview state visible only to Certificate Officer |
| Certificate revoked | public verification shows revoked status without deleting evidence |
| Trainer opens commerce screen | explicit role denial |
| Support opens certificate issue action | explicit role denial |
| Any role opens student/QB admin boundary | explicit product-boundary denial |

## 10. Artifact

Clickable artifact:

`docs/teacher-academy/prototypes/stage-20d/index.html`

It is a standalone static file with inline CSS and JavaScript and synthetic mock data only.

## 11. Stage decision

```text
STAGE_20D=STARTED_NONPROD_CLICKABLE_UX
ACADEMY_FULL_PROGRAMMING_GATE=CLOSED
ACADEMY_NONPROD_UX_GATE=OPEN
ACADEMY_QB_RUNTIME_INTEGRATION=DISABLED
TEACHER_STUDENT_ISOLATION=PASS_BASELINE
ACADEMY_SCOPED_RBAC=UX_ACCEPTANCE_ONLY
ACADEMY_COMMERCE_ENTITLEMENTS=UX_ACCEPTANCE_ONLY
ACADEMY_CERTIFICATES=UX_ACCEPTANCE_ONLY
PRODUCTION_WRITE=NO
MIGRATION_APPLY=NO
DEPLOY=NO
```

## 12. Next safe stage if gates remain closed

**Stage 20E — Non-production UX accessibility and role-denial acceptance**, limited to the static prototype: responsive widths, keyboard/focus behavior, RTL semantics, status messaging, minimum public certificate payload and static checks proving no network/Supabase/student/QB integration.
