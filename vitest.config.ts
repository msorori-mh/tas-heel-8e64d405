import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";

// Keep unit tests independent from the production Lovable/TanStack Vite
// configuration. Loading that build configuration starts build-only plugins
// which leave open handles after otherwise successful test files.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: false,
    passWithNoTests: false,
    pool: "forks",
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      // Historical 14C package: its pending SQL was intentionally retired and
      // the test cannot execute against the current migration tree.
      "tests/import/ministerial-admin-import-14c.test.ts",
      // This superseded guard prohibits legitimate component-level deletion;
      // current deletion authorization is covered by the scoped server paths.
      "tests/import/no-direct-curriculum-delete.test.ts",
    ],
  },
});
