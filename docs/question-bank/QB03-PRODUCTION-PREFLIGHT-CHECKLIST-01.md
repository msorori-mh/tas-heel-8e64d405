# QB03-PRODUCTION-PREFLIGHT-CHECKLIST-01

Production gates for legacy backfill and runtime cutover. This package records the checklist only — it does **not** execute any gate.

| Field | Value |
|---|---|
| Package | `QB03-LEGACY-BACKFILL-AND-RUNTIME-CUTOVER-DESIGN-01` |
| Kind | Design / checklist only |
| Remote execution | **NO** (this package) |
| Deploy | **NO** |

---

## Gate sequence (ordered)

```text
1  Source merged
2  Local replay
3  Remote preflight
4  Remote migration
5  Dry-run
6  Backup
7  Backfill sample
8  Full backfill
9  Reconciliation
10 Shadow mode
11 Cutover
12 Monitoring
13 Rollback readiness
```

Each gate is **FAIL-CLOSED**: next gate blocked until owner (or designated approver) marks PASS.

---

## 1. Source merged

| Check | Pass criteria |
|---|---|
| QB-01 schema source | Merged to integration line used for cutover |
| QB-02 dry-run foundation (PR #56) | Merged or explicitly baselined as dependency |
| QB-03 design package | Merged as docs/contracts only |
| No surprise migrations | Diff shows only authorized migration files for later apply packages |

**Owner:** engineering lead  
**This package performs merge?** NO

---

## 2. Local replay

| Check | Pass criteria |
|---|---|
| Fresh local DB compile of QB-01 | PASS ×2 recommended |
| Hash golden vectors | `test:question-bank-hash` PASS |
| QB-01 source tests | PASS |
| QB-02 import dry-run tests | PASS |
| QB-03 design contract tests | PASS |
| No production credentials in logs | Confirmed |

---

## 3. Remote preflight

| Check | Pass criteria |
|---|---|
| Read-only inventory of legacy questions | Counts + invalid sampling |
| Usage evidence queries planned | assessment / template / session / lesson junctions |
| RLS / grants review | No student SELECT on answer key columns |
| Feature flags / config | Runtime still LEGACY |
| Window / staffing | `NEEDS_OWNER_DECISION` |

**Remote SQL apply in this package?** NO

---

## 4. Remote migration

| Check | Pass criteria |
|---|---|
| Authorized apply package exists | Separate from QB-03 design |
| Default `attempt_pin_mode` | **LEGACY** after apply |
| No backfill inside migration | Confirmed (QB-01 invariant) |
| Rollback SQL strategy | Forward-fix preferred; no destructive table drops |

**Executed by this package?** NO — gate definition only.

---

## 5. Dry-run

| Check | Pass criteria |
|---|---|
| Backfill dry-run on snapshot/copy | Classifications stable |
| QB-02 import dry-run (if Excel path) | accepted_set_hash stable |
| Idempotent re-run | NOOP on second pass |
| HOLD queues sized | Owner aware |

---

## 6. Backup

| Check | Pass criteria |
|---|---|
| DB backup taken | Restorable |
| Backup verified | Restore test or vendor confirm |
| Retention | `NEEDS_OWNER_DECISION` |

---

## 7. Backfill sample

| Check | Pass criteria |
|---|---|
| Sample size | `NEEDS_OWNER_DECISION` |
| Includes MCQ, manual, media, orphan, invalid | Coverage matrix |
| Zero corrupt PUBLISHED | Confirmed |
| Shadow spot-check | correct answer tolerance 0 |

---

## 8. Full backfill

| Check | Pass criteria |
|---|---|
| Batch size / parallelism | `NEEDS_OWNER_DECISION` |
| Resumable progress | Ledger continuous |
| Duplicate revision/target count | 0 |
| Invalid → HOLD_ROW | 100% |

---

## 9. Reconciliation

| Check | Pass criteria |
|---|---|
| source_payload_hash coverage | All processed rows |
| payload_hash verify | canonical_payload_v1 |
| Target linkage report | Orphans explained |
| HOLD_RECONCILIATION | 0 unresolved critical |

---

## 10. Shadow mode

| Check | Pass criteria |
|---|---|
| Enter SHADOW_COMPARE | Owner approval |
| correct answer mismatches | **0** |
| score mismatches (auto) | **0** |
| exam + practice surfaces | Both green |
| Exit criteria window | `NEEDS_OWNER_DECISION` |

---

## 11. Cutover

| Check | Pass criteria |
|---|---|
| Mode transition | Per state machine + owner approval |
| New sessions pin mode | Matches target mode |
| Open legacy sessions | Unaffected |
| Cutover clock time | `NEEDS_OWNER_DECISION` |

---

## 12. Monitoring

| Check | Pass criteria |
|---|---|
| Exam start/submit error rate | Within baseline |
| Practice grade errors | Within baseline |
| Snapshot create failures | Alerted |
| Shadow/canary mismatch | Alerted (0 tolerance fields) |
| Privilege / RLS denials | No unexpected surge |

---

## 13. Rollback readiness

| Check | Pass criteria |
|---|---|
| Rollback plan reviewed | `QB03-ROLLBACK-AND-RECOVERY-PLAN-01.md` |
| Writer stop list | Ready |
| Open session counts by pin mode | Known |
| Owner on-call | `NEEDS_OWNER_DECISION` schedule |
| No delete-on-rollback scripts | Confirmed |

---

## Hard exclusions for THIS package

```text
Migration changes: ZERO
Runtime changes: ZERO
SQL execution: NO
Deploy: NO
Production write: NO
```

Gates above are **future operational requirements**, not actions performed here.
