import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath } from "node:url";
const path = (p: string) => fileURLToPath(new URL(`../../../${p}`, import.meta.url));
export default defineConfig({
  root: path("tests/e2e/question-preview"),
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path("src") } },
  server: { host: "127.0.0.1", port: 4187, strictPort: true },
});
