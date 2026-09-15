import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      {
        find: "@/integrations/supabase/client",
        replacement: path.resolve(here, "supabase-fixture.ts"),
      },
      { find: "@/hooks/use-auth", replacement: path.resolve(here, "auth-fixture.ts") },
      { find: "@", replacement: path.resolve(here, "../../../src") },
    ],
  },
  server: { fs: { allow: [path.resolve(here, "../../..")] } },
});
