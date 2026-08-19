# TAMKEEN Chemistry G12 Iron Golden Lesson V3 R2 — Fidelity Closure

Date: 2026-08-19

Base SHA: `8801074d805710bbddfb02718a89700ced983b9d`
Mode: `SOURCE_READY_FOR_REVIEW` / content-package only

## Scope and final verdict

`QWEN_FINDING=NEEDS_CONTENT_REVISION` is closed for the official Iron lesson content and lab CSP contract. No production writes, production metadata changes, lifecycle transition to READY, migration, Storage publish, or Content V3 Core change was made.

`FINAL_VERDICT=PASS_IRON_GOLDEN_LESSON_R2_READY_FOR_FINAL_FIDELITY_AND_UI_REVIEW`

The UI review remains the next review stage because the in-session browser surface had no available backend. Static responsive checks and package previews are present for all requested target viewports.

## Finding closure matrix

| QWEN_FINDING | BEFORE | AFTER | SOURCE_EVIDENCE |
|---|---|---|---|
| Official content was not exact | Manually authored summary-like blocks; 21 blocks; `REVIEW_REQUIRED` fidelity note | 50 ordered structured blocks, `OFFICIAL_TEXT_FIDELITY=EXACT`, page provenance for PDF pages 1–5 / printed pages 14–18 | `official-content.json` and `official-content.html`; source SHA256 `79bffd410fde5ff776b28ca805173d66d9ff02e12b76e324006986ee57b4b0b7` |
| Page-by-page completeness | Missing full paragraphs, steel-alloy sentence, full ore details, rust text, and several reactions | All five pages represented in order, including steel alloys, magnetite/hematite/limonite details, blast-furnace process, properties, rust, nonmetals, acids, note, and activity | `official-content.json` blocks have `source_page` 1–5 and `printed_page` 14–18; package test checks required paragraphs |
| Iron-family table | Reduced to 3 columns | Full official 6-column table, 3 rows, electronic configurations, atomic weights, atomic/ionic radii, and units retained | `iron-family` block `columns`, `rows`, `units`; source page 1 / printed page 14 |
| Equation fidelity | Reduction equations were not balanced; ΔH and several reactions were absent | Balanced reduction, CO formation, limestone, silicate/phosphate/aluminate slag, oxygen, steam, rust, chlorine, sulfur, HCl, H2SO4 equations retained with arrows, ΔH, conditions, and gas arrows | Equation blocks in `official-content.json`; package regression asserts exact balanced strings |
| Furnace figure | Non-source `lesson-internal://official-page-3.png` placeholder | Actual embedded source image extracted from page 3, no redraw or montage | `furnace-figure`: `source_page=3`, printed page 16, PDF region `(66.36,54.29)-(313.92,355.49)`, asset SHA256 `a5e17da2c7343bc3f4289a3258f646d635e7a8365b84f2b7c7209134f0614daf` |
| Omitted official sections | Slag reactions, rust equation/text, and full properties were absent or shortened | Restored all official sections and the page-5 activity/note blocks | Page-ordered block inventory and fidelity tests |
| Structured block model | Uppercase ad-hoc types and incomplete HTML | Golden-style lower-case `heading`, `paragraph`, `table`, `equation`, `figure`, `caption`, `activity`, `note` blocks with HTML rendering | `official-content.json` / `official-content.html` |
| Lab CSP | Declared hash did not match the inline script body | `SCRIPT_SHA256_MATCH=YES`, runtime contract preserved, `connect-src 'none'`, no external network, no sandbox escape | `lab.html`, `validation-report.json`, package CSP test |
| Track fidelity | Sanaa/Aden identity was not re-stated in the R2 closure | `SANAA_ADEN_SOURCE_BYTES=IDENTICAL` retained; ownership remains explicitly pending | `subject-textbooks.json`; `CURRICULUM_OWNERSHIP_CONFIRMATION=PENDING_PRODUCTION_METADATA` in manifest |
| Official/Tamkeen separation | Existing approved layers were at risk of being regenerated during correction | Official book and official questions remain `OFFICIAL`; explanation, summary, mindmap, lab, self-test remain `TAMKEEN` | `provenance.json`; approved HTML files unchanged except lab CSP hash contract |
| Readiness | Previous package exposed fidelity gaps | Package remains `SOURCE_READY_FOR_REVIEW`; no lifecycle READY claim | `manifest.json`, `validation-report.json` |

## Protected capabilities

The following approved educational layers were preserved without content rewrite:

- `tamkeenExplanationHtml`
- `lessonSummaryHtml`
- `mindMapHtml` — static native HTML/CSS; no JavaScript
- `officialBookQuestions`
- `selfTest` — answers/rationales remain outside the initial student payload

`labExperimentHtml` was preserved educationally and only its CSP hash contract was corrected.

## Source and ownership contract

`officialBookContent=OFFICIAL` and `officialBookQuestions=OFFICIAL`.

`explanation= TAMKEEN`, `summary= TAMKEEN`, `mindmap= TAMKEEN`, `lab= TAMKEEN`, `selfTest= TAMKEEN`.

Sanaa and Aden textbook source bytes remain identical in the package mapping. This is a file-backed source identity result only; curriculum ownership confirmation is `PENDING_PRODUCTION_METADATA` and no stronger claim is made.

Raw PDFs, DOCX, and XLSX intake files were not added to the commit. The committed furnace asset is the extracted figure image, not a raw source document.

## Preview and validation

Student preview: [preview/student.html](../../content-packages/chemistry-g12-iron-v3/preview/student.html)

Official structure: [official-content.json](../../content-packages/chemistry-g12-iron-v3/official-content.json) and [official-content.html](../../content-packages/chemistry-g12-iron-v3/official-content.html)

Furnace asset: [official-figure-1-1.png](../../content-packages/chemistry-g12-iron-v3/assets/official-figure-1-1.png)

Target viewports are recorded in [preview/README.md](../../content-packages/chemistry-g12-iron-v3/preview/README.md): `360x800`, `390x844`, `412x915`, and `1280x900`. Static checks cover RTL, responsive width, horizontal table containment, equation overflow handling, and source-figure scaling. Live browser screenshots were blocked because no browser backend was available in this execution session.

## Test results

- Package tests: `15/15 PASS`
- Full regression: `npm test` → `209/209 PASS`
- Relevant Content V3 tests: `official-textbook-standard-20a` → `13/13 PASS` via Vitest; 21H R1/R2 checks → `42/42 PASS`, one local-PG17-only test skipped because no local PG17 target was available
- Typecheck: `npx tsc --noEmit` → `PASS`
- Build: `npm run build` → `PASS`
- CSP script hash: `PASS`
- Answer leak: `PASS`
- Mindmap JS scan: `PASS`
- Secret scan: required before commit; result recorded below

## Handoff state

`LIFECYCLE=SOURCE_READY_FOR_REVIEW`

`READINESS_EXPECTED=SOURCE_READY_FOR_REVIEW`

`REMOTE_PUSH_TARGET=origin/codex/iron-golden-v3-r2-fidelity`

The final fidelity/UI reviewer should inspect the official pages against the source PDF and verify the four target viewports in a connected browser before any production metadata ownership confirmation or READY decision.
