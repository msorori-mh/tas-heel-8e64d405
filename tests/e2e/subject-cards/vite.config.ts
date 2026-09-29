import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const fromRoot = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
export default defineConfig({
  root: fromRoot("tests/e2e/subject-cards"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@/components/textbooks/SubjectTextbooksSheet",
        replacement: fromRoot("tests/e2e/subject-cards/sheet.tsx"),
      },
      { find: "@", replacement: fromRoot("src") },
    ],
  },
  build: { outDir: fromRoot("artifacts/subject-cards-dist"), emptyOutDir: true },
});
