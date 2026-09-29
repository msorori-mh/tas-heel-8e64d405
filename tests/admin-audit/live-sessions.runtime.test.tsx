// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AdminProgram } from "../../apps/teacher-academy/src/types";
const api = vi.hoisted(() => ({
  programs: vi.fn(),
  sessions: vi.fn(),
  save: vi.fn(),
}));
vi.mock("../../apps/teacher-academy/src/lib/academy-api", () => ({
  adminListPrograms: api.programs,
  adminListLiveSessions: api.sessions,
  adminSaveLiveSession: api.save,
  adminListLessons: async () => [],
  loadProfileOptions: async () => ({ subjects: [] }),
  adminGetSettings: async () => ({
    default_program_minutes: 60,
    default_pass_percentage: 75,
    default_live_provider: "Zoom",
    default_live_instructions: "",
  }),
}));
vi.mock("../../apps/teacher-academy/src/AssessmentEditor", () => ({
  AssessmentEditor: ({ readOnly }: { readOnly: boolean }) => (
    <p>{readOnly ? "assessment locked" : "assessment editable"}</p>
  ),
}));
vi.mock("../../apps/teacher-academy/src/AdminReports", () => ({ AdminReports: () => null }));
vi.mock("../../apps/teacher-academy/src/AdminSettings", () => ({ AdminSettings: () => null }));
import { AdminHome } from "../../apps/teacher-academy/src/AdminHome";
const program: AdminProgram = {
  program_id: "p1",
  program_version_id: "v1",
  version_number: 1,
  title: "TEST_ONLY published program",
  summary: "summary",
  detailed_description: "details",
  objectives: ["objective"],
  prerequisites: [],
  instructions: ["instruction"],
  audience_type: "ALL_TEACHERS",
  subject_ids: [],
  subject_names: null,
  estimated_minutes: 60,
  status: "PUBLISHED",
  published_at: "2026-09-01T00:00:00Z",
  archived_at: null,
  is_current_published: true,
  lesson_count: 1,
  question_count: 1,
  structured_lesson_count: 1,
  lesson_minutes: 60,
  assessment_pass_percentage: 75,
  live_session_count: 0,
};
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.programs.mockResolvedValue([program]);
  api.sessions.mockResolvedValue([]);
  api.save.mockResolvedValue("session1");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text);
  expect(button, text).toBeTruthy();
  await act(async () => button!.click());
}
async function open(archived = false) {
  if (archived)
    api.programs.mockResolvedValue([{ ...program, archived_at: "2026-09-20T00:00:00Z" }]);
  await act(async () =>
    root.render(<AdminHome capabilities={new Set(["ACADEMY_CATALOG_MANAGE"])} />),
  );
  await click("البرامج");
  if (archived) await click("المؤرشفة");
  await click("معاينة المحتوى");
}
async function field(label: string, value: string) {
  const input = [...host.querySelectorAll("label")]
    .find((x) => x.textContent?.includes(label))!
    .querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
it("keeps published lessons and assessments immutable while allowing a live session", async () => {
  await open();
  expect(host.textContent).not.toContain("إضافة الدرس");
  await click("2. التقييم");
  expect(host.textContent).toContain("assessment locked");
  await click("3. المحاضرة");
  expect(host.textContent).toContain("جدولة محاضرة");
  await field("عنوان المحاضرة", "TEST_ONLY reminder check");
  await field("الموعد", "2027-01-10T15:00");
  await field("رابط الانضمام HTTPS", "https://example.org/test-only");
  await click("حفظ المحاضرة");
  expect(api.save).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      programVersionId: "v1",
      title: "TEST_ONLY reminder check",
      meetingUrl: "https://example.org/test-only",
    }),
  );
  expect(host.querySelector('[role="status"]')?.textContent).toBe("تمت جدولة المحاضرة بنجاح.");
});
it("does not offer session writes for archived programs", async () => {
  await open(true);
  await click("3. المحاضرة");
  expect(host.textContent).not.toContain("جدولة محاضرة");
  expect(host.querySelector(".live-session-admin form")).toBeNull();
  expect(api.save).not.toHaveBeenCalled();
});
it("shows session load failures without claiming there are no sessions", async () => {
  api.sessions.mockRejectedValue(new Error("تعذر تحميل المحاضرات"));
  await open();
  await click("3. المحاضرة");
  expect(host.textContent).toContain("تعذر تحميل المحاضرات");
  expect(host.textContent).not.toContain("لا توجد محاضرات مجدولة");
});
