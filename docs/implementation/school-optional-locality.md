# Optional locality in school approval

The admin approval form and RPC now accept an empty locality. The school name,
governorate and district remain required. Supplied locality remains 2–120
characters with the existing normalized identity checks.

Empty, omitted and null RPC locality normalize to the empty string to preserve
existing non-null string contracts and unique-index deduplication. Known
localities remain distinct. No existing school/profile row is rewritten.
Admin authorization, reviewed snapshots, audit and concurrency locks are preserved.

Validation gate: school-directory PG17 rehearsal, permissions and concurrency;
actual mounted form submissions with populated/blank/whitespace locality;
Chromium blank-locality approval at 320, 390, 768 and 1280 pixels; Web CI.
Local runtime is unavailable for this turn, so execution evidence comes from CI.

Deployment order: apply the exact tested additive migration, then publish the UI.
Rollback the UI independently; do not restore the old database constraints once
schools with blank locality exist. Existing blank values must not be fabricated
or deleted merely to restore a required-field rule.
