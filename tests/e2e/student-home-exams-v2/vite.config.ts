import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const fromRoot = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const baselineFiles = [
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
const stub = fromRoot("tests/e2e/student-home-exams-v2/dependencies.tsx");
export default defineConfig({
  root: fromRoot("tests/e2e/student-home-exams-v2"),
  publicDir: fromRoot("public"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      ...[
        "@/hooks/use-auth",
        "@/hooks/use-home-dashboard",
        "@/hooks/use-exam-countdown",
        "@/hooks/use-exam-history",
        "@/components/student/SemesterSubjectsView",
        "@/components/offline/OfflineSyncBridge",
        "@/integrations/supabase/client",
      ].map((find) => ({ find, replacement: stub })),
      ...(process.env.UI_BASELINE
        ? baselineFiles.map((path) => ({
            find: `@/${path.slice(4).replace(/\.tsx$/, "")}`,
            replacement: fromRoot(`artifacts/student-home-exams-baseline/${path}`),
          }))
        : []),
      { find: "@", replacement: fromRoot("src") },
    ],
  },
  build: { outDir: fromRoot("artifacts/student-home-exams-v2-dist"), emptyOutDir: true },
});
