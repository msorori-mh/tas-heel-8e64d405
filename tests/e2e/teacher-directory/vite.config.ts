import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const path = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
export default defineConfig({
  root: path("tests/e2e/teacher-directory"),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@/lib/admin-teachers", replacement: path("tests/e2e/teacher-directory/api.ts") },
      ...["@/hooks/use-auth", "@tanstack/react-router", "@/integrations/supabase/client"].map(
        (find) => ({ find, replacement: path("tests/e2e/teacher-directory/dependencies.tsx") }),
      ),
      { find: "@", replacement: path("src") },
    ],
  },
  build: { outDir: path("artifacts/teacher-directory-dist"), emptyOutDir: true },
});
