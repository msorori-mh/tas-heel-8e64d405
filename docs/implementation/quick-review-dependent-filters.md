# Quick-review readiness dependent filters

Stage QR_FILTER_01; baseline main `576244d489b41c9725fceb2040eb842f2a5e18ad`.

The readiness page built all dropdowns from all lessons and retained a selected
subject from a different grade or track. Users could choose identical-looking
subject names belonging to another grade and see an empty report.

The track dropdown now follows the selected grade; the subject dropdown follows
both grade and track. Changing grade resets track, subject, preview and pagination.
Changing track resets subject, preview and pagination. Returning to an all-scope
choice performs the same reset. Readiness does not restrict dropdown options.
Same-name subjects remain separate IDs and display grade/track context when
needed. Shared subjects remain available in each linked track.

Scope: `/admin/learning-insights/quick-review`, one regression test file and its
Web CI command. No fetch, readiness definition, database, RLS, role gate, student
interface or textbook-report change. Uses the caller's existing fetched rows.

Validation: 18/18 focused Vitest tests (13 existing contract tests, five mounted
page regression scenarios) and TypeScript pass. UI tests use native select
adapters for the unchanged Radix controls; they exercise actual page state,
options, summary/lesson results, zero-result recovery and pagination. They are
not a production account login or a browser visual acceptance test.

Rollback: revert this isolated PR; no data rollback required.
