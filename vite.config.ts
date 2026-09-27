import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

function resolveBuildSha(): string {
  const provided = process.env.GITHUB_SHA ?? process.env.VITE_GIT_SHA;
  if (provided?.trim()) return provided.trim();

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

const release = Object.freeze({
  sha: resolveBuildSha(),
  builtAt: new Date().toISOString(),
});

export default defineConfig(({ command, mode }) => ({
  plugins: [
    tailwindcss(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({
      server: { entry: "server" },
      // Retain the client/server boundary enforced by the previous wrapper.
      importProtection: {
        behavior: "error",
        client: { files: ["**/server/**"], specifiers: ["server-only"] },
      },
    }),
    ...(command === "build" ? [nitro({ preset: "node-server" })] : []),
    react(),
  ],
  css: { transformer: "lightningcss" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  define: {
    // Only public VITE_* values may be embedded. Server secrets stay at runtime.
    ...Object.fromEntries(
      Object.entries(loadEnv(mode, process.cwd(), "VITE_")).map(([key, value]) => [
        `import.meta.env.${key}`,
        JSON.stringify(value),
      ]),
    ),
    "import.meta.env.VITE_ACADEMY_ENABLED": JSON.stringify("true"),
    "import.meta.env.VITE_ACADEMY_BASE_PATH": JSON.stringify("/academy"),
    __TAMKEEN_RELEASE__: JSON.stringify(release),
  },
}));
