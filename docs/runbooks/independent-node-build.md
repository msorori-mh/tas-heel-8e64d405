# Independent Node build — stage 1B

This branch replaces the Lovable Vite wrapper with explicit Vite, TanStack Start,
Nitro, React, Tailwind and TypeScript path plugins. It targets Nitro's `node-server`
preset. The app's server entry, server import protection, public environment
injection, release fingerprint and `/academy` mount remain configured.

## Build and run

Use Node 22 (as in CI) and the committed npm lockfile:

```sh
npm ci
cp .env.example .env.local
# Set the public VITE_* variables to your staging project's URL and public key.
npm run build
npm run academy:build
```

The root build includes `/academy`; `academy:build` additionally builds the existing
standalone academy. Its separate feature flag remains disabled by default.

Inject `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and
`SUPABASE_SERVICE_ROLE_KEY` into the server's runtime environment using the host's
secret manager. They must refer to the same project as the public build variables.
`npm start` does not load `.env.local` automatically. Vite uses that file for build
configuration; runtime values must be supplied separately.

```sh
HOST=127.0.0.1 PORT=3000 npm start
```

Deploy the entire `.output` directory, including public assets and server files,
to a Node host. Put HTTPS in front of it and configure OAuth callbacks for the
selected domain. Do not deploy this Node artifact to the existing Cloudflare/Lovable
target without adapting that hosting target. This branch is not a production cutover.

Public config still has the existing production fallback in
`src/integrations/supabase/public-config.ts`; staging must set explicit public
values at build time. Replacing the fallback and migrating backend ownership are
separate gates. Never use a real service-role key with a `VITE_` prefix.

## Verification

```sh
npx tsc --noEmit
npm run academy:typecheck
npm run academy:test
node --test tests/release/release-fingerprint.static.test.mjs
npm run test:mobile-release
npm run lint
npm run test:independent-server
```

The server smoke test runs the production artifact on a local port, requests
`/privacy`, `/auth`, `/academy`, and `/auth/callback`, verifies HTML and linked
JavaScript/CSS assets, then terminates the server. It uses no real server credentials
and does not execute browser JavaScript or log in. It proves serving the built
artifact, not live OAuth, database access, native offline behavior, or user journeys.
Web CI runs this test after the builds.

## Remaining dependencies and rollback

The unused Lovable auth integration, preview-session adapter, optional error bridge,
and receipt OCR gateway remain outside this build-only change. Supabase ownership,
data/storage export, OAuth administration, DNS, signing keys, and production
cutover are not changed. Full independence remains HOLD.

Before merge, validate the new hosting target and live integration on staging.
Keep the current deployment available. Reverting this branch restores the former
build configuration; no database rollback is required because no database changes
are included.

Reference: https://tanstack.com/start/latest/docs/framework/react/guide/hosting
