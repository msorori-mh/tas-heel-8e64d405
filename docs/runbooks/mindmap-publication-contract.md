# Mindmap publication contract separation

The reported physics map passes upload verification, then publishing fails with
`CF11_LAB_CSP_MISSING: mindMapHtml`. Its SHA-256 is
`ba552cc74e0baf2ca7ddb3d8c88c9ecd07305deac607e4bf55753128af9e6ac6`.
The September 13 PhET migration replaced a shared interactive validator with the
laboratory CSP/hash contract. This unintentionally changed authored mindmap rules.

Migration `20260919020000` restores the original mindmap authored-file rules in
`cf11_assert_mindmap_contract(text)`. Only mindmap call sites in the V2 publisher,
the CF11 package publisher and the legacy component publisher switch to it.
Laboratory validation, PhET allowlisting, renderer, stored files and permissions
are unchanged. No historical migration is edited.

Mindmaps may use inline scripts and click handlers without an authored CSP. The
existing student wrapper imposes CSP and an opaque `allow-scripts` sandbox.
External URLs/scripts, frame/embed/form elements and dynamic execution primitives
remain rejected. PhET remains a laboratory-only publication exception.

## Verification

- The complete PG17 chain reproduces the exact error using the original bytes,
  applies the migration twice, publishes/reuploads the map and verifies replay,
  exact stored bytes and a single canonical resource.
- Nine laboratory outcomes (valid offline/PhET, CSP/hash/handler/host/resource
  rejections) must match before and after. Laboratory helper definitions and all
  publisher grants must remain identical; existing lab rows must not change.
- After the fix, actual offline and PhET lab instances publish and replay through
  the authenticated V2 RPC on the disposable database.
- Chromium at 390px and 1280px checks the actual physics map in the existing
  student wrapper: expand/collapse, parent-origin isolation, resize messages,
  horizontal fit and zero network requests. This is not a physical-phone test.

## Production apply and rollback

Before applying, capture exact function definitions, hashes, owners/ACLs and
content-table fingerprints. Require the reviewed publisher baselines, then apply
the tested migration and insert its exact statements into the migration ledger
in one transaction. Abort on source drift, changed lab definitions/ACLs, changed
content or any failed positive/negative map/lab contract assertion.

Rollback restores only the three captured publisher definitions, verifies their
original hashes/ACLs, drops the new private mindmap helper, and removes this exact
migration ledger entry. Existing lab functions and all content rows remain intact.
Do not publish a user's pending intake using a fabricated authentication context.
