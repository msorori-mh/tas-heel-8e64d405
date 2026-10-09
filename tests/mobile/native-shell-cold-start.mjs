/** Compiled SPA, fresh WebView-like process, native disk fixture, ZERO network. */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { resolve, extname } from "node:path";
import { createHash } from "node:crypto";
const root = resolve("mobile/native-www");
const manifest = JSON.parse(readFileSync(resolve(root, "native-shell-manifest.json")));
const origin = manifest.stagingOrigin;
const artifactDir = resolve("artifacts/native-shell");
mkdirSync(artifactDir, { recursive: true });
const profileDir = mkdtempSync(resolve(artifactDir, "browser-"));
const digest = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (v) =>
  Array.isArray(v)
    ? "[" + v.map(canonical).join(",") + "]"
    : v && typeof v === "object"
      ? "{" +
        Object.entries(v)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, x]) => JSON.stringify(k) + ":" + canonical(x))
          .join(",") +
        "}"
      : JSON.stringify(v);
const owner = "offline-test-student";
const lesson = "test-lesson";
const body = "<h1>درس الكيمياء المحفوظ</h1><p>هذا محتوى محلي للتحقق من إعادة التشغيل دون شبكة.</p>";
const artifact = {
  artifactId: "book-1",
  kind: "lesson-html",
  resourceId: "official-book:book-1",
  lessonId: lesson,
  lessonTitle: "الروابط الكيميائية",
  title: "الكتاب",
  relativePath: "book-1.html",
  contentType: "text/html",
  byteSize: Buffer.byteLength(body),
  sha256: digest(body),
  sortOrder: 0,
};
const pack = {
  schemaVersion: 1,
  packId: "pack-1",
  revision: 1,
  generatedAt: "2026-10-09T00:00:00.000Z",
  scope: {
    gradeId: "grade-12",
    curriculumTrackId: "track-1",
    semester: 1,
    subjectId: "chemistry",
    subjectTitle: "الكيمياء",
  },
  artifacts: [artifact],
};
const state = {
  schemaVersion: 1,
  updatedAt: pack.generatedAt,
  activeOwnerId: owner,
  packs: [
    {
      ownerId: owner,
      manifest: pack,
      manifestSha256: digest(canonical(pack)),
      status: "ready",
      verifiedArtifactIds: ["book-1"],
      downloadedBytes: artifact.byteSize,
      lastErrorCode: null,
      createdAt: pack.generatedAt,
      updatedAt: pack.generatedAt,
    },
  ],
  outbox: [],
  learning: [],
};
const preferences = {
  "tamkeen.student-shell.identity.v1": JSON.stringify({
    version: 1,
    profile: {
      id: "profile-1",
      user_id: owner,
      full_name: "طالب الاختبار",
      grade_uuid: "grade-12",
      grade_id: "grade-12",
      governorate_id: "gov-1",
      curriculum_track_id: "track-1",
    },
  }),
};
const files = {
  "tamkeen/offline/foundation-v1.json": JSON.stringify(state),
  ["tamkeen/offline-artifacts/" + owner + "/" + artifact.relativePath]:
    Buffer.from(body).toString("base64"),
};
const forbidden = [],
  errors = [];
const mime = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
let context;
async function open() {
  context = await chromium.launchPersistentContext(profileDir, {
    headless: true,
    viewport: { width: 393, height: 851 },
    args: ["--no-sandbox"],
  });
  await context.setOffline(true);
  await context.exposeBinding("nativeCall", async (_, plugin, method, options = {}) => {
    if (plugin === "Preferences" || plugin === "TamkeenSecureStorage") {
      const store = plugin === "Preferences" ? preferences : {};
      if (method === "get") return { value: store[options.key] ?? null };
      if (method === "set") {
        store[options.key] = options.value;
        return {};
      }
      if (method === "remove") {
        delete store[options.key];
        return {};
      }
      if (method === "keys") return { keys: Object.keys(store) };
    }
    if (plugin === "Filesystem") {
      if (method === "readFile") {
        if (!(options.path in files)) throw Error("Missing file");
        return { data: files[options.path] };
      }
      if (method === "writeFile") {
        files[options.path] = options.data;
        return {};
      }
      if (method === "mkdir") return {};
      if (method === "deleteFile") {
        delete files[options.path];
        return {};
      }
    }
    if (plugin === "Network" && method === "getStatus")
      return { connected: false, connectionType: "none" };
    if (method === "addListener") return "fixture-listener";
    if (method === "removeListener" || method === "removeAllListeners") return {};
    if (plugin === "App" && method === "getLaunchUrl") return {};
    if (plugin === "LocalNotifications" && method === "checkPermissions")
      return { display: "denied" };
    throw Error(`Unmocked native call: ${plugin}.${method}`);
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, "onLine", { get: () => false });
    window.androidBridge = {};
    const methods = {
      Preferences: ["get", "set", "remove", "keys"],
      TamkeenSecureStorage: ["get", "set", "remove"],
      Filesystem: ["readFile", "writeFile", "deleteFile", "mkdir"],
      Network: ["getStatus"],
      App: ["getLaunchUrl"],
      LocalNotifications: ["checkPermissions"],
      Browser: [],
    };
    window.Capacitor = {
      PluginHeaders: Object.entries(methods).map(([name, list]) => ({
        name,
        methods: [...list, "addListener", "removeListener", "removeAllListeners"].map((name) => ({
          name,
          rtype: "promise",
        })),
      })),
      nativePromise: (p, m, o) => window.nativeCall(p, m, o),
      nativeCallback: (p, m, o) => window.nativeCall(p, m, o),
    };
  });
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin && url.pathname === "/seed")
      return route.fulfill({ contentType: "text/html", body: "<html></html>" });
    if (url.origin === origin && manifest.assets[url.pathname]) {
      const data = readFileSync(resolve(root, "." + url.pathname));
      assert.equal(digest(data), manifest.assets[url.pathname], url.pathname);
      return route.fulfill({
        body: data,
        contentType: mime[extname(url.pathname)] ?? "application/octet-stream",
      });
    }
    // Requests are recorded, never fulfilled by the network (including Google fonts).
    forbidden.push(url.href);
    return route.abort("internetdisconnected");
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  return page;
}
try {
  // Persist exactly the metadata the existing downloader writes, then DESTROY
  // this process. Subsequent launches have no in-memory router/query/asset cache.
  let page = await open();
  await page.goto(origin + "/seed");
  await page.evaluate(
    async ({ owner, artifact }) => {
      await new Promise((done, fail) => {
        const r = indexedDB.open("tamkeen-offline-artifacts", 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore("artifact-meta");
          r.result.createObjectStore("artifact-bytes");
        };
        r.onerror = () => fail(r.error);
        r.onsuccess = () => {
          const tx = r.result.transaction("artifact-meta", "readwrite");
          tx.objectStore("artifact-meta").put(
            { ownerId: owner, ...artifact },
            owner + "\u0000" + artifact.artifactId,
          );
          tx.oncomplete = () => {
            r.result.close();
            done();
          };
        };
      });
    },
    { owner, artifact },
  );
  await context.close();
  for (let launch = 1; launch <= 2; launch++) {
    page = await open();
    await page.goto(origin + "/index.html");
    await page
      .getByText("خطوة واحدة اليوم تصنع الفرق.", { exact: true })
      .waitFor({ timeout: 20000 });
    assert.equal(new URL(page.url()).pathname, "/app");
    assert.equal(await page.locator("#home-view").count(), 0, "legacy shell must not render");
    await page.waitForFunction(() =>
      [...document.querySelectorAll('img[src="/brand/student-tamkeen-mark.png"]')].every(
        (i) => i.complete && i.naturalWidth > 0,
      ),
    );
    await page.screenshot({
      path: resolve(artifactDir, `home-cold-${launch}.png`),
      fullPage: true,
    });
    const nav = page.getByRole("navigation", { name: "التنقل السفلي", exact: true });
    await nav.getByRole("link", { name: "موادي", exact: true }).click();
    await page.getByRole("heading", { name: "موادي", exact: true }).waitFor();
    await page.getByText("الكيمياء", { exact: true }).first().waitFor();
    await page.screenshot({
      path: resolve(artifactDir, `subjects-cold-${launch}.png`),
      fullPage: true,
    });
    await page.locator('a[href*="/subjects/chemistry"]').first().click();
    await page.getByText("الروابط الكيميائية", { exact: true }).first().waitFor();
    await page.locator('a[href*="/lessons/test-lesson"]').first().click();
    await page.getByText("الروابط الكيميائية", { exact: true }).first().waitFor();
    await page.waitForFunction(
      () =>
        document.body.innerText.includes("نص الكتاب") ||
        document.body.innerText.includes("درس الكيمياء المحفوظ"),
    );
    await page.screenshot({
      path: resolve(artifactDir, `lesson-cold-${launch}.png`),
      fullPage: true,
    });
    assert.equal(JSON.parse(files["tamkeen/offline/foundation-v1.json"]).activeOwnerId, owner);
    assert.ok(files["tamkeen/offline-artifacts/" + owner + "/" + artifact.relativePath]);
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    resolve(artifactDir, "result.json"),
    JSON.stringify(
      {
        status: "PASS",
        scope: "compiled React SPA, simulated native bridge, two complete browser restarts offline",
        networkRequestsFulfilled: 0,
        blockedRequests: forbidden,
        deviceTested: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "NATIVE_SHELL_COLD_START_PASS (compiled UI; native bridge simulated, not a device test)",
  );
} catch (error) {
  if (context) {
    for (const page of context.pages()) {
      console.error(
        (
          await page
            .locator("body")
            .innerText()
            .catch(() => "")
        ).slice(0, 5000),
      );
      await page.screenshot({ path: resolve(artifactDir, "failure.png") }).catch(() => {});
    }
  }
  console.error({ errors, blockedRequests: forbidden });
  throw error;
} finally {
  await context?.close().catch(() => {});
  rmSync(profileDir, { recursive: true, force: true });
}
