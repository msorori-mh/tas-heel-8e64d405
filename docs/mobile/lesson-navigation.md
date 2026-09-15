# Lesson component navigation

Baseline: `ded0dbf54a83678baba031c606f417539b933668`.

The student's Iron lesson screenshot shows the final two components clipped off the horizontal strip on a tablet. The strip previously required horizontal scrolling and its enclosing section used overflow:hidden. Long question panels also had no shortcut back to the component chooser.

The shared lesson component chooser now wraps into two columns on phones, three on tablets, and four on wide screens. Labels can wrap. The outer section no longer creates a hidden overflow container. A fixed “مكونات الدرس” button appears after the chooser leaves the viewport above and returns to the active component, above the mobile bottom navigation. Existing visited panels stay mounted so switching components preserves local answers. Content loading, offline reconstruction and HTML sandbox policies are unchanged.

Validation:

- TypeScript and targeted ESLint pass.
- Three component interaction tests pass: last two components, answer preservation, scroll return/focus and RTL keyboard navigation.
- Eight existing interactive renderer/lesson contract tests pass after moving chooser-specific assertions to its extracted module.
- The optional historical `lesson-question-separation.static.test.mjs` has a pre-existing assertion for `get_lesson_official_questions`; baseline already uses `get_lesson_questions_with_images`. This unrelated assertion was not changed.
- A manual fixture is available with `npx vite --config tests/e2e/lesson-navigation/vite.config.ts`; it renders the actual chooser and long TEST_ONLY panels without authentication or production data. Check widths 360, 768, 960 and 1366, switch the last two tabs, enter an answer, switch away/back, scroll down/up and use the return button.
- CI adds Chromium layout and interaction checks at 360, 768, 960 and 1366 pixels, with screenshots: all seven tabs fit, both final tabs accept taps, answers persist, document scroll moves down/up and the shortcut returns to the active tab. Results are recorded by the workflow; native swipes are not simulated.
- Cloud Browser cannot open the local loopback preview. No physical Android touch-scroll acceptance is claimed. Static textbook frames keep their separate sandboxed scrolling; this patch does not change that renderer.

Rollback: revert the UI commit; no migration or data rollback is needed.
