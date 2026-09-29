import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const path = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
export default defineConfig({
  root: path("tests/e2e/teacher-audit"),
  plugins: [
    {
      name: "teacher-test-only-dependencies",
      enforce: "pre",
      resolveId(source, importer) {
        if (
          importer?.endsWith("/apps/teacher-academy/src/App.tsx") &&
          [
            "./lib/academy-api",
            "./lib/supabase",
            "./AdminHome",
            "./pwa/AcademyPwaControls",
            "../../../src/lib/auth/workspace",
            "../../../src/lib/auth/explicit-sign-out",
          ].includes(source)
        )
          return path("tests/e2e/teacher-audit/api.ts");
      },
    },
    react(),
  ],
  resolve: { alias: { "@": path("src") } },
  build: { outDir: path("artifacts/teacher-audit-dist"), emptyOutDir: true },
});
