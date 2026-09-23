// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
let host: HTMLDivElement;
let root: Root;
function render(node: ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(node));
}
function cleanup() {
  act(() => root.unmount());
  host.remove();
}
const screen = {
  getByLabelText: (label: string) =>
    host.querySelector(`[aria-label="${label}"]`) as HTMLInputElement,
  getByText: (text: string) =>
    Array.from(host.querySelectorAll("*")).find((e) => e.textContent === text) as HTMLElement,
  queryByText: (text: string) =>
    Array.from(host.querySelectorAll("*")).find((e) => e.textContent === text) ?? null,
  getByRole: (role: string) => host.querySelector(`[role="${role}"]`) as HTMLElement,
};
const fireEvent = {
  change: (element: HTMLInputElement, { target }: { target: { value: string } }) =>
    act(() => {
      const prototype =
        element.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, target.value);
      element.dispatchEvent(
        new Event(element.tagName === "SELECT" ? "change" : "input", { bubbles: true }),
      );
    }),
};
import { afterEach, it, expect, vi } from "vitest";
const fixture = vi.hoisted(() => ({ error: false }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    params,
    to,
    ...rest
  }: {
    children: ReactNode;
    params?: { lessonId: string };
    to: string;
  }) => (
    <a href={params ? to.replace("$lessonId", params.lessonId) : to} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (o: { queryKey: string[] }) =>
    o.queryKey[0] === "content-report-catalog"
      ? {
          data: {
            subjects: [{ id: "s", name: "الكيمياء", grade_id: "g", curriculum_track_id: "t" }],
            grades: [{ id: "g", name: "الثالث الثانوي" }],
            tracks: [{ id: "t", track_name: "عدن" }],
            links: [],
          },
        }
      : o.queryKey[0] === "content-report-books"
        ? { data: [], isError: false, isPending: false }
        : o.queryKey[0] === "content-overview"
          ? {
              data: [
                {
                  id: "iron",
                  title: "الحديد",
                  subjectId: "s",
                  semester: 1,
                  updatedAt: "2026-09-15",
                  managed: true,
                  visible: false,
                  components: [
                    {
                      key: "officialBookContent",
                      label: "محتوى الكتاب",
                      applicability: "REQUIRED",
                      entered: true,
                      status: "READY",
                      ready: true,
                      published: false,
                    },
                    {
                      key: "lessonSummaryHtml",
                      label: "ملخص الدرس",
                      applicability: "REQUIRED",
                      entered: false,
                      status: "MISSING",
                      ready: false,
                      published: false,
                    },
                  ],
                },
              ],
              isError: false,
              isPending: false,
              isFetching: false,
              refetch: vi.fn(),
            }
          : {
            data: fixture.error
              ? undefined
              : [
                  {
                    id: "iron",
                    title: "الحديد",
                    semester: 1,
                    updatedAt: "2026-09-15",
                    cells: [
                      {
                        key: "officialBookContent",
                        label: "محتوى الكتاب",
                        status: "published",
                        required: true,
                        uploaded: true,
                        count: 1,
                      },
                      {
                        key: "lessonSummaryHtml",
                        label: "ملخص الدرس",
                        status: "missing",
                        required: true,
                        uploaded: false,
                        count: 0,
                      },
                    ],
                  },
                  {
                    id: "copper",
                    title: "النحاس",
                    semester: 2,
                    updatedAt: "2026-09-15",
                    cells: [],
                  },
                ],
            isError: fixture.error,
            isPending: false,
            isFetching: false,
            dataUpdatedAt: 1,
            refetch: vi.fn(),
          },
}));
import { ContentCompletionReport } from "./ContentCompletionReport";
afterEach(() => {
  cleanup();
  fixture.error = false;
});
it("shows the general content report before a subject is selected", () => {
  render(<ContentCompletionReport enabled />);
  expect(host.querySelector('[aria-label="التقرير العام للمحتوى"]')).toBeTruthy();
  expect(screen.getByText("التقرير العام للمحتوى")).toBeTruthy();
  expect(screen.getByText("التحليل التفصيلي العام")).toBeTruthy();
  expect(screen.queryByText("تصدير Excel")).toBeNull();
});

it("shows actionable missing work and scopes by semester and lesson name", () => {
  render(<ContentCompletionReport enabled />);
  fireEvent.change(screen.getByLabelText("المادة"), { target: { value: "s" } });
  expect(screen.getByText("الحديد")).toBeTruthy();
  expect(screen.getByText("النحاس")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("الفصل"), { target: { value: "1" } });
  expect(screen.queryByText("النحاس")).toBeNull();
  expect(screen.getByText("فتح مساحة المعالجة").getAttribute("href")).toBe(
    "/admin/lesson-content/iron",
  );
  fireEvent.change(screen.getByLabelText("بحث باسم الدرس"), { target: { value: "لا يوجد" } });
  expect(screen.getByText("لا توجد دروس مطابقة للفلاتر.")).toBeTruthy();
});
it("shows an independent upload report for each lesson component and can focus one component", () => {
  render(<ContentCompletionReport enabled />);
  fireEvent.change(screen.getByLabelText("المادة"), { target: { value: "s" } });

  expect(host.querySelector('[aria-label="تقرير المكونات السبعة"]')).toBeTruthy();
  expect(host.querySelector('[data-component-key="officialBookContent"]')).toBeTruthy();
  expect(host.querySelector('[data-component-key="lessonSummaryHtml"]')).toBeTruthy();

  const summaryCard = host.querySelector('[data-component-key="lessonSummaryHtml"]') as HTMLElement;
  expect(summaryCard.textContent).toContain("المتبقي للرفع");
  expect(summaryCard.textContent).toContain("1");

  fireEvent.change(screen.getByLabelText("المكون"), {
    target: { value: "lessonSummaryHtml" },
  });
  fireEvent.change(screen.getByLabelText("حالة المكون"), { target: { value: "missing" } });
  expect(screen.getByText("الحديد")).toBeTruthy();
  expect(screen.queryByText("النحاس")).toBeNull();
});
it("clears the selected scope when the grade changes", () => {
  render(<ContentCompletionReport enabled />);
  fireEvent.change(screen.getByLabelText("المادة"), { target: { value: "s" } });
  fireEvent.change(screen.getByLabelText("الصف"), { target: { value: "g" } });
  expect(screen.queryByText("تصدير Excel")).toBeNull();
});
it("never displays incomplete data as a missing-content report after an error", () => {
  fixture.error = true;
  render(<ContentCompletionReport enabled />);
  fireEvent.change(screen.getByLabelText("المادة"), { target: { value: "s" } });
  expect(screen.getByRole("alert").textContent).toContain("لم تُحسب البيانات الجزئية");
  expect(screen.queryByText("تصدير Excel")).toBeNull();
});
