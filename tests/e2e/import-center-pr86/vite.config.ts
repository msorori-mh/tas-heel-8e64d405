import { fileURLToPath } from "node:url";
import path from "node:path";

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@/lib/content-factory/golden-lesson-direct.functions",
        replacement: path.resolve(here, "stubs/golden-lesson-direct.functions.ts"),
      },
      {
        find: "@/integrations/supabase/client",
        replacement: path.resolve(here, "stubs/supabase-client.ts"),
      },
      { find: "@", replacement: path.resolve(repoRoot, "src") },
    ],
  },
  server: {
    fs: { allow: [repoRoot] },
  },
});
