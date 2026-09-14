# S1.2 — Auth and OAuth readiness

Status: **static contract PASS; live staging journeys HOLD**

Required production/mobile redirects:

- `https://studentamkeen.com/auth/callback`
- `https://studentamkeen.com/auth/mobile-callback`
- `https://studentamkeen.com/reset-password`
- `https://studentamkeen.com/academy/callback`
- `app.studentamkeen.tamkeen://auth/callback`

Equivalent web paths must be added for the exact HTTPS staging origin. Avoid
broad wildcard domains. Google client credentials must be owned by Tamkeen and
stored only in the staging dashboard.

Automated contracts previously passed 31/31 across Android callback validation,
application identity, and teacher/admin portal isolation. The live gate requires
disposable staging identities and a signed Android test build.
