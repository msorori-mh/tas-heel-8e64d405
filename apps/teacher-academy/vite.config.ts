import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const academyRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: academyRoot,
  ...(process.env.ACADEMY_OFFLINE_SHELL === "1"
    ? { publicDir: false, base: "/academy-shell/" }
    : {}),
  envDir: path.resolve(academyRoot, "../.."),
  plugins: [react()],
  resolve: {
    alias: {
      "@academy": path.resolve(academyRoot, "src"),
    },
  },
  build: {
    outDir: path.resolve(
      academyRoot,
      process.env.ACADEMY_OFFLINE_SHELL === "1" ? "../../dist-academy-shell" : "../../dist-academy",
    ),
    emptyOutDir: true,
  },
  server: {
    port: 4174,
    strictPort: true,
  },
  preview: {
    port: 4174,
    strictPort: true,
  },
});
