// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  vite: {
    // Lovable publishes the student app from the repository root. The academy
    // database passed production post-verify before this route was enabled, so
    // the root build deliberately exposes the isolated academy UI below /academy.
    // The standalone academy build remains fail-closed through its own env flag.
    define: {
      "import.meta.env.VITE_ACADEMY_ENABLED": JSON.stringify("true"),
      "import.meta.env.VITE_ACADEMY_BASE_PATH": JSON.stringify("/academy"),
    },
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
