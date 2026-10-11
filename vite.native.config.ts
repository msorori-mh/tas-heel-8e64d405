import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { buildRelease } from "./scripts/release/build-release";
import { PUBLIC_SUPABASE_PROJECT_ID } from "./src/integrations/supabase/public-config";

// Package the current student UI without changing the production backend or web build.
const { sourceManifest, ...release } = buildRelease(process.cwd());
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
      spa: { enabled: true, maskPath: "/app" },
      prerender: { concurrency: 1 },
    }),
    react(),
    nitro({ preset: "node-server" }),
    {
      name: "tamkeen-native-release",
      apply: "build",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: `release-source-${release.sourceSha256}.json`,
          source: JSON.stringify(sourceManifest),
        });
        this.emitFile({
          type: "asset",
          fileName: "native-release.json",
          source: JSON.stringify({
            schema: 1,
            targetProject: PUBLIC_SUPABASE_PROJECT_ID,
            appOrigin: "https://studentamkeen.com",
            androidAppId: "app.studentamkeen.tamkeen",
            ...release,
          }),
        });
      },
    },
  ],
  resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"] },
  build: { assetsDir: "native-shell/assets" },
  define: {
    "import.meta.env.VITE_NATIVE_SHELL": JSON.stringify("true"),
    "import.meta.env.VITE_INDEPENDENT_STAGING": JSON.stringify("false"),
    "import.meta.env.VITE_ACADEMY_ENABLED": JSON.stringify("true"),
    "import.meta.env.VITE_ACADEMY_BASE_PATH": JSON.stringify("/academy"),
    __TAMKEEN_RELEASE__: JSON.stringify(release),
  },
});
