# QB02 Implementation Correction 79 Report

> **Notice**: This report documents the implementation corrections executed under `QB02_IMPLEMENTATION_CORRECTION_79` (addressing `QB02_INDEPENDENT_FINAL_REREVIEW_78`) for Draft PR #56 (`feat/qb02-official-normalized-v1-import-foundation-49`) on repository `msorori-mh/tas-heel-8e64d405`.

---

## Executive Summary of Corrections

This correction implements a genuine fail-closed timeout wrapper around `PreviewTokenReplayStore.consumeOnce()`:

1. **Server-Side Timeout Constant**: Added `DEFAULT_PREVIEW_TOKEN_REPLAY_TIMEOUT_MS = 2000` inside `src/lib/server/question-bank/import/preview-token-server.ts`.
2. **Fail-Closed Timeout Implementation**: Implemented internal helper `consumeReplayOnceWithTimeout(...)` which uses `Promise.race` to race `store.consumeOnce(jti, expiresAt)` against a timeout promise. The timer is cleaned up via `clearTimeout` in a `finally` block to prevent timer leaks.
3. **Never-Resolving Store Verification**: Added unit test `Replay Store: never-resolving store times out and rejects token` using a store whose `consumeOnce()` returns `new Promise<boolean>(() => {})`. Verified token is rejected with `PREVIEW_TOKEN_INVALID` and execution resolves within the bounded timeout window (~58ms for a 50ms test timeout).
4. **Malformed Result Handling**: Verified non-boolean return values from `consumeOnce` throw and reject the token fail-closed.
5. **No Fallback**: Zero in-memory or file fallback exists in production code; missing store or store timeout/error always fails closed.
6. **Previous Reports Corrected**: Updated `docs/QB02-IMPLEMENTATION-CORRECTION-73-REPORT.md` and `docs/QB02-IMPLEMENTATION-CORRECTION-77-REPORT.md` clarifying that previous timeout tests covered store rejection only, whereas Correction 79 verifies true timeout handling for never-resolving promises.

---

## Detailed Implementation Summary

### 1. Replay Store Timeout Implementation
- **Constant**: `DEFAULT_PREVIEW_TOKEN_REPLAY_TIMEOUT_MS = 2000` (server-side constant, non-passable from browser/public requests).
- **Promise Race & Timer Cleanup**:
  ```ts
  async function consumeReplayOnceWithTimeout(
    store: PreviewTokenReplayStore,
    jti: string,
    expiresAt: number,
    timeoutMs: number = DEFAULT_PREVIEW_TOKEN_REPLAY_TIMEOUT_MS,
  ): Promise<boolean> {
    let timerId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timerId = setTimeout(() => {
        reject(new Error("Replay store operation timed out"));
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([
        store.consumeOnce(jti, expiresAt),
        timeoutPromise,
      ]);

      if (typeof result !== "boolean") {
        throw new Error("Malformed store result: expected boolean");
      }

      return result;
    } finally {
      if (timerId !== undefined) {
        clearTimeout(timerId);
      }
    }
  }
  ```
- **Fail-Closed Contract**:
  - `validatePreviewToken` wraps `consumeReplayOnceWithTimeout` in a `try/catch` block.
  - If `store.consumeOnce` times out, throws an error, or returns a non-boolean result, `validatePreviewToken` returns `PREVIEW_TOKEN_INVALID` (`{ ok: false, issues: [...] }`).

---

## Replay Regression Test Results

| Test Case | Result | Details |
| :--- | :---: | :--- |
| First Use | **PASS** | Returns `ok: true` on initial token consumption. |
| Second Use | **REJECT** | Returns `ok: false` (`PREVIEW_TOKEN_INVALID`) on second consumption attempt. |
| Concurrent Same JTI | **PASS** | `Promise.all` across 4 concurrent requests yields exactly 1 `true` and 3 `false`. |
| Copied Token | **REJECT** | Second token evaluation rejects token. |
| Store Throw | **REJECT** | Store error caught, token rejected fail-closed. |
| Never-Resolving Store (Hang) | **REJECT** | Store returning `new Promise(() => {})` times out (elapsed ~58ms) and rejects token fail-closed. |
| Malformed Store Result | **REJECT** | Non-boolean return value caught, token rejected fail-closed. |
| Missing Store | **REJECT** | Omission of `replayStore` option fails closed (`PREVIEW_TOKEN_INVALID`). |
| Expired Token | **REJECT** | Expired `expires_at` fails closed. |

---

## Verification Summary

| Gate | Status | Details |
| :--- | :---: | :--- |
| `npm ci` | **PASS** | 535 added / 536 audited packages |
| `npm run test:question-bank-import` | **PASS** | 435 tests PASS (including hanging store timeout test) |
| `npm test` | **PASS** | 32/32 tests PASS |
| `npx tsc --noEmit` | **PASS** | 0 TypeScript compilation errors |
| `npm run build` | **PASS** | Production build completed successfully |
| `routeTree PR diff` | **PASS** | 0 diff against `origin/main` |
| `git diff --check` | **PASS** | Clean |
