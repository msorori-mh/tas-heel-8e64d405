# S1 — Deployment-owned Supabase configuration

Status: **code PASS; live staging Auth HOLD**

Student and teacher-academy builds no longer contain or fall back to the former
Lovable-managed project URL/key. Each deployment must explicitly set:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Server-only values use unprefixed variables such as
`SUPABASE_SERVICE_ROLE_KEY`; service credentials must never use `VITE_`.

Missing browser configuration fails closed. The academy remains disabled through
its existing configuration guard rather than connecting to an implicit backend.

## Live staging checkpoint — 2026-09-08

The Tamkeen-owned Supabase staging project `qwfvlppsffcmmbjpznkw` now has:

- Google OAuth enabled with Tamkeen-owned credentials.
- Site URL set to `https://staging.studentamkeen.com`.
- Exact redirect allow-list entries for student, teacher academy, password
  recovery, and the Android native callback; no wildcard was added.
- Cloudflare Worker `tamkeen-staging-web` created and connected to this Git
  branch with preview builds disabled and staging-only browser-safe variables.

No production Supabase, Lovable deployment, or production DNS record was changed.

Live staging remains HOLD until the first Cloudflare build succeeds and Google
OAuth, email login, logout, refresh, recovery, and Android return-to-app journeys
pass on the deployed staging origin.
