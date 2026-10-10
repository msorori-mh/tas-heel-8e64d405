// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SubjectLessonBrowser } from "../../src/components/subjects/SubjectLessonBrowser";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...props
  }: {
    to: string;
    params: Record<string, string>;
    children: ReactNode;
  }) => (
    <a {...props} href={to.replace(/\$\w+/, Object.values(params)[0])}>
      {children}
    </a>
  ),
}));
const units = ["المقدمة", "الإحصاء", "المراجعة"].map((title, index) => ({
  id: `unit-${index}`,
  title,
  description: null,
  sort_order: index,
  is_free: true,
  semester: 1,
}));
const lessons = [
  { id: "intro", title: "مقدمة الرياضيات", unit_id: "unit-0" },
  { id: "stats", title: "مَبادِئ الإِحْصَاء", unit_id: "unit-1" },
  { id: "advanced", title: "الإحصاء المتقدم", unit_id: "unit-2" },
  { id: "direct", title: "أَسَاسِيّات الجَبْر", unit_id: null },
  { id: "english", title: "Linear Algebra", unit_id: null },
].map((lesson, index) => ({ ...lesson, sort_order: index, duration: "10", semester: 1 }));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render(props = { units, lessons }, scope = "subject:1") {
  await act(async () =>
    root.render(<SubjectLessonBrowser key={scope} {...props} completed={new Set(["stats"])} />),
  );
}
async function search(query: string) {
  const input = host.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, query);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const lessonLinks = () =>
  [...host.querySelectorAll('a[href^="/lessons/"]')].map((link) => link.getAttribute("href"));
it("reveals matching lessons in every unit and keeps their original unit numbers", async () => {
  await render();
  expect(lessonLinks()).toEqual(["/lessons/intro"]);
  await search("احصاء");
  expect(lessonLinks()).toEqual(["/lessons/stats", "/lessons/advanced"]);
  expect(host.textContent).toContain("الوحدة 2:");
  expect(host.textContent).toContain("الوحدة 3:");
  expect(host.textContent).not.toContain("المقدمة");
  expect(host.querySelector('[role="status"]')?.textContent).toContain("2 من 5");
  expect(host.textContent).toContain("مكتمل 1");
});
it("matches Arabic without diacritics or tatweel, and ignores word order", async () => {
  await render();
  await search("  اــحصاء   مبادئ ");
  expect(lessonLinks()).toEqual(["/lessons/stats"]);
  expect(host.textContent).toContain("مَبادِئ الإِحْصَاء");
});
it("searches ungrouped lessons beside real units", async () => {
  await render();
  await search("اساسيات");
  expect(lessonLinks()).toEqual(["/lessons/direct"]);
  expect(host.textContent).toContain("دروس أخرى");
  expect(host.querySelector('a[href^="/units/"]')).toBeNull();
});
it("supports the flat lesson list saved for offline use", async () => {
  await render({ units: [], lessons });
  expect(lessonLinks()).toHaveLength(5);
  await search("algebra");
  expect(lessonLinks()).toEqual(["/lessons/english"]);
  expect(host.textContent).not.toContain("الوحدة");
});
it("shows an honest no-results state and clearing restores browsing and input focus", async () => {
  await render();
  await search("غير موجود");
  expect(lessonLinks()).toEqual([]);
  expect(host.textContent).toContain("لا توجد دروس مطابقة");
  expect(host.querySelector('[role="status"]')?.textContent).toContain("0 من 5");
  await act(async () =>
    host.querySelector<HTMLButtonElement>('button[aria-label="مسح البحث"]')!.click(),
  );
  expect(host.querySelector<HTMLInputElement>("input")!.value).toBe("");
  expect(document.activeElement).toBe(host.querySelector("input"));
  expect(lessonLinks()).toEqual(["/lessons/intro"]);
  expect(host.textContent).not.toContain("لا توجد دروس مطابقة");
});
it("does not treat spaces or Arabic marks alone as a filter", async () => {
  await render({ units: [], lessons });
  await search("  َـ   ");
  expect(lessonLinks()).toHaveLength(5);
});
it("resets search when the subject or semester scope changes", async () => {
  await render();
  await search("احصاء");
  await render({ units: [], lessons: [lessons[3]] }, "subject:2");
  expect(host.querySelector<HTMLInputElement>("input")!.value).toBe("");
  expect(lessonLinks()).toEqual(["/lessons/direct"]);
});
it("does not advertise search when the subject has only empty units", async () => {
  await render({ units, lessons: [] });
  expect(host.querySelector("input")).toBeNull();
  expect(host.textContent).toContain("لا توجد دروس في هذه الوحدة بعد");
});
it("matches alef maqsura, Latin capitalization and partial titles", async () => {
  await render({ units: [], lessons: [{ ...lessons[0], title: "القيمة العظمى MAXIMUM" }] });
  await search("عظمي maximum");
  expect(lessonLinks()).toEqual(["/lessons/intro"]);
});

it("allows collapsing a search result unit and reopens matches when the query changes", async () => {
  await render();
  await search("احصاء");
  const unit = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) =>
    button.textContent?.includes("الوحدة 2:"),
  )!;
  await act(async () => unit.click());
  expect(lessonLinks()).toEqual(["/lessons/advanced"]);
  await search("إحصاء");
  expect(lessonLinks()).toEqual(["/lessons/stats", "/lessons/advanced"]);
});
