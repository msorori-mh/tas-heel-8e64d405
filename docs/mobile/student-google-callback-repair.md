# Student Google callback repair — 2026-09-15

Status: **HOLD for release** until CI, deployment authorization, and real Google/student acceptance. Local focused verification passes.

Base: main `7ae2fee6fcc460843c455393e0256f1689855c04`. Branch: `fix/student-google-callback-web`.

## Observed failure

After the user's manual Google sign-in attempt, the browser remained on the student callback path while displaying the ordinary Google entry form. A fresh target-site tab did not show a signed-in student. No credentials, cookies, or callback codes are included in this report.

The generated route tree nests both `/auth/callback` and `/auth/mobile-callback` beneath `/auth`, but the parent did not render an Outlet. The callback component therefore never mounted.

The installed Supabase SDK also interprets a function-valued `detectSessionInUrl` as an implicit-grant classifier. The existing URL allowlist returned true for web PKCE callbacks, causing incorrect classification. Returning false for the mobile compatibility path did not disable PKCE detection, because the function itself remained truthy in the SDK's outer detection guard.

Finally, the callback contained a manual exchange of the full URL alongside automatic SDK detection. That is neither a raw authorization code nor a safe second exchange of a one-use code.

## Changes

- Render child callback routes through Outlet; mount the existing Google-only entry form only at `/auth`.
- Supply a page-specific boolean to the SDK, preserving native compatibility-path exclusion and correct web/academy PKCE detection.
- Let SDK initialization own the single exchange; await the resulting session and validate the user before resolving the profile destination.
- Show profile lookup failures instead of sending a student with an unreadable profile to profile creation.

## Verification

- Actual application route components with a real in-memory TanStack router: complete/incomplete profiles, provider errors, profile lookup failure, native child route and unchanged Google-only entry.
- Actual installed Supabase SDK with synthetic PKCE HTTP/storage fixtures: web and academy exchange once, restore existing sessions, retain the native verifier without a browser-side exchange.
- New runtime tests on the main baseline: **8 failures / 2 passes**. After correction: **10/10 pass**.
- Runtime plus existing Android OAuth contract suite: **25/25 pass**.
- TypeScript and changed-file ESLint: PASS.
- Client/server production build: PASS (existing bundle/import warnings).

These are automated local tests with synthetic accounts. Real Google sign-in, native hardware, the production offline download failure, and full third-secondary offline content remain unverified. The offline repair is separately proposed in PR #246; this branch contains none of its changes and none of the disposable APK/capacity branch changes.

Production schema, Auth dashboard configuration, callback URLs and account data have not been changed. No deployment or Google Play publication has occurred.
