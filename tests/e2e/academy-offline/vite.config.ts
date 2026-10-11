import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: here,
  base: "/academy-shell/",
  plugins: [react()],
  resolve: {
    alias: [
      { find: /^\.\.\/lib\/supabase$/, replacement: path.resolve(here, "supabase.ts") },
      { find: /^\.\.\/lib\/academy-api$/, replacement: path.resolve(here, "api.ts") },
    ],
  },
});
