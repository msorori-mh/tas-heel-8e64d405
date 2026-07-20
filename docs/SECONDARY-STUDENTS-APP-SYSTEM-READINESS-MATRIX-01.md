# SECONDARY STUDENTS APP — SYSTEM READINESS MATRIX 01

| System | Status | Evidence / remaining gate |
|---|---|---|
| Student homepage/navigation/mobile | Complete in PR, unmerged | PR #17; final independent review 0/0/0; build/typecheck/scoped lint pass. |
| Subjects, units, lessons, empty states | Partially complete | UX improvements delivered; deployed content-gate behavior unverified. |
| Student progress | Partially complete | Existing progress surfaces retained; comprehensive accuracy integration tests remain P1. |
| Search/navigation | Partially complete | Mobile navigation and recovery improved; broader search coverage remains P1. |
| Free authenticated lesson access | Broken/security HOLD | UI pivot exists; local `can_access_lesson` has a confirmed cross-grade HIGH gap. |
| Lesson resources | Partially complete | Source policies use lesson gate; inherits lesson-gate HOLD and deployed state is unknown. |
| Accounts/profile | Partially complete | Existing profile and owner RLS audited; deployed DB integration proof absent. |
| Anonymous denial | Partially complete | Content policies are authenticated; PUBLIC boolean oracle hardening remains MEDIUM. |
| Wrong grade/curriculum denial | Broken | Lesson gate lacks grade enforcement; exam/practice source has scope checks. |
| `content_manager` separation | Needs user decision | No central student-route hard block; desired redirect/preview behavior unresolved. |
| Question bank/templates | Partially complete | Existing admin/template foundation; subject-only free access is blocked by stale `can_access_subject`. |
| Exam/practice start | Complete in source, production unverified | Free-access source and tests pass; deployed RPC definition unknown. |
| Answer secrecy | Complete in source, production unverified | Local RPC reveal mask plus client defense-in-depth; needs deployed integration verification. |
| Double-result prevention | Complete in source, production unverified | Client single-flight plus local row-lock/terminal-state logic; not retry-idempotent. |
| Network-loss exam recovery | Complete in PR, unmerged | PR #18 reconciles server state after ambiguous submit; tests pass. |
| Results/performance analysis | Partially complete | Existing results retained; full strengths/weaknesses analytics remains P1. |
| Wallet/subscription/payments student UX | Frozen as required | Free-access notices replace payment requests; admin financial pages preserved. |
| Admin payments/financial structure | Preserved | No deletion or production change. |
| PWA/mobile installability | Not started | WAVE-2 blocked by WAVE-1 security HOLD. |
| Admin reporting/notifications | Not started | WAVE-3 blocked by PWA gate. |
| Build | Ready | Baseline and PRs #17/#18 builds pass. |
| Typecheck | Ready | Baseline and PRs #17/#18 pass. |
| Scoped lint | Ready | Changed files pass. |
| Full lint | Broken baseline | Repository-wide CRLF/Prettier findings require a dedicated decision/PR. |
| Automated tests | Partial foundation | PR #18 adds node:test; PR #16 adds audit characterization; DB integration suite absent. |
| Web CI | Not implemented/observed | No PR checks reported and no workflow found. |
| Production migration verification | Needs user/external evidence | Migration files are not proof of deployment. |

Final readiness: `HOLD_SECONDARY_STUDENTS_APP_MULTI_AGENT_CYCLE`.

No deployment or production write occurred.
