// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  loadTeacherProfile: vi.fn(),
  loadCapabilities: vi.fn(),
  loadVisiblePrograms: vi.fn(),
  listMyLearning: vi.fn(),
  listMyCertificates: vi.fn(),
  loadProfileOptions: vi.fn(),
  saveTeacherProfile: vi.fn(),
  selfEnroll: vi.fn(),
  getLearningLessons: vi.fn(),
  completeLearningLesson: vi.fn(),
  getAssessment: vi.fn(),
  submitAssessment: vi.fn(),
  verifyCertificate: vi.fn(),
  listProgramLiveSessions: vi.fn(),
  clear: vi.fn(),
}));
vi.mock("../../apps/teacher-academy/src/lib/academy-api", () => ({
  ...api,
  academySchoolDirectoryApi: { search: vi.fn().mockResolvedValue([]) },
}));
vi.mock("../../apps/teacher-academy/src/lib/supabase", () => ({
  academyFeatureEnabled: true,
  academyBackendConfigured: true,
  requireAcademyBackend() {},
  academySupabase: { auth: api },
}));
vi.mock("../../apps/teacher-academy/src/pwa/AcademyPwaControls", () => ({
  AcademyPwaControls: () => null,
}));
vi.mock("../../apps/teacher-academy/src/AdminHome", () => ({ AdminHome: () => null }));
vi.mock("@/lib/auth/explicit-sign-out", () => ({ clearSignedOutPresentation: api.clear }));
vi.mock("@/lib/auth/workspace", () => ({ rememberWorkspace: vi.fn() }));
import { App } from "../../apps/teacher-academy/src/App";
const user = {
  id: "teacher-a",
  email: "teacher@example.test",
  app_metadata: { provider: "google" },
};
const profile = {
  user_id: user.id,
  full_name: "معلمة تجريبية",
  primary_subject_id: "math",
  governorate_id: "gov",
  school_name: "مدرسة اختبار",
  school_id: "school",
  school_district: "",
  school_locality: "",
  phone: "777123456",
  status: "ACTIVE",
};
const program = {
  enrollment_id: "enrollment-a",
  program_version_id: "program-a",
  title: "برنامج تجريبي",
  summary: "شرح البرنامج",
  detailed_description: "شرح تفصيلي",
  objectives: [],
  prerequisites: [],
  instructions: [],
  pass_percentage: 75,
  estimated_minutes: 45,
  lesson_count: 1,
  enrolled: false,
  status: "ACTIVE",
  total_lessons: 1,
  completed_lessons: 1,
};
const lesson = {
  lesson_id: "lesson-a",
  title: "درس تجريبي",
  completed: true,
  sections: [],
  duration_minutes: 10,
};
let root: Root, host: HTMLDivElement;
const text = () => host.textContent ?? "";
function button(label: string) {
  const found = [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === label);
  if (!found) throw new Error(`Button missing: ${label}`);
  return found;
}
async function click(label: string) {
  await act(async () => button(label).click());
}
async function render(portal: "teacher" | "verify" = "teacher") {
  await act(async () => root.render(<App portal={portal} />));
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.getSession.mockResolvedValue({ data: { session: { user } } });
  api.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe() {} } } });
  api.loadTeacherProfile.mockResolvedValue(profile);
  api.loadCapabilities.mockResolvedValue(new Set());
  api.loadVisiblePrograms.mockResolvedValue([program]);
  api.listMyLearning.mockResolvedValue([program]);
  api.listMyCertificates.mockResolvedValue([]);
  api.listProgramLiveSessions.mockResolvedValue([]);
  api.getLearningLessons.mockResolvedValue([lesson]);
  api.getAssessment.mockResolvedValue([]);
  api.loadProfileOptions.mockResolvedValue({
    subjects: [{ id: "math", name_ar: "رياضيات" }],
    governorates: [{ id: "gov", name: "صنعاء" }],
  });
  api.signOut.mockResolvedValue({ error: null });
  api.clear.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
it("opens the enrolled program and confirms enrollment", async () => {
  await render();
  await click("البرامج");
  await click("ابدأ التدريب");
  expect(api.selfEnroll).toHaveBeenCalledWith("program-a");
  expect(api.getLearningLessons).toHaveBeenCalledWith("program-a");
  expect(text()).toContain("تم الالتحاق ببرنامج برنامج تجريبي بنجاح");
  expect(text()).toContain("درس تجريبي");
});
it("reports profile save immediately, blocks repeats and opens programs after success", async () => {
  const save = deferred<typeof profile>();
  api.saveTeacherProfile.mockReturnValue(save.promise);
  await render();
  await click("ملفي المهني");
  await click("حفظ والانتقال إلى البرامج");
  expect(button("جارٍ حفظ الملف المهني…").disabled).toBe(true);
  expect(api.saveTeacherProfile).toHaveBeenCalledOnce();
  await act(async () => save.resolve(profile));
  expect(text()).toContain("تم حفظ ملفك المهني بنجاح");
  expect(text()).toContain("البرامج المناسبة لتخصصك");
});
it("uses a completed dashboard and never reopens an already passed assessment", async () => {
  api.listMyLearning.mockResolvedValue([{ ...program, status: "COMPLETED" }]);
  await render();
  expect(text()).toContain("أكملت برامجك التدريبية");
  expect(text()).not.toContain("اختر أول برنامج تدريبي");
  await click("مساري");
  await click("متابعة التعلم");
  expect(text()).toContain("اجتزت التقييم");
  expect(api.getAssessment).not.toHaveBeenCalled();
  expect(
    [...host.querySelectorAll("button")].some((b) => b.textContent?.includes("إرسال التقييم")),
  ).toBe(false);
});
it("shows assessment load errors and provides a working retry", async () => {
  api.getAssessment.mockRejectedValueOnce(new Error("PROGRAM_NOT_VISIBLE"));
  await render();
  await click("مساري");
  await click("متابعة التعلم");
  expect(text()).toContain("هذا البرنامج غير متاح");
  expect(text()).not.toContain("PROGRAM_NOT_VISIBLE");
  await click("إعادة تحميل التقييم");
  expect(api.getAssessment).toHaveBeenCalledTimes(2);
});
it("hardware back first returns to home and then lets the native handler minimize", async () => {
  await render();
  await click("ملفي المهني");
  const first = new Event("tamkeen:academy-back", { cancelable: true });
  await act(async () => {
    window.dispatchEvent(first);
  });
  expect(first.defaultPrevented).toBe(true);
  const second = new Event("tamkeen:academy-back", { cancelable: true });
  await act(async () => {
    window.dispatchEvent(second);
  });
  expect(second.defaultPrevented).toBe(false);
});
it("exposes sign-out in both mobile header and profile, clearing student display data first", async () => {
  await render();
  await click("ملفي المهني");
  expect(host.querySelector("header button")?.textContent).toContain("تسجيل الخروج");
  expect(host.querySelector("main")?.textContent).toContain("تسجيل الخروج");
  await click("تسجيل الخروج");
  expect(api.clear).toHaveBeenCalledOnce();
  expect(api.signOut).toHaveBeenCalledOnce();
  expect(api.clear.mock.invocationCallOrder[0]).toBeLessThan(
    api.signOut.mock.invocationCallOrder[0],
  );
});
it("editing a verification code clears old results and discards late responses", async () => {
  const response = deferred<unknown>();
  api.verifyCertificate.mockReturnValue(response.promise);
  window.history.replaceState(null, "", "/academy/verify?code=OLD");
  await render("verify");
  const input = host.querySelector("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "NEW");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () =>
    response.resolve({
      valid: true,
      teacher_name: "Old teacher",
      program_title: "Old",
      issued_at: "2026-09-29",
      certificate_code: "OLD",
    }),
  );
  expect(text()).not.toContain("شهادة صحيحة وسارية");
  expect(text()).not.toContain("Old teacher");
});
