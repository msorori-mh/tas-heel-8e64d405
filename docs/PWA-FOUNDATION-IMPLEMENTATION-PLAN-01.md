# PWA-FOUNDATION-IMPLEMENTATION-PLAN-01

Decision: `PASS_PWA_PLAN_READY_AFTER_SECURITY`

This is design-only. No PWA code, deployment, publication, or migration application occurred.

## Baseline

- `manifest.webmanifest`, `sw.js`, `offline.html`, production-only SW registration, and a basic install hint already exist.
- Missing foundations include platform-aware installation, update lifecycle UX, explicit safe-area handling, and a testable cache policy.

## Non-negotiable security rules

- Never cache `/auth`, `/admin`, `/api`, `/storage`, callbacks, server endpoints, cross-origin/Supabase requests, non-GET requests, credentialed requests, or `private`/`no-store` responses.
- Never cache dynamic account, profile, progress, question, answer, result, or admin data.
- Exams and unit practice remain online-required. No background queue, Cache Storage, IndexedDB, or localStorage persistence for exam questions, answers, or submissions.
- Do not add Flutter, Capacitor, deploy, or publish work.

## PR-1 — icons, theme, and install prompt

Owned files:

- `public/manifest.webmanifest`
- `public/icons/*`
- `src/components/pwa/PwaInstallHint.tsx`
- new `src/lib/pwa/install-prompt.ts`
- install-related wiring only in `src/routes/__root.tsx` and `src/routes/index.tsx`

Deliver real `beforeinstallprompt` handling for Android Chromium, separate iOS Safari “Add to Home Screen” guidance, standalone detection, verified 192/512/maskable icons, consistent theme colors, keyboard access, and screen-reader names. Do not edit `sw.js`.

## PR-2 — service-worker update UX

Owned files:

- `src/lib/pwa/register-sw.ts`
- new `src/components/pwa/PwaUpdateNotice.tsx`
- update wiring only in `src/routes/__root.tsx`
- lifecycle messaging only in `public/sw.js`

Add waiting-worker/update prompts and one-shot `controllerchange` handling. Never force refresh during `/exams/*` or `/units/*/practice`; activation requires an explicit safe action.

## PR-3 — offline fallback and cache-boundary hardening

Owned files:

- `public/sw.js`
- `public/offline.html`
- new `tests/pwa/service-worker-policy.static.test.mjs`
- optional small cache-boundary document

Implement a testable deny policy, versioned app-owned caches, immutable hashed-asset caching only, and network-first navigation with a static offline fallback. Sensitive and exam routes receive no cached HTML. The fallback must clearly state that exams are not saved or submitted offline.

## PR-4 — mobile standalone and safe-area polish

Owned files:

- `src/styles.css`
- viewport/status-bar metadata only in `src/routes/__root.tsx`
- `src/components/student/StudentNav.tsx`
- optional new standalone-status component
- `public/offline.html` only for final safe-area alignment

Add `viewport-fit=cover`, targeted `env(safe-area-inset-*)` utilities, RTL/320px/landscape/200%-zoom coverage, 44px touch targets, accessible icon names, and Android/iOS standalone smoke tests. Do not add offline exam synchronization.

## Ordering and conflict control

Merge PR-1, then PR-2, then PR-3, then PR-4. PR-2 and PR-3 must not run concurrently on `sw.js`; PR-1/PR-2/PR-4 must not concurrently edit `__root.tsx`; PR-3/PR-4 must coordinate `offline.html`. Never edit `routeTree.gen.ts` manually.

Every PR requires typecheck, client+SSR build, scoped lint, PWA-specific tests, `git diff --check`, and independent review with CRITICAL=0/HIGH=0/MEDIUM=0.
