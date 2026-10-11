import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
export const baselineFiles = [
  "src/routes/_authenticated/app.tsx",
  "src/routes/_authenticated/exams.index.tsx",
  "src/components/student/StudentShell.tsx",
  ...[
    "HomeGreeting",
    "ContinueLearningCard",
    "CompactProgress",
    "DailyGoalCard",
    "LearningToolsSection",
    "AiAssistantCard",
  ].map((name) => `src/components/home/${name}.tsx`),
  "src/styles.css",
];
for (const path of baselineFiles) {
  const target = `artifacts/student-home-exams-baseline/${path}`;
  mkdirSync(dirname(target), { recursive: true });
  let source = execFileSync("git", ["show", `c48f3feae5ddf682f8745755442f9190557a6d9e:${path}`], {
    encoding: "utf8",
  });
  source = source
    .replace("function StudentHome()", "export function StudentHome()")
    .replace("function ExamsHubPage()", "export function ExamsHubPage()");
  writeFileSync(target, source);
}
