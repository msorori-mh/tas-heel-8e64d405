# CONTENT_ONBOARDING_HTML_IMPLEMENTATION_CORRECTION_13 REPORT

## Summary of Execution
This report documents the isolated component test suite created for `InteractiveResourceViewer` under JSDOM in Draft PR #59 (`feat/content-onboarding-html-interactive-mvp-01`).

All security and state boundary invariants have been proven through real React component renders (`InteractiveResourceViewer.tsx`) and standard `HTMLIFrameElement` DOM instances.

---

## Isolated Test Matrix

### 1. Old Window Test
* **Test Name**: `rejects old iframe window after new iframe has loaded`
* **Source Window**: `win1` (stale contentWindow from generation 1 iframe)
* **Nonce Used**: `nonce2` (valid active generation 2 session nonce)
* **Iframe Load State**: `iframe2` loaded (`onLoad` fired, `activeWindow === win2`)
* **Expected Rejection Reason**: `MISSING_OR_INVALID_SOURCE_WINDOW` (`event.source !== activeWindow`)
* **Result**: **PASS (REJECTED)**
* **Component State Before**: `receivedEvents: 0`, `resourceReportedCompleted: false`
* **Component State After**: `receivedEvents: 0`, `resourceReportedCompleted: false` (unchanged)

### 2. Old Nonce Test
* **Test Name**: `rejects old nonce from active new iframe`
* **Source Window**: `win2` (active contentWindow from generation 2 iframe; `win1` NOT used)
* **Nonce Used**: `nonce1` (stale generation 1 session nonce)
* **Iframe Load State**: `iframe2` loaded (`onLoad` fired, `activeWindow === win2`)
* **Expected Rejection Reason**: `NONCE_MISMATCH` (`session_nonce !== activeNonce`)
* **Result**: **PASS (REJECTED)**
* **Component State Before**: `receivedEvents: 0`, `resourceReportedCompleted: false`
* **Component State After**: `receivedEvents: 0`, `resourceReportedCompleted: false` (unchanged)

### 3. Pre-load Test
* **Test Name**: `rejects valid new-session event before iframe onLoad`
* **Source Window**: `win2` (generation 2 contentWindow; `win1` NOT used)
* **Nonce Used**: `nonce2` (valid generation 2 session nonce extracted from contract/srcDoc; `nonce1` NOT used)
* **Iframe Load State**: Pre-load (`iframe2` mounted in DOM, but `onLoad` handler NOT yet executed; `activeWindow === null`)
* **Expected Rejection Reason**: `MISSING_OR_INVALID_SOURCE_WINDOW` (`activeWindow` is `null` fail-closed)
* **Result**: **PASS (REJECTED)**
* **Component State Before**: `receivedEvents: 0`, `resourceReportedCompleted: false`
* **Component State After**: `receivedEvents: 0`, `resourceReportedCompleted: false` (unchanged)

### 4. Valid New Event Test
* **Test Name**: `accepts valid new-session event after iframe onLoad`
* **Source Window**: `win2` (active generation 2 contentWindow)
* **Nonce Used**: `nonce2` (valid generation 2 session nonce)
* **Iframe Load State**: `iframe2` loaded (`onLoad` fired, `activeWindow === win2`)
* **Expected Rejection Reason**: None (Valid Event)
* **Result**: **PASS (ACCEPTED)**
* **Component State Before**: `receivedEvents: 0`, `resourceReportedCompleted: false`
* **Component State After**: `receivedEvents: 1` (`event_type: "interaction"`), `resourceReportedCompleted: false`

### 5. Experiment Completion Test
* **Test Name**: `experiment completion does not complete lesson`
* **Source Window**: `win1` (active generation 1 contentWindow)
* **Nonce Used**: `nonce1` (valid session nonce)
* **Iframe Load State**: Loaded (`activeWindow === win1`)
* **Expected Rejection Reason**:
  - Untrusted payload keys (`score`, `points`, `trusted_result`): **REJECTED** by Zod/Bridge schema validation.
  - Valid `experiment_completed` event: **ACCEPTED**.
* **Result**: **PASS**
* **Component State Before**: `receivedEvents: 0`, `resourceReportedCompleted: false`
* **Component State After**: `receivedEvents: 1` (`event_type: "experiment_completed"`), `resourceReportedCompleted: true` (UI badge "سجل المورد التفاعلي إكمال النشاط" rendered)
* **Lesson State Impact**:
  - **No Lesson Completion Callback Called**: `InteractiveResourceViewer` accepts only `resource` and `onEventTriggered` props; it contains NO lesson completion callbacks (such as `onLessonComplete`).
  - **Lesson Status**: Unchanged. Lesson completion relies strictly on server-side lesson progress API / backend verification, never on raw iframe client events alone.

### 6. Listener Lifecycle Test
* **Test Name**: `removes old listener on reload and current listener on unmount`
* **Source Window**: `win2`
* **Nonce Used**: `nonce2`
* **Iframe Load State**: Mounted -> Reloaded -> Unmounted
* **Result**: **PASS**
* **Invariants Proven**:
  - Exactly 1 net message listener active on initial mount.
  - Old message listener removed via `removeEventListener` upon session reload.
  - Exactly 1 net message listener active after session reload.
  - Single event processed exactly once (no duplicate processing).
  - Message listener removed via `removeEventListener` upon component unmount (net active listeners: 0).
  - Events dispatched after unmount are ignored and do not mutate state.

---

## Verification Commands Execution Log
- `npm test`: PASS (93/93 test cases clean)
- `npx --no-install tsc --noEmit`: PASS (0 type errors)
- `npm run build`: PASS (Production build clean)
