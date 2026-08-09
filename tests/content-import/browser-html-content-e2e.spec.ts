/**
 * Browser Operational E2E for HTML Content
 *
 * Exercises the real local dev UI against Local Supabase.
 * Assumes the backend operational E2E has seeded published resources.
 */

import { test, expect, type Page } from "@playwright/test";
import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import {
  ensureServiceRoleGrants,
  ensureAuthenticatedGrants,
  resetTestData,
  seedTestData,
  ensureLocalActorWrappers,
  assertFeatureFlagsEnabled,
  DETERMINISTIC,
} from "./html-operational-e2e-helpers.mjs";

declare global {
  interface Window {
    __TasheelBridge?: {
      markExperimentCompleted: () => void;
    };
  }
}

const STUDENT_EMAIL = "student-html-e2e@test.local";
const STUDENT_PASSWORD = "Password123!";
const ADMIN_EMAIL = "admin-html-e2e@test.local";
const ADMIN_PASSWORD = "Password123!";

async function signIn(page: Page, email: string, password: string) {
  // Sign in via API to obtain a valid access token, then inject it as an extra
  // HTTP header so all Supabase REST and server function calls are authenticated.
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) throw new Error("Missing Supabase env vars");
  const anonClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anonClient.auth.signInWithPassword({ email, password });
  if (error || !data.session?.access_token) {
    throw new Error(`API sign-in failed: ${error?.message || "no session"}`);
  }
  await page.setExtraHTTPHeaders({ Authorization: `Bearer ${data.session.access_token}` });

  await page.goto("/auth?mode=login");
  await page.waitForLoadState("networkidle");

  const emailInput = page.getByRole("textbox", { name: "البريد الإلكتروني" });
  const passwordInput = page.locator('input#login-password');
  await expect(emailInput).toBeVisible({ timeout: 10000 });
  await emailInput.fill(email);
  await passwordInput.fill(password);

  const submitButton = page.getByRole("button", { name: "تسجيل الدخول" });
  await expect(submitButton).toBeEnabled();
  await submitButton.click();

  await page.waitForURL(/\/(app|complete-profile)/, { timeout: 15000 });
}

async function seedOperationalData() {
  await ensureServiceRoleGrants();
  await ensureAuthenticatedGrants();
  await resetTestData();
  await seedTestData();
  await ensureLocalActorWrappers();
  await assertFeatureFlagsEnabled();

  // Generate fixtures first, then run the backend operational E2E once with
  // cleanup disabled so published resources exist for the browser assertions.
  execSync("node tests/content-import/fixtures/generate-html-e2e-fixtures.mjs", { stdio: "inherit" });
  execSync("node --import tsx --test tests/content-import/html-content-operational-e2e.test.mjs", {
    stdio: "inherit",
    env: { ...process.env, SKIP_HTML_E2E_CLEANUP: "1" },
  });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await seedOperationalData();
});

test.afterAll(async () => {
  await resetTestData();
});

test("Admin import page loads and accepts operational import wiring", async ({ page }) => {
  await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await page.goto("/admin/import");
  await page.waitForLoadState("networkidle");

  // Page title / import container should render.
  await expect(page.locator("text=استيراد المحتوى")).toBeVisible({ timeout: 10000 });

  // Upload area for resources exists.
  await expect(page.locator('[data-testid="resource-upload-zone"], input[type="file"]').first()).toBeAttached();
});

test("Student lesson page renders HTML Mind Map, Experiment, and Summary viewers", async ({ page }) => {
  await signIn(page, STUDENT_EMAIL, STUDENT_PASSWORD);

  await page.goto(`/lessons/${DETERMINISTIC.lessonId}`);
  await page.waitForLoadState("networkidle");

  // Journey cards for the three HTML resource types.
  await expect(page.locator("text=خريطة ذهنية تفاعلية").first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator("text=تجربة عملية تفاعلية").first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator("text=راجع الملخص").first()).toBeVisible({ timeout: 15000 });

  // Expand each journey card so the HTML viewers mount and load.
  await page.getByRole("button", { name: "عرض الخريطة" }).first().click();
  await page.getByRole("button", { name: "ابدأ التجربة" }).first().click();
  await page.getByRole("button", { name: "عرض الملخص" }).first().click();

  // Each viewer has a sandboxed iframe with strict sandbox attributes.
  const iframes = page.locator("iframe[title]");
  await expect(iframes.first()).toBeAttached({ timeout: 15000 });
  const count = await iframes.count();
  expect(count).toBeGreaterThanOrEqual(3);

  for (let i = 0; i < count; i++) {
    const iframe = iframes.nth(i);
    const sandbox = await iframe.getAttribute("sandbox");
    expect(sandbox).toContain("allow-scripts");
    expect(sandbox).not.toContain("allow-same-origin");
  }
});

test("Experiment iframe can send experiment_completed and viewer records completion without marking lesson completed", async ({ page }) => {
  await signIn(page, STUDENT_EMAIL, STUDENT_PASSWORD);
  await page.goto(`/lessons/${DETERMINISTIC.lessonId}`);
  await page.waitForLoadState("networkidle");

  // Expand the experiment card and wait for its iframe to load.
  await page.getByRole("button", { name: "ابدأ التجربة" }).first().click();
  const experimentIframe = page
    .locator("iframe[title='TEST_ONLY_TAMKEEN_HTML_E2E Experiment']")
    .first();
  await expect(experimentIframe).toBeAttached({ timeout: 15000 });

  // Wait for the viewer's loading overlay to disappear (iframe onLoad fired, activeWindow bound).
  await expect(
    page.locator("text=جاري تهيئة بيئة العزل التفاعلية...").first(),
  ).not.toBeVisible({ timeout: 15000 });

  // Trigger experiment_completed through the injected bridge.
  const frame = page.frames().find((f) => f.url().includes("srcdoc"));
  await frame?.evaluate(() => {
    const bridge = window.__TasheelBridge;
    if (bridge && typeof bridge.markExperimentCompleted === "function") {
      bridge.markExperimentCompleted();
    } else {
      throw new Error("Tasheel bridge not available inside iframe");
    }
  });

  // The viewer UI should display the completion badge.
  await expect(
    page.locator("text=سجل المورد التفاعلي إكمال النشاط").first(),
  ).toBeVisible({ timeout: 10000 });

  // Lesson should NOT be auto-completed by a resource event.
  await expect(page.locator("text=اكتمل الدرس").first()).not.toBeVisible();
});
