# S0 — Ownership and recovery baseline

Status: **staging restore PASS; production cutover HOLD**

The Lovable-managed source was restored into the Tamkeen-owned staging project
without changing production.

## Verified restore

- 115 application tables, 371 functions, 223 foreign keys, 172 application
  policies, 115 RLS-enabled tables, and 144 application triggers.
- 11,599 application rows and 75 sampled large-field hashes matched.
- 33 Auth users, 36 identities, 33 profiles, and no missing/orphan profiles.
- 10 private Storage buckets and 25 Storage policies.
- 576 application objects / 406,589,128 bytes; full download/size/SHA-256
  verification passed with zero failures.
- Temporary restore relations, functions, and buckets were removed.

## Deliberate exclusions and holds

- Ephemeral sessions, refresh tokens, and MFA challenges were not migrated.
- Lovable-only role grants and default ACLs were not recreated.
- Source cron was not enabled because its function source is absent.
- The 78.3 MB database archive exceeds the current free Storage per-file limit;
  it remains outside the application buckets pending the plan decision.
- Production cutover requires a second restore rehearsal, OAuth/SMTP validation,
  backup recovery drill, monitoring, and load testing.

No credential, service-role key, OAuth secret, or signed URL belongs in Git.
