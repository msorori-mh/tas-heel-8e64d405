# SECONDARY STUDENTS APP — OPEN RISKS 02

| Risk | Severity | Current control / next action |
|---|---|---|
| PR #20 migration application is not verified | HIGH operational | Run Lovable read-only evidence prompt; never infer deployment from Git |
| No published Web CI checks | HIGH process | Add CI before routine merges; owner must manually review local evidence now |
| Post-migration production smoke not run | HIGH operational | Run correct/wrong grade, track, anon, subject, and admin smoke after authorized application |
| Full lint contains 55 non-format errors and 12 warnings | MEDIUM | Normalize CRLF separately, then fix hooks/typing/exports in separate PRs |
| 32,013 CRLF-only findings obscure lint | MEDIUM process | Dedicated line-ending-only PR with normalized-content proof |
| PR #16 remains open after #20 superseded its findings | LOW process | Owner decides whether to close without merge |
| PWA cache policy is not yet hardened | HIGH before PWA release | Follow four-PR plan; never cache sensitive routes/data or offline exams |
| PR #17/#18 have local checks but no Web CI evidence | MEDIUM process | Revalidate after migration smoke and before each owner-authorized merge |

No deploy, migration application, production write, or automatic merge occurred in Cycle-02.
