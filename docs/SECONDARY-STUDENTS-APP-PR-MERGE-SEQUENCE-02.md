# SECONDARY STUDENTS APP — PR MERGE SEQUENCE 02

No merge is authorized or executed by this cycle. These are owner-controlled proposed actions only.

1. PR #20 is already merged. Run the documented Lovable read-only check.
2. If the hardening migration is verified not applied, explicitly authorize Lovable to apply only that migration; do not combine with deploy or other writes.
3. Run security smoke tests: correct student allowed; wrong grade denied; wrong track denied; anon denied; correct `can_access_subject` allowed; admin preserved.
4. After evidence and smoke review, merge PR #17.
5. Refresh main and revalidate, then merge PR #18.
6. Update/merge PR #19 or replace it with the Cycle-02 report, based on owner preference.
7. Start the four PWA PRs in the documented order.
8. Handle CRLF normalization in its isolated chore PR, then address non-format lint findings separately.

Suggested commands after explicit owner approval only:

```powershell
gh pr view 17 --repo msorori-mh/tas-heel-8e64d405 --json state,mergeStateStatus,statusCheckRollup
gh pr merge 17 --repo msorori-mh/tas-heel-8e64d405 --merge
git fetch origin --prune
gh pr view 18 --repo msorori-mh/tas-heel-8e64d405 --json state,mergeStateStatus,statusCheckRollup
gh pr merge 18 --repo msorori-mh/tas-heel-8e64d405 --merge
```

Do not run these until migration evidence, security smoke, owner approval, and required quality gates are complete.
