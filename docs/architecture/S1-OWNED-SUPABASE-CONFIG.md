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

Live staging remains HOLD until Google OAuth, redirect allowlists, email login,
logout, refresh, recovery, and Android return-to-app journeys pass.
