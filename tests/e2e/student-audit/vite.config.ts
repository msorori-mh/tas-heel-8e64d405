import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const fromRoot = (path: string) => fileURLToPath(new URL(`../../../${path}`, import.meta.url));
export default defineConfig({
  root: fromRoot("tests/e2e/student-audit"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@/hooks/use-auth",
        replacement: fromRoot("tests/e2e/student-audit/dependencies.tsx"),
      },
      {
        find: "@/components/offline/OfflineSyncBridge",
        replacement: fromRoot("tests/e2e/student-audit/dependencies.tsx"),
      },
      { find: "@", replacement: fromRoot("src") },
    ],
  },
  build: { outDir: fromRoot("artifacts/student-audit-dist"), emptyOutDir: true },
});
