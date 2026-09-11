import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, "../../..");
export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@/integrations/supabase/client", replacement: path.join(here, "stub.ts") },
      { find: "@/lib/schools/student-school-api", replacement: path.join(here, "stub.ts") },
      { find: "@", replacement: path.join(repo, "src") },
    ],
  },
  server: { fs: { allow: [repo] } },
});
