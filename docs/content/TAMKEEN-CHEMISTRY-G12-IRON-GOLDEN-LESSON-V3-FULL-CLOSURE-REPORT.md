# TAMKEEN Chemistry G12 Iron Golden Lesson V3 — Full Closure Report

Date: 2026-08-19
Mode: CONTENT_PACKAGE_ONLY

## Source lock

- SOURCE_SHA: 20708f21d992cada0e8494a7a878add275ecc607
- BRANCH: codex/iron-golden-lesson-v3
- WORKTREE: C:\projects\tas-heel-iron-golden-v3
- Result: PASS
- No production DB, migration, Storage, publish, READY transition, deploy, merge, 21H migration, reveal RPC, RLS, or Content V3 core schema changes were made.

## Intake and textbook mapping

The twelve-file inventory, SHA256, role, track, authority, and V3 destination are in [inventory.json](../../content-packages/chemistry-g12-iron-v3/inventory.json).

| Source | Type | Track | Coverage | Result |
|---|---|---|---|---|
| كتاب الكيمياء الصف ثالث ثانوي منهج صنعاء.pdf | MAIN_TEXTBOOK | SANAA / sanaa | FULL_ACADEMIC_YEAR | import plan |
| كتاب الكيمياء الصف ثالث ثانوي منهج عدن.pdf | MAIN_TEXTBOOK | ADEN / aden | FULL_ACADEMIC_YEAR | import plan |
| كتاب الكيمياء - الانشطة والتجارب العملية منهج صنعاء وعدن.pdf | EXERCISE_BOOK | BOTH | FULL_ACADEMIC_YEAR | one shared logical record |

The Sanaa and Aden main textbooks are byte-identical:
SANAA_IRON_CONTENT_HASH = 59206662fee5c2e2610646d68ba8bf34afff75a667d089544751ec87178723bb
ADEN_IRON_CONTENT_HASH = 59206662fee5c2e2610646d68ba8bf34afff75a667d089544751ec87178723bb
TRACK_CONTENT_COMPARISON = IDENTICAL

The shared activity book is represented once for both tracks. Raw intake files remain outside the commit package.

## Curriculum and lesson identity

Grade is الثالث الثانوي; subject is الكيمياء; tracks are صنعاء and عدن. Repo conventions provide grade code grade-12 and track codes sanaa and aden, but this checkout contains no resolvable Chemistry subject/lesson/unit IDs. The manifest therefore records:

- GRADE_ID/CODE: ID unresolved; code grade-12
- SUBJECT_ID/CODE: unresolved; no identifier guessed
- SANAA_TRACK_ID/CODE: ID unresolved; code sanaa
- ADEN_TRACK_ID/CODE: ID unresolved; code aden
- LESSON_ID/CODE: unresolved
- LESSON_SLUG: الحديد-fe package slug only
- UNIT_ID/CODE: unresolved
- SEMESTER: unresolved
- Identity status: UNRESOLVED_FROM_REPO_READ_ONLY_CONTEXT

Only an import/creation plan was prepared.

## Official content fidelity

The supplied lesson PDF was rendered and reviewed as five pages, printed book pages 14–18. The existing official 20A structured-content contract is used in [official-content.html](../../content-packages/chemistry-g12-iron-v3/official-content.html) and [official-content.json](../../content-packages/chemistry-g12-iron-v3/official-content.json).

The package records block order, source pages, block types, figures, table, equations, captions/notes, and source SHA256. Coverage checkpoints include the iron-family table; magnetite Fe3O4; hematite Fe2O3; limonite Fe2O3·nH2O; blast furnace diagram; CO reactions; reduction sequence; limestone; slag; physical properties; oxygen/water; rust; chlorine; sulfur; acids; passivation; and the practical activity reference.

The existing 20A parser accepts the generated structure with 0 parser errors and 21 ordered blocks.

Status is REVIEW_REQUIRED. The embedded Arabic PDF font makes raw extraction unreliable, so independent page/image fidelity approval is required before READY. No external correction, paraphrase, or silent scientific rewrite was applied.

## Tamkeen capabilities

- tamkeenExplanationHtml: all non-empty paragraphs from شرح درس الحديد Fe.docx, converted to RTL STATIC_EDUCATIONAL_HTML in [explanation.html](../../content-packages/chemistry-g12-iron-v3/explanation.html).
- lessonSummaryHtml: all non-empty paragraphs from الحديد – ملخص شامل ومنظم.docx, converted to RTL STATIC_EDUCATIONAL_HTML in [summary.html](../../content-packages/chemistry-g12-iron-v3/summary.html).
- mindMapHtml: 4.html converted from JavaScript/onclick to native details/summary HTML/CSS in [mindmap.html](../../content-packages/chemistry-g12-iron-v3/mindmap.html). Requested branches are retained.
- labExperimentHtml: the supplied lab is INTERACTIVE_EDUCATIONAL_HTML using addEventListener, the existing TasheelBridge contract, and restrictive CSP. It has no external network dependency and labels simulated observations TAMKEEN_SIMULATION_MODEL in [lab.html](../../content-packages/chemistry-g12-iron-v3/lab.html).

The lab matches the practical-book topic of detecting Fe(II)/Fe(III) in salts. Simulation output is not presented as an official laboratory measurement.

## Official questions

The unit assessment filter keeps only:

- 7, 8, 9, 10: FULLY_IRON
- 11(a–d): PARTIALLY_IRON
- 1–6: excluded as general unit questions
- 11(e): excluded because it concerns lanthanides/actinides

The exact result and relevance evidence are in [official-questions.json](../../content-packages/chemistry-g12-iron-v3/official-questions.json). No unrelated unit question is placed in the iron lesson capability.

## Self-test and answers

The XLSX has one sheet, الأسئلة, and 40 chemistry questions: 20 multiple_choice and 20 true_false from its actual type column. The revision is pinned to SHA256 c307a28b1cf74e635787731b92f136b2851c502e384581642a5d7f729a1acad1.

[self-test.json](../../content-packages/chemistry-g12-iron-v3/self-test.json) contains no correct option or rationale. The answer companion is separate, server-controlled, initial_payload false, and MODEL_ANSWER_TAMKEEN_DRAFT. It is not a published official model answer.

The ministerial Aden 2022 PDF was audited only. Iron-related references include Fe2O3/FeO/Fe2O3·nH2O naming items and an iron(II)-oxide thermochemical item. They are optional provenance references and are not automatically attached.

## Seven-capability matrix

| # | Capability | Owner | Applicability | Status |
|---:|---|---|---|---|
| 1 | officialBookContent | OFFICIAL | REQUIRED | REVIEW_REQUIRED |
| 2 | tamkeenExplanationHtml | TAMKEEN | REQUIRED | REVIEW_REQUIRED |
| 3 | lessonSummaryHtml | TAMKEEN | REQUIRED | REVIEW_REQUIRED |
| 4 | mindMapHtml | TAMKEEN | REQUIRED | REVIEW_REQUIRED |
| 5 | labExperimentHtml | TAMKEEN | REQUIRED | REVIEW_REQUIRED |
| 6 | officialBookQuestions | OFFICIAL | REQUIRED | REVIEW_REQUIRED |
| 7 | selfTest | TAMKEEN | REQUIRED | DRAFT |

Exact order, applicability, identity, and no-original-PDF rule are in [manifest.json](../../content-packages/chemistry-g12-iron-v3/manifest.json). Per-capability provenance is in [provenance.json](../../content-packages/chemistry-g12-iron-v3/provenance.json).

## Readiness and security

- BOOK_READY: NO
- LEARNING_READY: NO
- ASSESSMENT_READY: NO
- FULLY_READY: NO

Reasons: unresolved local curriculum identity and official PDF human fidelity sign-off. This is CONTENT_GAP, not SYSTEM_GAP.

Validation records CSP PASS, answer leak PASS, rationale leak PASS, external dependency ZERO, RTL PASS, and static mobile PASS. Mind map has no JavaScript. Lab has no external script/font/fetch/XHR/WebSocket/EventSource/inline handler/parent access and uses connect-src none.

## Local previews and tests

- Student fixture: [preview/student.html](../../content-packages/chemistry-g12-iron-v3/preview/student.html)
- Admin fixture: [preview/admin.html](../../content-packages/chemistry-g12-iron-v3/preview/admin.html)
- Target viewports: 360x800, 390x844, 412x915, 1280 desktop.
- Student fixture has the exact seven-capability order, no PDF step, no unavailable card, RTL, equations, expandable-mind-map reference, and constrained-lab reference.
- Admin fixture shows all seven capabilities with REQUIRED applicability, review status, and missing-reason evidence.
- Test file: tests/content-packages/chemistry-g12-iron-v3.test.mjs — 12/12 PASS
- Checks cover mapping, shared-book identity, fidelity gate, static HTML, mind map, lab, question filtering, self-test separation, revision pinning, leak scans, capability order, readiness, provenance, and previews.
- Regression: 209/209 PASS.
- Typecheck: PASS via npx tsc --noEmit; the repository has no typecheck npm script.
- Build: PASS via npm run build.
- git diff --check and secret scan are handoff gates.
- Browser automation was unavailable in the execution environment; static fixture/security checks were completed and no production route was added.

## Content gaps and system gaps

Content gaps are the unresolved IDs and required official page/image fidelity approval. No system gap was found in CONTENT_PACKAGE_ONLY. The protected 21H migration, reveal RPC, RLS, and Content V3 core schema were untouched.

## Exact production import plan — not executed

1. Resolve grade, subject, track, unit, semester, and lesson identity from the architecture owner.
2. Import Sanaa and Aden main textbooks and one shared activity-book record at subject level.
3. Create/import the iron lesson identity.
4. Import and independently review official 20A content, figures, equations, and page fidelity.
5. Import Tamkeen explanation, summary, static mind map, and interactive lab.
6. Attach official-question companion data with provenance and server-controlled reveal.
7. Import the SHA-pinned self-test with answers/rationales excluded from initial payload.
8. Complete content, security, mobile, and sandbox review.
9. Make the normal READY decision only after review.
10. Run student E2E for both tracks and all seven capabilities.

No production step above was executed.
