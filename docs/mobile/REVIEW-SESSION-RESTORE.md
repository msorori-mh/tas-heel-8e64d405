# Review APK session restoration

Baseline: 86f6a7597fe40f076697228051a44c396cd7a100, the delivered academy offline review APK. Fix branch: fix/review-session-restore. No production deployment, Supabase configuration change, or database migration.

Confirmed code defects: the bundled Android entry always starts at `/`, whose landing page did not resume a stored session; the student Google button was enabled during asynchronous session/profile restoration. A transient getUser transport failure also redirected to login as if the session were invalid. These defects can look like lost login; a device-specific revoked/absent session is not established without phone verification.

Changes: resume an authenticated native launch into `/app` or `/academy`, using an owner-bound durable navigation preference. Preserve browser landing and explicit account-chooser navigation. Disable Google while restoring an existing session. Keep server getUser verification for protected routes, but offer retry on transport failures instead of a new login. Existing native Preferences auth storage and token lifetimes remain unchanged.

Verification: native storage and auth bootstrap unit contracts; startup routing and account isolation; network error versus invalid-session handling; Android instrumentation with synthetic sessions seeded through the real Preferences bridge, destroyed WebView and empty localStorage, student restore, expired teacher session refresh and native token writeback, explicit logout and signed-out relaunch. The instrumentation fixture intercepts backend calls; no real account or backend mutation is used. Google provider selection on the user's phone remains a final acceptance check.

Production and Google Play remain on hold pending the user's mobile review. Notes migration from the academy feature remains unapplied. CI debug APK certificates are ephemeral; a previous review APK may require removal after its pending work is synchronized.
