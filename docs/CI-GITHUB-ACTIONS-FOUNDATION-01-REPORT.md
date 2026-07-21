# CI-GITHUB-ACTIONS-FOUNDATION-01

## Decision

`PASS_CI_GITHUB_ACTIONS_FOUNDATION_PR_READY`

## Added foundation

- Workflow: `.github/workflows/web-ci.yml` (`Web CI`).
- Triggers: pull requests targeting `main` and pushes to `main`.
- Runner: `ubuntu-latest`.
- Runtime: Node.js 22 with the npm dependency cache.
- Permissions: read-only repository contents.
- Concurrency cancels an obsolete run for the same workflow and Git ref.
- A 20-minute job timeout prevents indefinitely hung verification runs.

## Required CI commands

The single verification job runs these commands in order:

1. `npm ci`
2. `npx tsc --noEmit`
3. `npm test`
4. `node tests/pwa/service-worker-policy.static.test.mjs`
5. `npm run build`

Any failing command fails the job and can be configured as a required branch-protection check by the repository owner.

## Why full lint is deferred

Full `npm run lint` is intentionally not a required gate in this phase. The established repository baseline contains broad CRLF/Prettier findings plus separate non-format findings. Mixing that normalization with CI foundation work would make this PR large and obscure the workflow-only change. Lint should be introduced after the isolated baseline cleanup plan is completed.

## Limits

- This workflow validates installation, TypeScript, current unit tests, the static PWA service-worker policy, and production bundle generation.
- It does not deploy or publish artifacts.
- It does not run browser end-to-end or live Supabase tests.
- It does not apply SQL or migrations and does not modify authentication, storage, PWA logic, or application logic.
- It uses no repository or environment secrets.
- Enforcing the workflow as a merge requirement remains an owner-controlled GitHub branch-protection setting.

## Local validation

Validation ran from an isolated worktree based on `origin/main` at `d0bd0b1ce690fade87afc325fac131da02c43109`:

- `npm ci`: **PASS** after synchronizing `package-lock.json` with the `@lovable.dev/vite-tanstack-config` `2.7.7` version already selected by the latest `main` `package.json`.
- `npx tsc --noEmit`: **PASS**.
- `npm test`: **PASS**, 8/8 tests.
- `node tests/pwa/service-worker-policy.static.test.mjs`: **PASS**, 7/7 tests.
- `npm run build`: **PASS** for client and SSR output, with existing non-fatal bundler/chunk warnings.

The lockfile synchronization is mechanical and required because the latest `main` changed `package.json` from `2.7.6` to `2.7.7` without the matching lockfile update. The first GitHub run then exposed missing Linux optional-dependency entries; the lockfile was regenerated with npm 10.9.8 (the version selected by Node 22 in Actions) and optional dependencies included. No application source was changed. `npm ci` also reported five existing audit findings (one low, two moderate, and two high); this phase did not run an automatic dependency remediation.

## Safety confirmation

- Deploy/Publish: **no**.
- Secrets added or consumed: **no**.
- SQL/migration: **no**.
- Production data write: **no**.
- Automatic merge: **no**.
