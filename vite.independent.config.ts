import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import { buildRelease } from "./scripts/release/build-release";
import {
  TARGET_URL,
  PUBLIC_KEY,
  TARGET_REF,
  validateStagingOrigin,
} from "./scripts/independent/config.mjs";

const origin = validateStagingOrigin(process.env.TAMKEEN_STAGING_ORIGIN);
const { sourceManifest, ...release } = buildRelease(process.cwd());
export default defineConfig({
  plugins: [
    tsconfigPaths(),
    tailwindcss(),
    tanstackStart({ server: { entry: "server" } }),
    react(),
    nitro({ preset: "node-server" }),
    {
      name: "tamkeen-independent-release",
      apply: "build",
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: `release-source-${release.sourceSha256}.json`,
          source: JSON.stringify(sourceManifest),
        });
        this.emitFile({
          type: "asset",
          fileName: "independent-release.json",
          source: JSON.stringify({
            schema: 1,
            targetProject: TARGET_REF,
            stagingOrigin: origin,
            androidAppId: "app.studentamkeen.tamkeen.staging",
            ...release,
          }),
        });
      },
    },
  ],
  resolve: { dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"] },
  define: {
    "import.meta.env.VITE_INDEPENDENT_STAGING": JSON.stringify("true"),
    "import.meta.env.VITE_STAGING_ORIGIN": JSON.stringify(origin),
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(TARGET_URL),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(PUBLIC_KEY),
    "process.env.SUPABASE_URL": JSON.stringify(TARGET_URL),
    "process.env.VITE_SUPABASE_URL": JSON.stringify(TARGET_URL),
    "process.env.SUPABASE_PUBLISHABLE_KEY": JSON.stringify(PUBLIC_KEY),
    "process.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(PUBLIC_KEY),
    "import.meta.env.VITE_ACADEMY_ENABLED": JSON.stringify("true"),
    "import.meta.env.VITE_ACADEMY_BASE_PATH": JSON.stringify("/academy"),
    __TAMKEEN_RELEASE__: JSON.stringify(release),
  },
});
