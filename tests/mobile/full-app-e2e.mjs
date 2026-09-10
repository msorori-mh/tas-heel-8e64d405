/** Actual bundled route tree, with a disposable OAuth/provider boundary.
 * Google itself and a physical Samsung phone require a separate acceptance run.
 * No production data, credentials or auth sessions are read or modified here. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium } from "playwright";

const root = resolve("dist-mobile");
const evidence = resolve("artifacts/full-app-e2e");
await mkdir(evidence, { recursive: true });
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
};
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  const file = resolve(root, "." + path);
  if (file !== root && !file.startsWith(root + "/")) {
    res.writeHead(403).end();
    return;
  }
  try {
    res.setHeader("content-type", types[extname(file)] ?? "application/octet-stream");
    res.end(await readFile(file));
  } catch {
    res.setHeader("content-type", "text/html");
    res.end(await readFile(resolve(root, "index.html")));
  }
});
await new Promise((r) => server.listen(4176, "127.0.0.1", r));
const origin = "http://127.0.0.1:4176";
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const role of ["student", "teacher"]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const errors = [];
    const external = [];
    let exchanges = 0;
    let authorizations = 0;
    let callbacks = 0;
    page.on("pageerror", (e) => errors.push(e.message));
    context.on("page", (p) => {
      if (p !== page) external.push("unexpected popup");
    });
    const uid =
      role === "student"
        ? "11111111-1111-4111-8111-111111111111"
        : "22222222-2222-4222-8222-222222222222";
    const user = {
      id: uid,
      aud: "authenticated",
      role: "authenticated",
      email: `TEST_ONLY_${role}@example.invalid`,
      app_metadata: { provider: "google", providers: ["google"] },
      user_metadata: {},
      created_at: "2026-09-01T00:00:00Z",
      identities: [{ provider: "google", user_id: uid }],
    };
    const session = {
      access_token: `TEST_ONLY_${role}_token`,
      refresh_token: "TEST_ONLY_refresh",
      token_type: "bearer",
      expires_in: 86400,
      expires_at: Math.floor(Date.now() / 1000) + 86400,
      user,
    };
    const profile = {
      id: uid,
      user_id: uid,
      full_name: "اختبار " + role,
      grade_id: "12",
      grade_uuid: "33333333-3333-4333-8333-333333333333",
      governorate: "TEST_ONLY",
      governorate_id: "44444444-4444-4444-8444-444444444444",
      curriculum_track_id: "55555555-5555-4555-8555-555555555555",
      school_name: "TEST_ONLY",
      phone: null,
      avatar_url: null,
    };
    const teacher = {
      user_id: uid,
      full_name: "معلم TEST_ONLY",
      primary_subject_id: "66666666-6666-4666-8666-666666666666",
      governorate_id: profile.governorate_id,
      school_name: "TEST_ONLY",
      phone: null,
      status: "ACTIVE",
    };
    await context.route("**/*", async (route) => {
      const req = route.request(),
        u = new URL(req.url()),
        p = u.pathname;
      if (u.origin === origin) {
        if (p.endsWith("/callback") && u.searchParams.has("code")) callbacks++;
        if (p.startsWith("/api/") || p.startsWith("/_serverFn/"))
          return route.fulfill({
            status: 503,
            json: { message: "TEST_ONLY server operation not in scope" },
          });
        return route.continue();
      }
      // Only the exact public project is stubbed. All other external access is blocked.
      if (u.origin !== "https://zbdhxyuulyovihjgeqbn.supabase.co") return route.abort();
      if (p === "/auth/v1/authorize") {
        authorizations++;
        assert.equal(u.searchParams.get("provider"), "google");
        assert(u.searchParams.get("code_challenge"), "PKCE challenge is required");
        const target = new URL(u.searchParams.get("redirect_to"));
        assert.equal(target.origin, origin);
        assert.equal(target.pathname, role === "student" ? "/auth/callback" : "/academy/callback");
        target.searchParams.set("code", `TEST_ONLY_${role}_authorization_code`);
        return route.fulfill({ status: 302, headers: { location: target.href } });
      }
      if (p === "/auth/v1/token") {
        exchanges++;
        assert.equal(u.searchParams.get("grant_type"), "pkce");
        const body = req.postDataJSON();
        assert.equal(body.auth_code, `TEST_ONLY_${role}_authorization_code`);
        assert(body.code_verifier.length >= 43);
        return route.fulfill({ json: session });
      }
      if (p === "/auth/v1/user") return route.fulfill({ json: user });
      if (p === "/auth/v1/logout") return route.fulfill({ status: 204, body: "" });
      if (p === "/rest/v1/profiles") return route.fulfill({ json: profile });
      if (p === "/rest/v1/teacher_profiles") {
        assert.equal(req.headers()["accept-profile"], "academy");
        return route.fulfill({ json: teacher });
      }
      if (p === "/rest/v1/rpc/has_role" || p === "/rest/v1/rpc/i_have_capability")
        return route.fulfill({ json: false });
      if (p === "/rest/v1/rpc/get_student_unified_performance")
        return route.fulfill({
          json: {
            progress: { total_lessons: 0, completed_lessons: 0, completion_percentage: 0 },
            summary: {},
            subjects: [],
            lessons: [],
            by_attempt_type: [],
            highlights: {},
          },
        });
      if (p === "/rest/v1/rpc/get_user_total_points") return route.fulfill({ json: 0 });
      if (p.startsWith("/rest/v1/")) return route.fulfill({ json: [] });
      return route.abort();
    });
    try {
      await page.goto(origin + "/");
      await page.getByRole("heading", { name: "طريقك المنظم للتفوّق" }).waitFor();
      await page
        .getByRole("link", {
          name: role === "student" ? "دخول الطالب" : "دخول المعلم",
          exact: true,
        })
        .click();
      assert.equal(new URL(page.url()).origin, origin);
      await page.getByRole("button", { name: "المتابعة باستخدام Google", exact: true }).click();
      if (role === "student") {
        await page.getByRole("heading", { name: "مرحباً، اختبار" }).waitFor({ timeout: 20000 });
        assert.equal(new URL(page.url()).pathname, "/app");
        const items = await page
          .locator(".ds-v2 > section, .ds-v2 > div")
          .evaluateAll((nodes) => nodes.map((n) => n.textContent));
        assert(items.join("\n").includes("الفصل الدراسي الأول"));
        assert(items.join("\n").includes("الفصل الدراسي الثاني"));
        await page.getByRole("link", { name: "موادي", exact: true }).last().waitFor();
      } else {
        await page.locator(".workspace-shell").waitFor({ timeout: 20000 });
        assert.equal(new URL(page.url()).pathname.replace(/\/$/, ""), "/academy");
        await page.getByRole("button", { name: "القائمة", exact: true }).click();
        await page.getByRole("button", { name: "ملفي المهني", exact: true }).click();
        await page.getByRole("textbox").first().waitFor();
      }
      assert.equal(exchanges, 1, "the callback exchanges the one-use code exactly once");
      assert.equal(authorizations, 1);
      assert.equal(external.length, 0);
      await page.screenshot({ path: resolve(evidence, role + "-signed-in.png"), fullPage: true });
      await page.reload();
      await page.locator(role === "student" ? ".student-theme" : ".workspace-shell").waitFor();
      assert.equal(exchanges, 1, "reload restores the existing session");
      // Simulate the native asset server: bundled page/assets remain local while
      // only network APIs fail. This is separate from the Android bridge test.
      await context.route("**/*", async (route) => {
        const u = new URL(route.request().url());
        if (
          u.origin === origin &&
          !u.pathname.startsWith("/api/") &&
          !u.pathname.startsWith("/_serverFn/")
        )
          return route.fallback();
        return route.abort("internetdisconnected");
      });
      await page.evaluate(() => {
        Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
        window.dispatchEvent(new Event("offline"));
      });
      await context.addInitScript(() =>
        Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false }),
      );
      await page.reload();
      await page
        .locator(role === "student" ? ".student-theme" : ".workspace-shell")
        .waitFor({ timeout: 20000 });
      if (role === "student") await page.getByRole("heading", { name: "مرحباً، اختبار" }).waitFor();
      await page.screenshot({ path: resolve(evidence, role + "-offline.png"), fullPage: true });
      if (role === "teacher") {
        await page.getByRole("button", { name: "القائمة", exact: true }).click();
        await page.getByRole("button", { name: "تسجيل الخروج", exact: true }).click();
        await page.getByRole("button", { name: "المتابعة باستخدام Google", exact: true }).waitFor();
      } else {
        // Sign out through the original settings UI.
        await page.getByRole("link", { name: "حسابي", exact: true }).last().click();
        await page
          .locator("main")
          .getByRole("button", { name: "تسجيل الخروج", exact: true })
          .click();
        await page.getByRole("button", { name: "المتابعة باستخدام Google", exact: true }).waitFor();
      }
      assert.equal(
        await page.evaluate(() => localStorage.getItem("sb-zbdhxyuulyovihjgeqbn-auth-token")),
        null,
      );
      assert.deepEqual(errors, []);
      results.push({
        role,
        status: "PASS",
        checks: [
          "original entry",
          "internal portal",
          "PKCE callback once",
          "original workspace",
          "reload restores session",
          "offline saved workspace",
          "offline logout",
        ],
        googleProvider: "SIMULATED",
      });
    } catch (e) {
      await page.screenshot({ path: resolve(evidence, role + "-failure.png"), fullPage: true });
      await writeFile(
        resolve(evidence, role + "-failure.txt"),
        await page.locator("body").innerText(),
      );
      results.push({
        role,
        status: "FAIL",
        message: e.message,
        errors,
        exchanges,
        authorizations,
        callbacks,
      });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  server.close();
}
await writeFile(
  resolve(evidence, "results.json"),
  JSON.stringify(
    { results, physicalDevice: "NOT_TESTED", realGoogleAccounts: "NOT_TESTED" },
    null,
    2,
  ),
);
console.log(JSON.stringify(results, null, 2));
assert(
  results.every((r) => r.status === "PASS"),
  "Full application role E2E failed",
);
