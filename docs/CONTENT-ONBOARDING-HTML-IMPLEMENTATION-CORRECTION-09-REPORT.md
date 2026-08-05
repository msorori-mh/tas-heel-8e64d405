# CONTENT-ONBOARDING-HTML-IMPLEMENTATION-CORRECTION-09 Report

## Overview
This report details the implementation of true physical iframe recreation and session isolation on interactive resource reload for `InteractiveResourceViewer.tsx`, as specified in `CONTENT_ONBOARDING_HTML_IMPLEMENTATION_CORRECTION_09`.

---

## 1. Actual Iframe Reload Implementation

- **Component**: `src/components/lessons/InteractiveResourceViewer.tsx`
- **State Management**:
  - `session`: state object tracking `generation` (number), `nonce` (cryptographic session nonce string), and `bridge` (`AppInteractiveResourceBridge` instance).
  - `activeWindow`: `WindowProxy | null`, initialized to `null` and set ONLY when `onLoad` event fires on the active iframe element.
- **Physical Iframe Recreation**:
  - Unique React key: `key={`${resource.resource_code}-${resource.version}-${session.generation}`}` on the `<iframe />` element.
  - On Reload (`handleReload`):
    1. Increment iframe generation (`session.generation + 1`).
    2. Generate fresh cryptographic `session_nonce` via `generateSessionNonce()`.
    3. Instantiate a fresh `AppInteractiveResourceBridge` (`lastSequence = 0`, `sessionStartTime = Date.now()`).
    4. Unbind expected window (`setActiveWindow(null)`).
    5. Reset local resource completion status (`setResourceReportedCompleted(false)`).
    6. Reset local events log (`setEventsLog([])`).
    7. Reset loading state and clear error messages.
    8. Changing React `key` forces physical unmounting of the old `<iframe>` DOM element and creation of a brand new `<iframe>` DOM element with a new `contentWindow`.

---

## 2. Source Binding & Stale Window Rejection

- **`onLoad` Window Binding**: `activeWindow` is bound to `iframeRef.current.contentWindow` strictly when the newly instantiated iframe finishes loading (`onLoad={handleIframeLoad}`).
- **Fail-Closed Pre-Load Protection**: Any `postMessage` event arriving while `activeWindow` is `null` (during bundle generation or iframe loading) is rejected immediately (`INVALID_EVENT_SOURCE`).
- **Source Equality**: `event.source` must strictly match `activeWindow`. Events posted from previous/stale iframe windows fail `event.source === activeWindow` and are rejected (`INVALID_EVENT_SOURCE`).
- **Nonce Isolation**: Events sent with previous session nonces fail `session_nonce === session.nonce` check and are rejected (`NONCE_MISMATCH`).
- **Listener Cleanup**: When `session.bridge` or `activeWindow` changes, React `useEffect` cleanup removes the previous message listener (`window.removeEventListener("message", handleMessage)`).

---

## 3. Real Component/DOM Integration Test

- **File**: `src/lib/interactive-resource-viewer-integration.test.ts`
- **Test 56 Verification Steps**:
  1. Component harness mounted (initial generation = 1).
  2. First iframe element (`iframe1`) and `contentWindow` (`win1`) obtained; verified `activeWindow` is `null` before `onLoad` and pre-load events are REJECTED.
  3. `onLoad` triggered (`activeWindow = win1`), valid event from `win1` with `nonce1` -> PASS.
  4. Reload clicked (`handleReload()`).
  5. Verified iframe element changed (`iframe2 !== iframe1` and `iframe2.key !== iframe1.key`).
  6. Verified new `contentWindow` differs from old (`win2 !== win1`) and `activeWindow` is reset to `null` before new `onLoad`.
  7. New `onLoad` triggered (`activeWindow = win2`). Event sent from old window (`win1`) -> REJECTED.
  8. Event sent with old nonce (`nonce1`) from new window (`win2`) -> REJECTED.
  9. Valid event sent from new window (`win2`) with new nonce (`nonce2`) -> PASS.
  10. Verified old message listener detached and does not affect active session state after reload.

---

## 4. Regression Controls

- **expectedWindow required**: Preserved (Fail-closed when null/missing).
- **Top-level exact schema**: Preserved (Exact allowlist of 7 top-level keys).
- **Payload schemas**: Preserved (Strict inner payload schemas per `event_type`).
- **UTF-8 limit**: Preserved (10KB limit).
- **Timestamps & Sequences**: Reset and validated per fresh session.
- **CSP exact bytes**: Preserved (SHA-256 Base64 inline hash calculation).
- **ZIP pre-materialization & URL normalization**: Preserved.
- **Capacitor disabled**: Preserved.
- **Lesson Completion Gate**: Preserved (`experiment_completed` does NOT mark lesson completed).

---

## 5. Verification Commands Log

- `npm test`: 88/88 passed (100%).
- `npx --no-install tsc --noEmit`: Exit code 0.
- `npm run build`: Exit code 0.
- `git diff --check`: Exit code 0.
