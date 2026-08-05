# CONTENT-ONBOARDING-HTML-IMPLEMENTATION-CORRECTION-07 Report

## Overview
This report details the implementation of strict message bridge corrections for sandboxed HTML interactive resources as specified in `CONTENT_ONBOARDING_HTML_IMPLEMENTATION_CORRECTION_07`.

---

## 1. Window Source Binding & Mandatory `expectedWindow`

- **Behavior when `expectedWindow` is missing / null / undefined**: Fail-closed rejection with `ValidationCodes.INVALID_EVENT_SOURCE`. No events are accepted without an explicit active `expectedWindow`.
- **Source Binding**: `event.source` must strictly match `expectedWindow` (which corresponds to `iframeRef.current.contentWindow`).
- **Uninitialized `iframeRef`**: Returns `null`/`undefined` for `expectedWindow`, resulting in immediate fail-closed rejection for all incoming postMessage events.
- **Post-Reload Stale Window Protection**: When an iframe reloads, `iframeRef.current.contentWindow` points to the newly instantiated `WindowProxy`. Messages sent by any previous/stale iframe instance have an `event.source` matching the old window, failing `eventSource === expectedWindow` equality check, and are strictly rejected.
- **No Overloads / Public Bypass**: The `validateEventPayload` method signature strictly requires both `eventSource` and `expectedWindow` parameters.

---

## 2. Strict Top-Level Event Schema

- **Allowed Keys Allowlist (Exact 7 Keys)**:
  - `resource_code`
  - `resource_version`
  - `session_nonce`
  - `event_type`
  - `event_sequence`
  - `timestamp`
  - `payload`
- **Rejections**:
  - Any extra top-level field is rejected.
  - Any missing top-level field is rejected.
  - Any `Symbol` property or `Function` is rejected.
  - Any object with a prototype other than `Object.prototype` or `null` is rejected.
  - Arrays, non-enumerable properties, and getters/setters are rejected.

---

## 3. Strict Payload Schemas Per `event_type`

1. **`resource_ready`**:
   - `payload` must be an empty plain object (`{}`).
   - Extra fields are rejected.

2. **`resource_started`**:
   - `payload` must be an empty plain object (`{}`).
   - Extra fields are rejected.

3. **`interaction`**:
   - `interaction_type` is required (non-empty string, length $\le 100$).
   - Optional `target` and `action` strings (length $\le 100$).
   - Unknown keys are rejected.

4. **`step_completed`**:
   - `step` is required (non-empty string, length $\le 100$).
   - Missing `payload` or missing `step` is rejected.
   - Extra fields are rejected.

5. **`experiment_completed`**:
   - Allowed optional keys: `summary` (string $\le 200$), `completed_at` (finite number), `duration_seconds` (finite number $\ge 0$).
   - Any untrusted scoring keys (`score`, `points`, `correct_answer`, `trusted_result`, etc.) are rejected.
   - Does NOT mark the entire lesson complete; only records resource completion.

6. **`resource_error`**:
   - `error_code` is required (non-empty string, length $\le 50$).
   - Optional `message` (string $\le 200$, must not contain HTML tags or stack traces).
   - Missing `error_code` or extra keys are rejected.

7. **`resize_request`**:
   - `height` is required (finite, non-NaN number between 1 and 5000 px).
   - Infinity, NaN, negative values, or extra fields are rejected.

---

## 4. Tests & Verification Summary

### New Test Cases Added:
- **Test 41**: `Source binding: missing expectedWindow -> REJECT`
- **Test 42**: `Source binding: null expectedWindow -> REJECT`
- **Test 43**: `Source binding: wrong event.source -> REJECT`
- **Test 44**: `Source binding: correct active iframe window -> PASS`
- **Test 45**: `Source binding: stale previous iframe window -> REJECT`
- **Test 46**: `Top-level schema: extra field -> REJECT`
- **Test 47**: `Top-level schema: missing field -> REJECT`
- **Test 48**: `Payload schema: step_completed without payload -> REJECT`
- **Test 49**: `Payload schema: step_completed without step -> REJECT`
- **Test 50**: `Payload schema: extra payload field -> REJECT`
- **Test 51**: `Payload schema: valid step_completed -> PASS`
- **Test 52**: `Payload schema: experiment_completed with score -> REJECT`
- **Test 53**: `Payload schema: resize_request with Infinity -> REJECT`
- **Test 54**: `Payload schema: resource_error without error_code -> REJECT`
- **Test 55**: `Payload schema: resource_error with HTML or stack trace -> REJECT`

### Final Test Suite Result:
- **Total Unit Tests Executed**: 87
- **Passed**: 87
- **Failed**: 0
- **TypeScript Check (`tsc --noEmit`)**: Clean (Exit code 0)
- **Production Build (`npm run build`)**: Clean (Exit code 0)
- **Git Whitespace & Formatting (`git diff --check`)**: Clean (Exit code 0)
