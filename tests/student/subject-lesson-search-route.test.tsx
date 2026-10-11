// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  semester: 1,
  subjectId: "subject",
  online: true,
  options: new Map<string, { queryFn: () => Promise<unknown>; offline: () => Promise<unknown> }>(),
  index: { units: [], lessons: [] } as { units: unknown[]; lessons: unknown[] },
  from: vi.fn(),
  visibility: vi.fn(),
  saved: vi.fn(),
  subject: {
    id: "subject",
    name: "الرياضيات",
    grade_id: "grade",
    curriculum_track_id: null,
    icon: null,
  },
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useParams: () => ({ subjectId: api.subjectId }),
    useSearch: () => ({ semester: api.semester }),
  }),
  Link: ({
    to,
    params = {},
    children,
    ...props
  }: {
    to: string;
    params?: Record<string, string>;
    children: ReactNode;
  }) => (
    <a {...props} href={to.replace(/\$\w+/, Object.values(params)[0] ?? "")}>
      {children}
    </a>
  ),
}));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: false }) }));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    profile: { user_id: "owner", grade_uuid: "grade" },
    user: { id: "owner" },
    isContentStaff: false,
  }),
}));
vi.mock("@/hooks/use-connectivity", () => ({ useConnectivity: () => api.online }));
vi.mock("@/hooks/use-student-view", () => ({
  useStudentView: (options: { queryKey: string[] }) => {
    const key = options.queryKey[0];
    api.options.set(key, options as never);
    return {
      data: key === "subject-meta" ? api.subject : key === "subject-index" ? api.index : ["first"],
    };
  },
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: api.from } }));
vi.mock("@/lib/lessons/lesson-lifecycle", () => ({ fetchStudentLessonVisibility: api.visibility }));
vi.mock("@/lib/offline/student-shell-cache", () => ({ readSavedSubjects: api.saved }));
vi.mock("@/components/offline/OfflineSubjectPackCard", () => ({
  OfflineSubjectPackCard: () => null,
}));
vi.mock("@/components/exams/ExamTemplatesSection", () => ({ ExamTemplatesSection: () => null }));
import { Route } from "../../src/routes/_authenticated/subjects.$subjectId";
const Page = Route.options.component!;
const lesson = (id: string, semester: number | null = 1) => ({
  id,
  title: `الإحصاء ${id}`,
  duration: null,
  unit_id: null,
  sort_order: 0,
  semester,
});
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.semester = 1;
  api.subjectId = "subject";
  api.online = true;
  api.subject.grade_id = "grade";
  api.index = { units: [], lessons: [lesson("first"), lesson("second")] };
  api.options.clear();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(<Page />));
}
async function search(value: string) {
  await act(async () => {
    const input = host.querySelector("input")!;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("keeps subject progress and resume independent of the search and performs no extra requests", async () => {
  await render();
  await search("first");
  expect(host.querySelector<HTMLElement>('[role="progressbar"] > div')?.style.transform).toBe(
    "translateX(-50%)",
  );
  expect(host.textContent).toContain("1/2 · 50%");
  expect(host.querySelector("header a")?.getAttribute("href")).toBe("/lessons/second");
  expect(host.querySelector('[role="search"]')?.textContent).toContain("1 من 2");
  expect(api.from).not.toHaveBeenCalled();
  expect(api.visibility).not.toHaveBeenCalled();
});
it("only searches the selected semester and visible student lessons", async () => {
  await render();
  const eq = vi.fn();
  api.from.mockImplementation((table: string) => {
    const builder = {
      select: () => builder,
      eq: (...args: unknown[]) => {
        eq(...args);
        return builder;
      },
      order: () => builder,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          error: null,
          data:
            table === "units"
              ? []
              : [
                  lesson("first"),
                  lesson("draft"),
                  lesson("semester-two", 2),
                  lesson("shared", null),
                ],
        }).then(resolve),
    };
    return builder;
  });
  api.visibility.mockResolvedValue(new Map([["draft", false]]));
  api.index = (await api.options.get("subject-index")!.queryFn()) as typeof api.index;
  await render();
  await search("احصاء");
  expect(api.visibility).toHaveBeenCalledWith(["first", "draft", "shared"]);
  expect(eq.mock.calls).toEqual([
    ["subject_id", "subject"],
    ["subject_id", "subject"],
  ]);
  expect(host.querySelector('[role="status"]')?.textContent).toContain("2 من 2");
  expect(host.querySelector('a[href="/lessons/draft"]')).toBeNull();
  expect(host.querySelector('a[href="/lessons/semester-two"]')).toBeNull();
});
it("searches the semester-scoped saved index offline and resets when the semester changes", async () => {
  api.online = false;
  await render();
  api.saved.mockResolvedValue([{ ...api.subject, lessons: [lesson("saved")] }]);
  api.index = (await api.options.get("subject-index")!.offline()) as typeof api.index;
  await render();
  await search("saved");
  expect(api.saved).toHaveBeenCalledWith("owner", 1);
  expect(host.querySelector('a[href="/lessons/saved"]')).not.toBeNull();
  expect(api.from).not.toHaveBeenCalled();
  api.semester = 2;
  await render();
  expect(host.querySelector<HTMLInputElement>("input")!.value).toBe("");
});
it("does not expose search for a subject outside the student's grade", async () => {
  api.subject.grade_id = "other-grade";
  await render();
  expect(host.querySelector("input")).toBeNull();
  expect(host.textContent).toContain("هذه المادة غير متاحة");
});
