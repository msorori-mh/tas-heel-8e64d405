import { defineConfig, devices } from "@playwright/test";

/**
 * Minimal Playwright configuration for local operational browser E2E.
 *
 * These tests exercise the real local dev server against Local Supabase.
 * They do NOT touch production.
 */
export default defineConfig({
  testDir: "./tests/content-import",
  testMatch: "browser-html-content-e2e.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8080",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:8080",
    reuseExistingServer: true,
    timeout: 120 * 1000,
    env: {
      VITE_SUPABASE_URL: process.env.SUPABASE_URL || "http://127.0.0.1:54421",
      VITE_SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY || "",
    },
  },
});
