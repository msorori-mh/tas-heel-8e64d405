// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  catalog: vi.fn(),
  download: vi.fn(),
  read: vi.fn(),
  remove: vi.fn(),
  removeAll: vi.fn(),
  auth: vi.fn(),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: api.auth }));
vi.mock("@/components/offline/DataSaverSetting", () => ({
  DataSaverSetting: () => <p>توفير البيانات</p>,
}));
vi.mock("@/lib/offline/pdf-cache", () => ({ isNativeStorage: () => false }));
vi.mock("@/lib/offline/offline-pack-downloader", () => ({
  deleteAllOfflinePacks: api.removeAll,
  deleteOfflineSubjectPack: api.remove,
}));
vi.mock("@/lib/offline/offline-download-library", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listStudentDownloadSubjects: api.catalog,
  downloadSelectedStudentSubjects: api.download,
  readSavedStudentDownloads: api.read,
}));
import { OfflineContentSettings } from "../../src/components/offline/OfflineContentSettings";
import { prepared, savedSubject, scope } from "./settings-fixtures";
import type { DownloadPlan } from "../../src/lib/offline/offline-download-library";
let host: HTMLDivElement, root: Root, plan: DownloadPlan;
async function mount() {
  await act(async () => root.render(<OfflineContentSettings />));
}
function button(name: string) {
  return [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
    b.textContent?.includes(name),
  )!;
}
async function click(name: string) {
  const target = button(name);
  expect(target).toBeDefined();
  await act(async () => target.click());
}
beforeEach(async () => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  api.auth.mockReturnValue({
    user: { id: scope.ownerId },
    profile: { grade_uuid: scope.gradeId, curriculum_track_id: scope.trackId },
  });
  plan = {
    subjects: [await prepared(), await prepared("two", "اللغة العربية")],
    unavailable: [{ id: "unready", name: "الأحياء", reason: "لم يتوفر محتوى قابل للتنزيل بعد" }],
  };
  api.catalog.mockResolvedValue(
    plan.subjects.map((row) => ({
      id: row.id,
      name: row.name,
      semester: row.manifest.scope.semester,
    })),
  );
  api.read.mockResolvedValue([]);
  api.download.mockResolvedValue(undefined);
  api.remove.mockResolvedValue(undefined);
  api.removeAll.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function select(name: string) {
  const input = host.querySelector<HTMLInputElement>(`input[aria-label="تحديد ${name}"]`)!;
  expect(input).not.toBeNull();
  await act(async () => input.click());
}
it("loads a lightweight catalog, then downloads selected subjects directly without a size preview", async () => {
  await mount();
  expect(api.catalog).toHaveBeenCalled();
  expect(api.download).not.toHaveBeenCalled();
  expect(host.textContent).toContain("الفصل الأول");
  expect(host.textContent).toContain("الفصل الثاني");
  expect(host.textContent).not.toContain("عرض المحتوى وحجم التنزيل");
  expect(button("تنزيل المواد المحددة").disabled).toBe(true);
  await select("الرياضيات");
  await click("تنزيل المواد المحددة");
  expect(api.download).toHaveBeenCalledWith(
    expect.objectContaining({ scope, subjects: [expect.objectContaining({ id: "one" })] }),
  );
  expect(host.textContent).toContain("اكتمل تنزيل المواد المحددة");
});
it("shows indeterminate preparation immediately and real file progress after preparation", async () => {
  let report!: (value: unknown) => void;
  api.download.mockImplementation(({ onProgress }) => {
    report = onProgress;
    return new Promise(() => {});
  });
  await mount();
  await select("الرياضيات");
  await click("تنزيل المواد المحددة");
  expect(host.querySelector('[role="progressbar"]')?.hasAttribute("aria-valuenow")).toBe(false);
  await act(async () =>
    report({
      subjectId: "one",
      subjectName: "الرياضيات",
      subjectIndex: 1,
      subjectCount: 1,
      completedSubjects: 0,
      phase: "downloading",
      loadedBytes: 3,
      totalBytes: 3,
      verifiedFiles: 0,
      totalFiles: 1,
    }),
  );
  expect(host.textContent).toContain("99٪");
  expect(host.textContent).not.toContain("100٪");
});
it("prevents duplicate jobs, cancels explicitly and permits resume", async () => {
  api.download.mockImplementationOnce(
    ({ signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("abort"))),
      ),
  );
  await mount();
  await select("الرياضيات");
  await click("تنزيل المواد المحددة");
  expect(button("تنزيل المواد المحددة").disabled).toBe(true);
  await click("تنزيل المواد المحددة");
  expect(api.download).toHaveBeenCalledTimes(1);
  await click("إيقاف التنزيل");
  expect(host.textContent).toContain("الملفات المكتملة محفوظة");
  await click("تنزيل المواد المحددة");
  expect(api.download).toHaveBeenCalledTimes(2);
});
it("retains local content when the network catalog is unavailable", async () => {
  api.catalog.mockRejectedValue(new Error("offline"));
  api.read.mockResolvedValue([savedSubject(plan.subjects[0])]);
  await mount();
  expect(host.textContent).toContain("متاح دون إنترنت");
  expect(host.textContent).toContain("الرياضيات");
  expect(host.textContent).toContain("إعادة جلب المواد");
  expect(api.download).not.toHaveBeenCalled();
});
it("retains partial files and never claims completion on failure", async () => {
  api.read.mockResolvedValue([savedSubject(plan.subjects[0], false)]);
  api.download.mockRejectedValue(new Error("network"));
  await mount();
  await select("الرياضيات");
  await click("تنزيل المواد المحددة");
  expect(host.textContent).toContain("التنزيل غير مكتمل");
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  expect(host.textContent).not.toContain("اكتمل تنزيل المواد المحددة");
});
it("leaving Settings cancels both catalog reads and the active download", async () => {
  let downloadSignal!: AbortSignal;
  api.download.mockImplementation(({ signal }) => {
    downloadSignal = signal;
    return new Promise(() => {});
  });
  await mount();
  const catalogSignal = api.catalog.mock.calls[0][1];
  await select("الرياضيات");
  await click("تنزيل المواد المحددة");
  await act(async () => root.render(null));
  expect(catalogSignal.aborted).toBe(true);
  expect(downloadSignal.aborted).toBe(true);
});
it("late catalog data from an old account cannot populate the new account", async () => {
  let finish!: (rows: unknown[]) => void;
  api.catalog.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  await mount();
  const oldSignal = api.catalog.mock.calls[0][1];
  api.auth.mockReturnValue({
    user: { id: "student-b" },
    profile: { grade_uuid: scope.gradeId, curriculum_track_id: scope.trackId },
  });
  api.catalog.mockResolvedValue([]);
  await mount();
  await act(async () => finish([{ id: "one", name: "الرياضيات" }]));
  expect(oldSignal.aborted).toBe(true);
  expect(host.textContent).not.toContain("الرياضيات");
});
it("preserves explicit scoped deletion confirmation", async () => {
  api.read.mockResolvedValue([savedSubject(plan.subjects[0])]);
  await mount();
  await click("حذف جميع");
  expect(api.removeAll).not.toHaveBeenCalled();
  await click("إلغاء");
  expect(api.removeAll).not.toHaveBeenCalled();
  await click("حذف جميع");
  await click("تأكيد الحذف");
  expect(api.removeAll).toHaveBeenCalledWith(undefined, scope.ownerId);
});
it("select all remains optional and includes both semesters", async () => {
  await mount();
  const all = host.querySelector<HTMLInputElement>('[aria-label="تحديد كل المواد"]')!;
  expect(all.checked).toBe(false);
  await act(async () => all.click());
  await click("تنزيل المواد المحددة");
  expect(api.download.mock.calls[0][0].subjects.map((s: { id: string }) => s.id)).toEqual([
    "one",
    "two",
  ]);
});
