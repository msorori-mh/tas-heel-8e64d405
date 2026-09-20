// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
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
const bundledNative =
  process.env.TAMKEEN_REVIEW_APK === "1" || process.env.TAMKEEN_NATIVE_APP === "1";

export default defineConfig({
  ...(bundledNative
    ? {
        plugins: [
          {
            name: "review-apk-pinned-assets",
            enforce: "pre" as const,
            transform(code: string, id: string) {
              if (!id.endsWith("/src/lib/pwa/register-sw.ts")) return;
              return {
                code: code.replace(
                  "export function registerServiceWorker(): void {",
                  "export function registerServiceWorker(): void { return;",
                ),
                map: null,
              };
            },
          },
        ],
      }
    : {}),
  ...(bundledNative ? { nitro: false as const } : {}),
  vite: {
    ...(bundledNative ? { preview: { host: "127.0.0.1" } } : {}),
    // Lovable publishes the student app from the repository root. The academy
    // database passed production post-verify before this route was enabled, so
    // the root build deliberately exposes the isolated academy UI below /academy.
    // The standalone academy build remains fail-closed through its own env flag.
    define: {
      "import.meta.env.VITE_ACADEMY_ENABLED": JSON.stringify("true"),
      "import.meta.env.VITE_ACADEMY_BASE_PATH": JSON.stringify("/academy"),
      __TAMKEEN_RELEASE__: JSON.stringify(release),
    },
  },
  tanstackStart: {
    // Explicit review-only packaging; the normal web/release build remains SSR.
    ...(bundledNative
      ? {
          prerender: { concurrency: 1 },
          spa: { enabled: true, prerender: { outputPath: "/index" } },
        }
      : {}),
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
