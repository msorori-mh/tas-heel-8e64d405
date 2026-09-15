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
    alias: {
      "@/integrations/supabase/client": path.resolve(here, "api.ts"),
      "@": path.resolve(here, "../../../src"),
    },
  },
});
