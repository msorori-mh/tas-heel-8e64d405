# Stage 20Y — Role and Scope Matrix

Design-only reference for the Teacher Academy.

## Role templates
| Role | Scope | Intended responsibility |
|---|---|---|
| Academy Administrator | Academy | governance and configuration |
| Catalog Manager | Academy / Program | catalog and program versions |
| Program Manager | Program | assigned program operations |
| Assessment Reviewer | Program / Assessment | academic review |
| Assessment Decision Authority | Program / Assessment | final academic decision |
| Certificate Officer | Program / Certificate | certificate operations |
| Certificate Appeal Reviewer | Program / Certificate | second-level review |
| Support Operator | Support queue | support handling only |
| Organization Contract Manager | Organization / Contract | contract operations |
| Organization Seat Manager | Organization / Contract | seat assignment and release |
| Organization Reporting Viewer | Organization | scoped reporting |
| Auditor | Academy / Organization | read-only history and decisions |

## Scope levels
Academy-wide; Organization; Contract; Program; Program Version; Assessment; Certificate; Support Queue.

## Design rules
- A role is only a template; actual access is limited by its active scope.
- Organization responsibilities never imply Academy-wide administration.
- Support responsibilities do not include changing academic outcomes.
- Review and final decision can be separated.
- Audit is read-only.
- Student workspace permissions are never reused as Teacher Academy permissions.
- Dual-persona users must explicitly operate in the Teacher Academy workspace for Academy actions.
- High-impact academic actions keep a reason and decision history.

## Acceptance checks
1. Organization users remain inside their organization scope.
2. Program managers remain inside assigned programs.
3. Support cannot rewrite assessment attempts.
4. Auditors cannot modify operational records.
5. Student-only users cannot enter Academy administration.
6. Dual-persona accounts keep Student and Teacher learning records separate.
7. Seat operations never transfer learning progress or certificates.
