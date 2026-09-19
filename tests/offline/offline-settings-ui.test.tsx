// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  prepare: vi.fn(),
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
  prepareStudentDownloads: api.prepare,
  downloadStudentSubjects: api.download,
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
  api.prepare.mockResolvedValue(plan);
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
it("opening Settings reads saved files only, then shows size before explicitly downloading", async () => {
  await mount();
  expect(api.read).toHaveBeenCalled();
  expect(api.prepare).not.toHaveBeenCalled();
  expect(api.download).not.toHaveBeenCalled();
  expect(host.textContent).toContain("توفير البيانات");
  expect(host.querySelector("a")).toBeNull();
  await click("عرض المحتوى");
  expect(host.textContent).toContain("الحجم الكلي");
  expect(host.textContent).toContain("الأحياء");
  expect(api.download).not.toHaveBeenCalled();
  await click("تحميل الكل");
  expect(api.download).toHaveBeenCalledWith(
    expect.objectContaining({ ownerId: "student-a", subjects: plan.subjects }),
  );
  expect(host.textContent).toContain("اكتمل تنزيل المحتوى المحدد");
});
it("prevents duplicate downloads and deletion during a download, supports stopping and retrying", async () => {
  api.read.mockResolvedValue([savedSubject(plan.subjects[0])]);
  api.download.mockImplementationOnce(
    ({ signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(new Error("abort")), { once: true }),
      ),
  );
  await mount();
  await click("عرض المحتوى");
  await click("تحميل الكل");
  expect(button("تحميل الكل").disabled).toBe(true);
  expect(button("حذف جميع").disabled).toBe(true);
  await click("تحميل الكل");
  expect(api.download).toHaveBeenCalledTimes(1);
  await click("إيقاف");
  expect(host.textContent).toContain("الملفات المكتملة محفوظة");
  expect(button("تحميل الكل").disabled).toBe(false);
  await click("تحميل الكل");
  expect(api.download).toHaveBeenCalledTimes(2);
});
it("a failed download keeps saved content and makes no false completion claim", async () => {
  api.read.mockResolvedValue([
    savedSubject(plan.subjects[0]),
    savedSubject(plan.subjects[1], false),
  ]);
  api.download.mockRejectedValue(new Error("network failure"));
  await mount();
  await click("عرض المحتوى");
  await click("تحميل الكل");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("الملفات المكتملة محفوظة");
  expect(host.textContent).toContain("متاح دون إنترنت");
  expect(host.textContent).toContain("التنزيل غير مكتمل");
  expect(host.textContent).not.toContain("اكتمل تنزيل المحتوى المحدد");
});
it("requires an in-app delete confirmation, scopes deletion to the account, and shows storage failure", async () => {
  api.read.mockResolvedValue([savedSubject(plan.subjects[0])]);
  await mount();
  await click("حذف جميع");
  expect(api.removeAll).not.toHaveBeenCalled();
  await click("إلغاء");
  expect(api.removeAll).not.toHaveBeenCalled();
  await click("حذف جميع");
  api.removeAll.mockRejectedValue(new Error("disk"));
  await click("تأكيد الحذف");
  expect(api.removeAll).toHaveBeenCalledWith(undefined, "student-a");
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
it("can download one subject without starting the rest", async () => {
  await mount();
  await click("عرض المحتوى");
  const target = host.querySelector<HTMLButtonElement>('[aria-label="تنزيل الرياضيات"]')!;
  await act(async () => target.click());
  expect(api.download.mock.calls[0][0].subjects).toEqual([plan.subjects[0]]);
});
it("a new account cancels the old job and cannot receive its late content list", async () => {
  let resolve!: (value: DownloadPlan) => void;
  let signal!: AbortSignal;
  api.prepare.mockImplementationOnce((_scope, currentSignal) => {
    signal = currentSignal;
    return new Promise((r) => {
      resolve = r;
    });
  });
  await mount();
  await click("عرض المحتوى");
  api.auth.mockReturnValue({
    user: { id: "student-b" },
    profile: { grade_uuid: scope.gradeId, curriculum_track_id: scope.trackId },
  });
  await mount();
  expect(signal.aborted).toBe(true);
  await act(async () => resolve(plan));
  expect(host.textContent).not.toContain("الرياضيات");
  expect(api.read).toHaveBeenLastCalledWith("student-b", expect.any(AbortSignal));
});
it("leaving Settings cancels metadata preparation", async () => {
  let signal!: AbortSignal;
  api.prepare.mockImplementationOnce((_scope, currentSignal) => {
    signal = currentSignal;
    return new Promise(() => {});
  });
  await mount();
  await click("عرض المحتوى");
  await act(async () => root.render(null));
  expect(signal.aborted).toBe(true);
});
it("shows an available update while keeping the saved version usable", async () => {
  const saved = savedSubject(plan.subjects[0]);
  saved.local.record!.manifestSha256 = "a".repeat(64);
  api.read.mockResolvedValue([saved]);
  await mount();
  await click("عرض المحتوى");
  expect(host.textContent).toContain("متاح دون إنترنت");
  expect(host.textContent).toContain("يتوفر تحديث");
});
it("does not claim the grade has no content when every manifest failed", async () => {
  api.prepare.mockResolvedValue({
    subjects: [],
    unavailable: [{ id: "one", name: "رياضيات", reason: "content_books_57014_lookup_failed" }],
  });
  await mount();
  await click("عرض المحتوى");
  expect(host.textContent).toContain("تعذّر تجهيز المواد");
  expect(host.textContent).toContain("content_books_57014_lookup_failed");
  expect(host.textContent).not.toContain("لا يوجد محتوى قابل للتنزيل");
});
