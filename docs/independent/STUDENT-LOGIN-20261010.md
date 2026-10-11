# Stage 3 — explicit student login and native callback replay

Baseline: main `2582d6227776ac563004bd5c41b0f8ba4b7a5fcb`.
Branch: `fix/student-login-portal-20261010`.
Target: independent test web / side-by-side Android application.

## Scope and invariants

An explicit student entry must override a remembered teacher navigation
preference. A successfully exchanged native OAuth code must not be exchanged
again on duplicate delivery or subsequent process launch. Both portals retain
the shared Supabase auth client. Navigation preferences never grant a role.
No database, RLS, ownership, account, or production-domain configuration changes.

The reported screenshot showed the academy behind an authentication-error
overlay. Code inspection found a saved teacher preference overriding `/auth`,
and a native teacher redirect reloading the WebView. That reload can redeliver
Android's launch intent after the one-time code has already succeeded.

## Changes

- Student entry resolves explicitly to student home or profile completion;
  generic home still restores the account's previous workspace.
- Student callback remembers the student's choice.
- Native exchange uses its returned user and routes in the same WebView.
- A bounded ledger stores only SHA-256 fingerprints of the last 20 successful
  codes in Preferences. No codes, tokens, or credentials are persisted by it.
- Exchange failure remains retryable; failure after exchange never releases
  that spent code. Return-to-login now navigates to the student entry.
- Native OAuth tests cover StrictMode, concurrent duplicates, process restart,
  teacher navigation, failure/retry, post-exchange failure, and web no-op.

## Evidence and remaining gates

Local focused suite: 44 tests passed, zero failures across six files, including
real SDK PKCE classification and real-router student callback tests.
CI, native emulator, deployed SHA, and device Google sign-in are separate
gates; a local unit pass alone is not release acceptance.

Device acceptance: select student for an account that previously entered the
academy; finish Google sign-in; confirm student home (or genuinely incomplete
student profile); close/reopen, then repeat offline. Separately select teacher
and verify its destination. Keep existing local data; do not uninstall to test.

## Target inventory, read-only observation

Observed in the signed-in Supabase SQL editor for `yjpirilbpqxtmnayruht` on
2026-10-10 (local session date), in a `BEGIN READ ONLY` transaction:

| Measure | Value |
| --- | ---: |
| Application tables in four application schemas | 121 |
| Auth users | 44 |
| Auth identities | 47 |
| Storage objects | 4,295 |
| Database size | 2,293 MB |
| Buckets (all private) | 9 |
| Receipt objects with absent owner accounts | 6 |

The historical 147 selected import tables include a different schema scope;
121 application tables is not evidence that 26 tables were lost. Object counts
alone do not establish byte parity or source freshness. Six orphan receipts
remain HOLD pending authoritative ownership reconciliation. No reassignment
or source-current-data claim was made.
