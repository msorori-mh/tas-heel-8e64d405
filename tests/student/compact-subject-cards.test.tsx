// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SubjectGroupsGrid, type SubjectMeta } from "../../src/components/home/SubjectGroupsGrid";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...props
  }: {
    to: string;
    params: Record<string, string>;
    search?: { semester: number };
    children: ReactNode;
  }) => (
    <a
      {...props}
      href={
        to.replace(/\$\w+/, Object.values(params)[0]) +
        (search ? `?semester=${search.semester}` : "")
      }
    >
      {children}
    </a>
  ),
}));
vi.mock("@/components/textbooks/SubjectTextbooksSheet", () => ({
  SubjectTextbooksSheet: ({ open, subjectId }: { open: boolean; subjectId: string }) =>
    open ? <div role="dialog">{subjectId}</div> : null,
}));

let host: HTMLDivElement, root: Root;
const subject = {
  id: "test-arabic",
  name: "البلاغة والنقد",
  icon: null,
  color: null,
  sort_order: 0,
};
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function render(meta: SubjectMeta, downloads = {}) {
  await act(async () =>
    root.render(
      <SubjectGroupsGrid
        subjects={[subject]}
        semester={2}
        meta={{ [subject.id]: meta }}
        downloads={downloads}
      />,
    ),
  );
}

it("starts a new subject with an honest empty state and independent books action", async () => {
  await render({ lessons: 8, completed: 0 });
  expect(host.textContent).toContain("8 دروس متاحة");
  expect(host.textContent).toContain("لم تبدأ بعد");
  expect(host.textContent).not.toContain("جاهزة");
  expect(host.querySelector('[role="progressbar"]')).toBeNull();
  expect(host.querySelector('a[aria-label^="ابدأ التعلم"]')?.getAttribute("href")).toBe(
    "/subjects/test-arabic?semester=2",
  );
  const books = host.querySelector("button")!;
  expect(books.closest("a")).toBeNull();
  await act(async () => books.click());
  expect(host.querySelector('[role="dialog"]')?.textContent).toBe(subject.id);
});

it("resumes the actual incomplete lesson while the card header still opens its subject", async () => {
  await render({
    lessons: 8,
    completed: 3,
    started: true,
    resumeLesson: { id: "test-lesson", title: "التشبيه" },
  });
  expect(host.textContent).toContain("أكملت 3 من 8 دروس");
  expect(host.textContent).toContain("آخر درس: التشبيه");
  expect(host.querySelector('a[aria-label^="تابع درسك"]')?.getAttribute("href")).toBe(
    "/lessons/test-lesson",
  );
  expect(host.querySelector('a[aria-label^="فتح مادة"]')?.getAttribute("href")).toBe(
    "/subjects/test-arabic?semester=2",
  );
  expect(host.querySelector('[role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("38");
});

it("does not say unstarted or resume a stale lesson when progress is unavailable", async () => {
  await render({
    lessons: 23,
    completed: 0,
    progressKnown: false,
    resumeLesson: { id: "stale", title: "قديم" },
  });
  expect(host.textContent).toContain("23 درسًا متاحًا");
  expect(host.textContent).toContain("التقدم غير متاح");
  expect(host.textContent).not.toContain("لم تبدأ بعد");
  expect(host.querySelector('a[href^="/lessons/"]')).toBeNull();
});

it("keeps unpublished subjects non-navigable while still opening their books", async () => {
  await render({ lessons: 0, completed: 0 });
  expect(host.querySelector("a")).toBeNull();
  expect(host.textContent).toContain("المحتوى قيد التجهيز");
  await act(async () => host.querySelector("button")!.click());
  expect(host.querySelector('[role="dialog"]')).not.toBeNull();
});

it("offers review on completion and separates partial downloads from learning progress", async () => {
  await render({ lessons: 8, completed: 8 }, { [subject.id]: "partial" });
  expect(host.textContent).toContain("راجع المادة");
  expect(host.textContent).toContain("تنزيل جزئي");
  expect(host.textContent).not.toContain("محتوى محمّل");
  await render({ lessons: 8, completed: 0 }, { [subject.id]: "downloaded" });
  expect(host.textContent).toContain("محتوى محمّل");
  expect(host.textContent).toContain("لم تبدأ بعد");
});

it("opens grouped branches without changing their subject IDs", async () => {
  const branches = [subject, { ...subject, id: "test-reading", name: "القراءة والقصة" }].map(
    (s) => ({ ...s, group_code: "arabic", group_name: "اللغة العربية" }),
  );
  await act(async () =>
    root.render(
      <SubjectGroupsGrid
        subjects={branches}
        semester={2}
        meta={{ [subject.id]: { lessons: 8, completed: 0 } }}
      />,
    ),
  );
  await act(async () => host.querySelector("button")!.click());
  expect(host.querySelector('a[aria-label^="فتح مادة"]')?.getAttribute("href")).toBe(
    "/subjects/test-arabic?semester=2",
  );
  expect(host.textContent).toContain("عودة إلى المواد");
});

it("hides books only after confirming the subject has none", async () => {
  await render({ lessons: 8, completed: 0, textbookCount: 0 });
  expect(host.querySelector('button[aria-label^="كتب المنهج"]')).toBeNull();
  await render({ lessons: 8, completed: 0, textbookCount: 1 });
  expect(host.querySelector('button[aria-label^="كتب المنهج"]')).not.toBeNull();
});
