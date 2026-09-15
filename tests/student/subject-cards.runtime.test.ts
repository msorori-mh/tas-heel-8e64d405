// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";
import { BookOpen, FlaskConical, Compass } from "lucide-react";
import { getSubjectIcon } from "../../src/lib/subjects/subject-icon";

vi.mock("@/hooks/use-auth", () => import("../e2e/subject-cards/stubs/use-auth"));

it("uses curriculum identity for Quran and preserves unknown-subject custom icons", () => {
  expect(getSubjectIcon("القرآن الكريم", "flask")).toBe(BookOpen);
  expect(getSubjectIcon("القُرْآن الكَرِيم", "flask")).toBe(BookOpen);
  expect(getSubjectIcon("الكيمياء", "book")).toBe(FlaskConical);
  expect(getSubjectIcon("مادة اختيارية", "compass")).toBe(Compass);
});

it("executes both real semester routes, group navigation, books and progress", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  document.body.innerHTML = '<div id="root"></div>';
  window.history.replaceState(null, "", "/semesters/1");
  vi.stubGlobal("scrollTo", vi.fn());
  let entry!: typeof import("../e2e/subject-cards/main");
  await act(async () => {
    entry = await import("../e2e/subject-cards/main");
    await entry.fixtureRouter.load();
  });
  const text = () => document.body.textContent ?? "";
  const button = (label: string) => {
    const found = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (node) => node.getAttribute("aria-label") === label || node.textContent?.trim() === label,
    );
    expect(found, label).toBeDefined();
    return found!;
  };
  const click = async (label: string) => {
    await act(async () => button(label).click());
  };
  const tab = async (label: string) => {
    await act(async () => {
      button(label).dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    });
  };
  try {
    await vi.waitFor(() => expect(text()).toContain("اللغة الإنجليزية"));
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(2);
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
      "الفصل الأول",
    );
    expect(
      document
        .querySelector('[aria-label="التقدم في اللغة الإنجليزية"]')
        ?.getAttribute("aria-valuenow"),
    ).toBe("25");
    expect(
      document.querySelector('[aria-label="التقدم في الرياضيات"]')?.getAttribute("aria-valuenow"),
    ).toBe("8");
    await click("عرض الكل (9)");
    expect(button("عرض أقل").getAttribute("aria-expanded")).toBe("true");
    await click("كتب منهج الرياضيات: عرض أو تنزيل");
    expect(text()).toContain("اختر فرع المادة، ثم افتح كتب المنهج");
    expect(document.querySelectorAll("ul > li > .subject-card-accent")).toHaveLength(2);
    await click("كتب منهج الجبر: عرض أو تنزيل");
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
        "كتب المنهج — الجبر",
      ),
    );
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      "لا توجد كتب منهج متاحة لهذه المادة",
    );
    await click("Close");
    await tab("الفصل الثاني");
    await vi.waitFor(() => expect(window.location.pathname).toBe("/semesters/2"));
    expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
      "الفصل الثاني",
    );
    expect(
      document
        .querySelector('[aria-label="التقدم في اللغة الإنجليزية"]')
        ?.getAttribute("aria-valuenow"),
    ).toBe("75");
    expect(button("عرض الكل (9)").getAttribute("aria-expanded")).toBe("false");
    const physics = document.querySelector('[aria-label="الفيزياء: المحتوى قيد التجهيز"]');
    expect(physics).not.toBeNull();
    expect(physics?.tagName).toBe("DIV");
    await click("كتب منهج الفيزياء: عرض أو تنزيل");
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
        "كتب المنهج — الفيزياء",
      ),
    );
    await click("Close");
    await act(async () => {
      await entry.fixtureRouter.navigate({ to: "/semesters" });
    });
    await vi.waitFor(() =>
      expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(
        "الفصل الأول",
      ),
    );
    await tab("الفصل الثاني");
    expect(
      document
        .querySelector('[aria-label="التقدم في اللغة الإنجليزية"]')
        ?.getAttribute("aria-valuenow"),
    ).toBe("75");
  } finally {
    await act(async () => entry.fixtureRoot.unmount());
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  }
});
