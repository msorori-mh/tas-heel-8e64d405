import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
const html = readFileSync("mobile/www/index.html", "utf8");
let dom: JSDOM;
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));
async function boot(online = false, available = true) {
  const openOnline = vi.fn().mockResolvedValue(undefined);
  const listeners: Record<string, () => void> = {};
  dom = new JSDOM(html, {
    url: "https://studentamkeen.com/index.html",
    runScripts: "dangerously",
    beforeParse(window) {
      Object.defineProperty(window.navigator, "onLine", { value: online, configurable: true });
      window.scrollTo = () => {};
      window.fetch = vi.fn(() => {
        throw new Error("local-render-must-not-fetch");
      });
      window.Capacitor = {
        Plugins: {
          TamkeenLocalPages: { openOnline },
          App: {
            getInfo: async () => ({ version: "1.2.0", build: "9" }),
            minimizeApp: vi.fn(),
            addListener: async (name: string, callback: () => void) => {
              listeners[name] = callback;
            },
          },
          TamkeenPdfViewer: { listSavedTextbooks: async () => ({ books: [] }) },
          TamkeenOfflineContent: {
            getOfflineOverview: async () => ({
              available,
              subjectCount: available ? 1 : 0,
              lessonCount: available ? 1 : 0,
              attemptCount: 2,
              pendingSyncCount: 1,
            }),
            getLocalLibrary: async () => ({
              available,
              displayName: available ? "طالب تجريبي" : "",
              packs: available
                ? [{ title: "الكيمياء", status: "ready", downloadedBytes: 1024 }]
                : [],
            }),
            listSavedSubjects: async () => ({
              subjects: available
                ? [
                    {
                      title: "الكيمياء",
                      lessons: [{ lessonId: "iron", title: "الحديد", artifactCount: 1 }],
                    },
                  ]
                : [],
            }),
            readLesson: async () => ({
              title: "الحديد",
              components: [
                {
                  sourceType: "official-book",
                  title: "الحديد",
                  body: "محتوى الحديد",
                  contentType: "text/plain",
                },
              ],
            }),
            readLessonAssessments: async () => ({ officialQuestions: [], selfTestQuestions: [] }),
          },
        },
      };
    },
  });
  await settle();
  return { openOnline, listeners, document: dom.window.document };
}
afterEach(() => dom?.window.close());
describe("bundled pages without a server", () => {
  it("cold starts with no network and renders all local screens from native data", async () => {
    const { document: d } = await boot();
    expect(d.getElementById("home-view")?.hidden).toBe(false);
    expect(d.getElementById("welcome")?.textContent).toContain("طالب تجريبي");
    for (const id of [
      "subjects-view",
      "exams-view",
      "progress-view",
      "account-view",
      "downloads-view",
      "settings-view",
    ]) {
      (d.querySelector(`[data-go="${id}"]`) as HTMLElement).click();
      expect(d.getElementById(id)?.hidden).toBe(false);
    }
    expect(dom.window.fetch).not.toHaveBeenCalled();
  });
  it("opens a downloaded lesson and reconnect does not replace it", async () => {
    const { document: d } = await boot();
    (d.querySelector("#subjects .lesson-button") as HTMLElement).click();
    await settle();
    expect(d.getElementById("lesson-view")?.hidden).toBe(false);
    dom.window.dispatchEvent(new dom.window.Event("online"));
    expect(d.getElementById("lesson-view")?.hidden).toBe(false);
    expect(dom.window.location.pathname).toBe("/index.html");
    const frame = d.querySelector("iframe");
    expect(frame?.getAttribute("sandbox")).toBe("");
  });
  it("shows a usable first-launch page without another account cached data", async () => {
    const { document: d, openOnline } = await boot(false, false);
    expect(d.getElementById("account-name")?.textContent).toContain("لم يتم تسجيل الدخول");
    (d.querySelector('[data-online="app"]') as HTMLElement).click();
    expect(openOnline).not.toHaveBeenCalled();
    expect(d.getElementById("network-message")?.textContent).toContain("تحتاج إلى الإنترنت");
  });
  it("only opens online services after an explicit tap", async () => {
    const { document: d, openOnline } = await boot(true);
    expect(openOnline).not.toHaveBeenCalled();
    (d.querySelector('[data-online="app"]') as HTMLElement).click();
    expect(openOnline).toHaveBeenCalledWith({ destination: "app" });
  });
  it("hardware back returns from local settings to home", async () => {
    const { document: d, listeners } = await boot();
    (d.querySelector('[data-go="settings-view"]') as HTMLElement).click();
    listeners.backButton();
    expect(d.getElementById("home-view")?.hidden).toBe(false);
  });
});
