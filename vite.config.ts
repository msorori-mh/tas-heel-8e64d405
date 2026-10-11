import { defineConfig, loadEnv } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { buildRelease } from "./scripts/release/build-release";

const { sourceManifest, ...release } = buildRelease(process.cwd());

// The original deployment target and public database configuration remain intact.
// The independent Node deployment uses vite.independent.config.ts explicitly.
export default defineConfig(({ mode, command }) => ({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({ server: { entry: "server" } }),
    react(),
    ...(command === "build" ? [nitro({ defaultPreset: "cloudflare-module" })] : []),
    {
      name: "tamkeen-release-proof",
      apply: "build",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: `release-source-${release.sourceSha256}.json`,
          source: JSON.stringify(sourceManifest),
        });
      },
    },
  ],
  resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"] },
  define: {
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
