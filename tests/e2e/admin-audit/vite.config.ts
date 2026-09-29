import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const path = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
export default defineConfig({
  root: path("tests/e2e/admin-audit"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@/hooks/use-auth", replacement: path("tests/e2e/admin-audit/dependencies.tsx") },
      {
        find: "@tanstack/react-router",
        replacement: path("tests/e2e/admin-audit/dependencies.tsx"),
      },
      { find: "@", replacement: path("src") },
    ],
  },
  build: { outDir: path("artifacts/admin-audit-dist"), emptyOutDir: true },
});
