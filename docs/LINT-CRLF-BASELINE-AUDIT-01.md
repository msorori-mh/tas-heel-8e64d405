# LINT-CRLF-BASELINE-AUDIT-01

Decision: `HOLD`

The baseline is not only a line-ending problem; it also contains non-format ESLint findings. No file was formatted or auto-fixed during this audit.

## Results on `b213bee5a181ddac16d9c54cf134924072e47d2b`

| Category | Messages | Files | Assessment |
|---|---:|---:|---|
| CRLF-only Prettier findings | 32,013 | 192 | Mechanical, suitable for an isolated normalization PR |
| Other Prettier findings | 0 | 0 | None in this run |
| Non-format ESLint findings | 67 | 29 | 55 errors and 12 warnings; separate logic/typing work required |

Non-format rules:

- `@typescript-eslint/no-explicit-any`: 54
- `react-refresh/only-export-components`: 8
- `react-hooks/exhaustive-deps`: 3
- `prefer-const`: 1
- unused ESLint-disable directive: 1

Priority review areas include unstable hook dependencies in `EditProfileDialog.tsx` and `exams.history.tsx`, `prefer-const` in `src/lib/home/streak.ts`, student lesson typing, and the larger admin lesson-detail typing cluster.

## Proposed isolated PR

`CHORE-LINT-LINE-ENDINGS-NORMALIZATION-01`

Scope only:

1. Add/confirm a repository LF policy, preferably through `.gitattributes`.
2. Normalize tracked text files mechanically to LF.
3. Do not run auto-fixes for other ESLint rules.
4. Prove every changed file is line-ending-only after normalizing both sides for comparison.
5. Keep one mechanical commit, excluding functional fixes and manual edits to generated files.
6. Run typecheck, build, and tests before owner review.

After normalization, use separate PRs for hook correctness, student-lesson typing, admin typing, fast-refresh exports, and minor cleanup. Final acceptance remains zero errors and zero warnings.

No commit, push, PR, deploy, publish, or production write was performed by the lint agent.
