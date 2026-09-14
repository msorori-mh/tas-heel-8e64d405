import { writeFile, mkdir } from "node:fs/promises";
import { fingerprintOfflineText } from "../../src/lib/offline/offline-text-metadata.ts";
const bodies = [
  "",
  " \n\t",
  "\u00a0\ufeff",
  '<html dir="rtl">درس 🧪</html>',
  '<img src="data:image/png;base64,QUJD"/>',
  '<img src="https://example.com/a.png">',
  '<a href="//example.com">',
  "url( '//example.com/a')",
  "fetch('https://example.com')",
  "fetch ( 'http://example.com')",
  "prefetch('https://example.com')",
  "سfetch('https://example.com')",
  "data-answer =",
  "data-correct\n=",
  "correct-answer\t=",
  "data-rationale\u00a0=",
  "aria-answer-key=",
  "data-correct-answer=",
  "aria-model-answer=",
  "aria-rationale=",
  ...[
    "answer-key",
    "solution-text",
    "teacher-note",
    "explanation-hidden",
    "model-answer",
    "answer_key",
    "correct-answer",
    "correct_answer",
    "solution_steps",
    "hidden-explanation",
  ].flatMap((token) => [
    `class="${token}"`,
    `id='${token}'`,
    `class="foo ${token} bar"`,
    `class="س${token}س"`,
    `id="x${token}x"`,
  ]),
  '<p class="student-note">إجابة الطالب</p>',
  "<html>" + "م".repeat(600_000) + "</html>",
];
const vectors = [];
for (const body of bodies) vectors.push({ body, metadata: await fingerprintOfflineText(body) });
await mkdir("artifacts/capacity", { recursive: true });
await writeFile("artifacts/capacity/offline-metadata-vectors.json", JSON.stringify(vectors));
console.log(`Generated ${vectors.length} parity vectors`);
