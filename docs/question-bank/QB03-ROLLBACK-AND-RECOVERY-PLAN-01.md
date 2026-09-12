# QB03-ROLLBACK-AND-RECOVERY-PLAN-01

Rollback and recovery design for QB-03 cutover — **without deleting history**.

| Field | Value |
|---|---|
| Package | `QB03-LEGACY-BACKFILL-AND-RUNTIME-CUTOVER-DESIGN-01` |
| Kind | Design only |
| Data delete on rollback | **FORBIDDEN** |
| Runtime changes in this package | **ZERO** |

---

## 1. Principles

1. Revert **runtime config / cutover mode**, not content history.
2. Stop writers that caused divergence.
3. Preserve all `question_revisions` (including R1 and later).
4. Preserve all attempts / answers / reviews.
5. Restore authoritative **legacy reads** for new sessions when rolling back before QB_PRIMARY stabilization.
6. Prevent mixed-session corruption (one session → one pin mode for life).

```text
ROLLBACK != empty-table wipe != DELETE HISTORY != DROP REVISIONS
```

---

## 2. Rollback actions by stage

### From DUAL_READ → LEGACY

| Action | Detail |
|---|---|
| revert runtime config | cutover mode = LEGACY; `attempt_pin_mode` remains LEGACY |
| stop writers | Disable dual-read/admin QB delivery probes if any |
| preserve revisions | Keep R1+ rows |
| preserve attempts | No change |
| restore legacy reads | Already authoritative |
| mixed-session | N/A |

### From SHADOW_COMPARE → DUAL_READ or LEGACY

| Action | Detail |
|---|---|
| revert runtime config | Disable shadow compare flag/mode |
| stop writers | Stop shadow persistence if any ancillary tables; SoT scores untouched |
| preserve revisions | Keep |
| preserve attempts | Legacy attempts unchanged; discard or retain shadow telemetry (`NEEDS_OWNER_DECISION` retention) |
| restore legacy reads | Student path already legacy |
| mixed-session | Ensure no session was created as REVISION_PINNED during shadow (design forbids) |

### From QB_PRIMARY → SHADOW_COMPARE (or DUAL_READ)

| Action | Detail |
|---|---|
| revert runtime config | New sessions → `attempt_pin_mode=LEGACY`; cutover mode prior stage |
| stop writers | Pause revision-pin create path for students; staff edit may continue as DRAFT |
| preserve revisions | **Keep all published/draft revisions** |
| preserve attempts | In-flight REVISION_PINNED sessions **complete on pin path**; do not rewrite to legacy |
| restore legacy reads | New sessions use legacy RPCs |
| mixed-session | Hard rule: never convert pin mode on existing session rows |

### From LEGACY_READ_ONLY → QB_PRIMARY

| Action | Detail |
|---|---|
| revert runtime config | Re-enable controlled legacy cache sync writer if required |
| stop writers | N/A (re-enable specific sync only) |
| preserve revisions | Keep |
| preserve attempts | Keep |
| restore legacy reads | Emergency legacy read allowed |
| mixed-session | Unchanged |

### From LEGACY_RETIRED → LEGACY_READ_ONLY

| Action | Detail |
|---|---|
| revert runtime config | Re-open legacy read paths for break-glass |
| stop writers | Legacy delivery writers stay off unless owner explicitly re-enables |
| preserve revisions / attempts | Keep forever unless separate retention decision |
| restore legacy reads | Break-glass only |
| mixed-session | Unchanged |

---

## 3. What must never happen during rollback

| Forbidden | Reason |
|---|---|
| DELETE FROM question_revisions | Destroys audit & publish history |
| DELETE student attempts/answers | Destroys grades |
| Flip `attempt_pin_mode` on open sessions | Mixed-session corruption |
| Silent fallback REVISION_PINNED → LEGACY mid-grade | Wrong answer semantics |
| Re-shuffle snapshot options | Changes meaning of selected codes |
| Re-backfill overwrite R1 on hash mismatch | Use HOLD_RECONCILIATION |
| Drop legacy columns in panic | Retention = owner decision later |

---

## 4. Recovery playbooks (design)

### R1 / shadow mismatch spike

1. Freeze cutover transition (stay in SHADOW_COMPARE or roll to DUAL_READ).
2. Export mismatch report (question_id, field, legacy value, qb value).
3. Classify: content defect vs mapping bug vs target drift.
4. Fix via **new revision** or HOLD queue — not silent R1 mutate.
5. Re-run shadow until zero-tolerance fields clear.

### Partial backfill interrupt

1. Resume by idempotency keys (`source_question_id`, `backfill_version`, fingerprint).
2. NOOP rows with same source hash.
3. HOLD_RECONCILIATION on hash drift.
4. No duplicate targets/revisions.

### Publish pointer incident

1. Use QB-01 publish RPC invariants only.
2. If pointer/consistency broken, stop cutover; repair via authorized RPC — not client UPDATE.
3. Rollback mode to LEGACY/DUAL_READ for new sessions.

### Concurrent student load during rollback

1. Drain or allow in-flight sessions to finish on their pin mode.
2. Block new REVISION_PINNED creates when rolling back from QB_PRIMARY.
3. Monitor submit/grade error rates.

---

## 5. Evidence retained after rollback

- All revisions + children
- All exam_session_questions / answers
- All practice_attempts / responses / reviews
- Backfill audit / idempotency ledger
- Shadow mismatch reports (telemetry retention = `NEEDS_OWNER_DECISION`)

---

## 6. Rollback readiness checklist (gate)

- [ ] Documented prior mode and target mode
- [ ] Owner approval recorded
- [ ] Writer stop list identified
- [ ] Open session counts by `attempt_pin_mode`
- [ ] Monitoring dashboards live
- [ ] No delete scripts in runbook
- [ ] Communication plan for staff (`NEEDS_OWNER_DECISION` timing)

---

## 7. Package constraints

This plan is documentation only. No SQL, no config mutation, no deploy.
