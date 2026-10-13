# Independence closure execution — 13 October 2026

Baseline: `fe8747dcd4ee20d18bf0326e6c9523f8830ae711`.
Source project: `zbdhxyuulyovihjgeqbn`. Target: `yjpirilbpqxtmnayruht`.
This stage adds read-only reconciliation and independent build acceptance gates.
It does not switch database defaults, DNS, Play releases, roles, buckets or owners.

## Current decision

**HOLD for final cutover.** The independent Render release matches the baseline.
The current Supabase dashboard session is signed in as `tarasana-mufadhala`, shows
no organizations, and redirects the target project back to Organizations.
The owning account is needed for live inspection. An earlier successful login in
another session is not proof of present access. No live database writes occurred.

The historical Oct 1 import (147 selected tables / 70,385 rows) and storage transfer
(4,295 files) are not current source/target parity evidence. The earlier six receipt
objects with missing owner accounts require a current, authorized investigation.
Do not reassign them to another student or make their bucket public.

## Delivered controls

1. `scripts/independent/row-parity.mjs` collects keyed row HMACs in a repeatable-read,
   read-only transaction with timeouts and verified TLS. It pins the selected project
   and rejects reads filtered by RLS. Reports contain no row values, emails or raw IDs.
2. The comparator distinguishes missing target rows, target-only rows and changed
   values, including changes hidden by equal row counts. Unknown formats, wrong
   projects, duplicate keys, mismatched HMAC keys, missing tables and tables without
   primary keys fail or hold. It never generates writes or grants cutover clearance.
3. Build isolation now scans all public JavaScript, including native SPA and academy
   chunks. The independent APK workflow requires compiled offline restart tests and
   Android WebView offline process-restart tests before publishing its artifact.
4. PR CI runs the comparator on disposable PostgreSQL 17 and exercises the compiled
   independent shell offline. This is separate from real account and phone acceptance.

## Reconciliation procedure

Use a private authorized database connection for each project. Supply `DATABASE_URL`
to the process privately. Never commit it or paste it into chat. Set `PGSSLROOTCERT`
to the provider's CA file if required; certificate verification stays enabled.
Generate a random 32-byte hex key and supply it privately as `PARITY_HMAC_KEY` to
both collections. Keep that key local and out of reports. Generate it with a local
password manager or a cryptographically secure generator; do not use a public API key.

```sh
# With DATABASE_URL set to the SOURCE connection:
node scripts/independent/collect-inventory.mjs zbdhxyuulyovihjgeqbn source-inventory.json
node scripts/independent/row-parity.mjs collect zbdhxyuulyovihjgeqbn source-rows.json

# Change DATABASE_URL to the TARGET connection; retain the same private HMAC key:
node scripts/independent/collect-inventory.mjs yjpirilbpqxtmnayruht target-inventory.json
node scripts/independent/row-parity.mjs collect yjpirilbpqxtmnayruht target-rows.json
node scripts/independent/row-parity.mjs compare source-rows.json target-rows.json row-comparison.json
```

Output paths must not already exist. Keep manifests private; only the aggregate
comparison is needed for review. Collection fails rather than returning partial
success on permission, lock or timeout errors. Large tables may need a separately
reviewed collection window; do not disable guards to force completion.

Scope is application base tables in `public`, `academy`, `school_private`,
`lesson_question_private`, plus `auth.users` and `auth.identities`. Partition parents
include their children. Views, platform tables, sessions, storage metadata/bytes and
sequences are not row comparison scope. PostgreSQL JSON serialization may expose
cross-version differences; treat those as review items rather than ignoring hashes.
Tables without a primary key hold the comparison even if empty.

`ROWS_MATCH_NOT_CUTOVER_CLEARANCE` means only these two captured row sets match.
Separate snapshots are not atomic across databases and do not stop intervening
writes. Reports are evidence for trusted operators, not signed attestations.
Do not use them as a deployment authorization token.

## Remaining production exit gates

1. Obtain authorized current source and target access; collect inventory and rows.
   Review schema/functions/policies, grants, triggers, extensions, sequences and
   every row difference. Preserve target-side writes; target-only is not permission
   to delete. Plan an exact migration and rollback from these measured differences.
2. Verify current storage bytes, owner mappings and private signed-URL access by
   role, including denied access to other users' receipts. Prove backup restoration
   in a disposable environment before any irreversible production operation.
3. Verify Google login for both actual Android signing identities and browser
   callbacks, student/teacher/admin routing, saved-content isolation, offline process
   death, reconnection replay and lesson-open latency on the target environment.
4. OCR remains disabled with manual receipt entry available. It is not a hidden
   Lovable dependency. If OCR is required for launch, select an appropriate provider
   and test synthetic receipts before connecting it; a Google OAuth secret is not
   an OCR API credential.
5. Freeze source writes in a controlled window, reconcile the final delta, verify
   again, then switch the production backend/domain and signed Play artifact.
   Preserve a rollback that accounts for new writes; changing DNS back alone is not
   a database rollback. Retire old services only after production acceptance.

Flutter remains a separate later implementation and is not a prerequisite for the
current React/Capacitor app's independence.

## Local evidence

- TypeScript: PASS.
- Mobile release tests: 155 passed / 0 failed.
- Independent tests: 25 Node tests and 4 auth runtime tests passed.
- Comparator: real SQL executed locally with PGlite; equal-count replacement,
  changed/deleted rows, private output, composite quoted keys, read-only enforcement,
  RLS-filtered caller rejection and malformed evidence covered.
- Independent web build: PASS; 216 public JS assets scanned, 3 local HTTP routes
  returned 200, 205 web JS assets matched bytes, unauthenticated pack manifest 401.
- Independent native SPA build: PASS; 421 public JS assets scanned; 476 assets packaged.
- Local Chromium installation failed during archive download; no local offline
  browser/device PASS is claimed. The added CI gate must pass on this exact change.
- No new database parity, storage repair, restore, production cutover, APK delivery
  or Play publishing is asserted by this report.
