// @vitest-environment jsdom
import { act, type ReactNode, type ComponentType } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCoverage,
  type AdminReviewLessonRow,
} from "../../src/lib/review/admin-review-coverage";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/admin-route-access", () => ({ useRequireAdminSection: () => ({ enabled: true }) }));
vi.mock("@/components/admin/AdminLayout", () => ({
  AdminLayout: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));
const response = vi.hoisted(() => ({ data: undefined as unknown }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: response.data, isLoading: false, error: null }),
}));
// Exercise the page's real controlled state and handlers using native selects.
// Radix portal/pointer behavior is outside this dependent-filter regression.
vi.mock("@/components/ui/select", () => ({
  Select: ({
    children,
    value,
    onValueChange,
  }: {
    children: ReactNode;
    value: string;
    onValueChange: (v: string) => void;
  }) => (
    <select value={value} onChange={(event) => onValueChange(event.target.value)}>
      {children}
    </select>
  ),
  SelectTrigger: () => null,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
}));
import { Route } from "../../src/routes/_authenticated/admin.learning-insights.quick-review";
const Page = Route.options.component as ComponentType;
const ALL = "__all__";
let host: HTMLDivElement;
let root: Root;

function row(
  lessonId: string,
  subjectId: string,
  subjectName: string,
  gradeId: string,
  trackIds: string[],
  ready = true,
): AdminReviewLessonRow {
  return {
    lessonId,
    lessonTitle: `درس ${lessonId}`,
    subjectId,
    subjectName,
    gradeId,
    gradeName: gradeId === "g12" ? "الثالث الثانوي" : "الثاني الثانوي",
    trackIds,
    trackNames: trackIds.map((id) => ({ sanaa: "صنعاء", aden: "عدن", other: "مسار آخر" })[id]!),
    unitId: null,
    unitTitle: null,
    deliveryMode: "standard",
    hasSummary: ready,
    readiness: ready ? "READY" : "NOT_READY",
    summary: ready ? "ملخص" : "",
    keyPoints: [],
    studyTip: null,
  };
}
const rows = [
  row("iron", "chem12-sanaa", "الكيمياء", "g12", ["sanaa"]),
  row("copper", "chem12-aden", "الكيمياء", "g12", ["aden"], false),
  row("cells", "bio12", "الأحياء", "g12", ["sanaa", "aden"]),
  ...Array.from({ length: 52 }, (_, i) => row(`old-${i}`, "chem11", "الكيمياء", "g11", ["other"])),
];
function select(index: number) {
  return host.querySelectorAll("select")[index];
}
function choose(index: number, value: string) {
  act(() => {
    select(index).value = value;
    select(index).dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function options(index: number) {
  return Array.from(select(index).options, (option) => option.value);
}
function text() {
  return host.textContent ?? "";
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  response.data = buildCoverage(rows);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Page />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("quick-review dependent filters", () => {
  it("shows only third-secondary subjects and tracks, then the selected track's subjects", () => {
    choose(0, "g12");
    expect(options(1)).toEqual([ALL, "sanaa", "aden"]);
    expect(options(2)).toEqual([ALL, "chem12-sanaa", "chem12-aden", "bio12"]);
    choose(1, "sanaa");
    expect(options(2)).toEqual([ALL, "chem12-sanaa", "bio12"]);
    choose(2, "chem12-sanaa");
    expect(text()).toContain("درس iron");
    expect(text()).not.toContain("درس copper");
    expect(text()).not.toContain("درس old-0");
    expect(text()).toContain("1 درس — صفحة 1 من 1");
  });

  it("clears the old track and subject when changing grade, including back to all grades", () => {
    choose(0, "g11");
    choose(1, "other");
    choose(2, "chem11");
    const next = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "التالي",
    )!;
    act(() => next.click());
    expect(text()).toContain("صفحة 2 من 2");
    choose(0, "g12");
    expect(select(1).value).toBe(ALL);
    expect(select(2).value).toBe(ALL);
    expect(text()).toContain("3 درس — صفحة 1 من 1");
    choose(1, "sanaa");
    choose(2, "chem12-sanaa");
    choose(0, ALL);
    expect(select(1).value).toBe(ALL);
    expect(select(2).value).toBe(ALL);
    expect(options(2)).toContain("chem11");
  });

  it("clears a prior material on track change and keeps shared subjects available", () => {
    choose(0, "g12");
    choose(1, "sanaa");
    choose(2, "chem12-sanaa");
    choose(1, "aden");
    expect(select(2).value).toBe(ALL);
    expect(options(2)).toEqual([ALL, "chem12-aden", "bio12"]);
    expect(text()).toContain("درس copper");
    expect(text()).toContain("درس cells");
    choose(2, "chem12-aden");
    choose(1, ALL);
    expect(select(2).value).toBe(ALL);
    expect(options(2)).toContain("chem12-sanaa");
  });

  it("does not hide subject choices when readiness produces zero matching lessons", () => {
    choose(0, "g12");
    choose(1, "sanaa");
    choose(2, "chem12-sanaa");
    choose(3, "NOT_READY");
    expect(text()).toContain("لا توجد دروس مطابقة");
    expect(options(2)).toEqual([ALL, "chem12-sanaa", "bio12"]);
    expect(select(2).value).toBe("chem12-sanaa");
    choose(3, "ALL");
    expect(text()).toContain("درس iron");
  });

  it("distinguishes same-name subjects by grade and track without merging their identities", () => {
    const chemistry = Array.from(select(2).options).filter((option) =>
      option.textContent?.startsWith("الكيمياء"),
    );
    expect(chemistry).toHaveLength(3);
    expect(new Set(chemistry.map((option) => option.textContent)).size).toBe(3);
    expect(chemistry.map((option) => option.textContent)).toContain(
      "الكيمياء — الثالث الثانوي — عدن",
    );
    choose(0, "g12");
    choose(1, "aden");
    expect(select(2).querySelector('option[value="chem12-aden"]')?.textContent).toBe("الكيمياء");
  });
});
