// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  meta: vi.fn(),
  download: vi.fn(),
  entry: vi.fn(),
  resolve: vi.fn(),
  open: vi.fn(),
  remember: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));
vi.mock("@/lib/offline/lesson-file-client", () => ({
  fetchFileMeta: api.meta,
  downloadAndCache: api.download,
  resolveLessonFile: api.resolve,
  rememberLastPage: api.remember,
}));
vi.mock("@/lib/offline/pdf-cache", () => ({ getEntry: api.entry }));
vi.mock("@/lib/pdf/native-pdf-viewer", () => ({ openNativePdf: api.open }));
vi.mock("@capacitor/preferences", () => ({ Preferences: { get: api.get, set: api.set } }));
import { CachedFileUpdateNotice } from "../../src/components/lessons/CachedFileUpdateNotice";
import { DataSaverSetting } from "../../src/components/offline/DataSaverSetting";
import { NativePdfDelivery } from "../../src/components/lessons/NativePdfDelivery";
import { BrowserNativePdfDelivery } from "../../src/components/lessons/BrowserNativePdfDelivery";
import { setDataSaverEnabled } from "../../src/lib/offline/data-saver";
let host: HTMLDivElement, root: Root;
const updated = vi.fn();
const flush = async (ms = 0) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};
async function click(text: string) {
  const button = [...host.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(text),
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}
async function mountNotice() {
  await act(async () =>
    root.render(<CachedFileUpdateNotice resourceId="one" onUpdated={updated} />),
  );
}
beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  api.entry.mockResolvedValue({
    downloadedVersion: "v1",
    downloadedAt: Date.now() - 600_000,
    localPath: "private/one.bin",
  });
  api.meta.mockResolvedValue({ version: "v2", size: 12000 });
  api.download.mockResolvedValue({});
  api.resolve.mockResolvedValue({ blob: new Blob(["pdf"]), stale: false, lastOpenedPage: 5 });
  api.open.mockResolvedValue({ lastPage: 6 });
  api.remember.mockResolvedValue(undefined);
  api.get.mockResolvedValue({ value: null });
  api.set.mockResolvedValue(undefined);
  await setDataSaverEnabled(true);
  updated.mockReset();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  URL.createObjectURL = vi.fn(() => "blob:saved-copy");
  URL.revokeObjectURL = vi.fn();
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  await flush();
  vi.useRealTimers();
});
it("shows enabled data saver and persists a manual toggle", async () => {
  await act(async () => root.render(<DataSaverSetting />));
  const toggle = host.querySelector<HTMLButtonElement>('[role="switch"]')!;
  expect(toggle.getAttribute("aria-checked")).toBe("true");
  await act(async () => toggle.click());
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(api.set).toHaveBeenLastCalledWith(expect.objectContaining({ value: "off" }));
});
it("does not automatically check or download, but permits an explicit update with data saver enabled", async () => {
  await mountNotice();
  await flush(10_000);
  expect(api.meta).not.toHaveBeenCalled();
  expect(api.download).not.toHaveBeenCalled();
  await click("التحقق من التحديث");
  expect(host.textContent).toContain("توجد نسخة أحدث");
  expect(api.download).not.toHaveBeenCalled();
  await click("تنزيل التحديث");
  expect(api.download).toHaveBeenCalledTimes(1);
  expect(updated).toHaveBeenCalledTimes(1);
});
it("checks metadata after opening when opted out, but never silently downloads new bytes", async () => {
  await setDataSaverEnabled(false);
  await mountNotice();
  await flush(1500);
  expect(api.meta).toHaveBeenCalledTimes(1);
  expect(api.download).not.toHaveBeenCalled();
  expect(host.textContent).toContain("توجد نسخة أحدث");
});
it("does not re-check a just-downloaded file automatically", async () => {
  api.entry.mockResolvedValue({ downloadedVersion: "v1", downloadedAt: Date.now() });
  await setDataSaverEnabled(false);
  await mountNotice();
  await flush(2000);
  expect(api.meta).not.toHaveBeenCalled();
});
it("a late automatic timer cannot cancel a user-requested check", async () => {
  await setDataSaverEnabled(false);
  let signal!: AbortSignal;
  api.meta.mockImplementation((_id, _kind, current: AbortSignal) => {
    signal = current;
    return new Promise((_, reject) =>
      current.addEventListener("abort", () => reject(current.reason), { once: true }),
    );
  });
  await mountNotice();
  await click("التحقق من التحديث");
  await flush(2000);
  expect(signal.aborted).toBe(false);
  expect(api.meta).toHaveBeenCalledTimes(1);
});
it("bounds a hanging network check and keeps the saved-reader message usable", async () => {
  let signal!: AbortSignal;
  api.meta.mockImplementation((_id, _kind, current: AbortSignal) => {
    signal = current;
    return new Promise((_, reject) =>
      current.addEventListener("abort", () => reject(current.reason), { once: true }),
    );
  });
  await mountNotice();
  await click("التحقق من التحديث");
  await flush(5000);
  expect(signal.aborted).toBe(true);
  expect(host.textContent).toContain("متابعة قراءة النسخة المحفوظة");
  expect(host.querySelector("button")!.disabled).toBe(false);
});
it("a failed update never reloads the reader or claims the saved file is current", async () => {
  api.download.mockRejectedValue(new Error("offline halfway"));
  await mountNotice();
  await click("التحقق من التحديث");
  await click("تنزيل التحديث");
  expect(updated).not.toHaveBeenCalled();
  expect(host.textContent).toContain("متابعة قراءة النسخة المحفوظة");
  expect(host.textContent).not.toContain("النسخة المحفوظة محدثة");
});
it("turning data saver on cancels an automatic check", async () => {
  await setDataSaverEnabled(false);
  let signal!: AbortSignal;
  api.meta.mockImplementation((_id, _kind, current: AbortSignal) => {
    signal = current;
    return new Promise((_, reject) =>
      current.addEventListener("abort", () => reject(current.reason), { once: true }),
    );
  });
  await mountNotice();
  await flush(1500);
  await act(async () => setDataSaverEnabled(true));
  expect(signal.aborted).toBe(true);
  expect(api.download).not.toHaveBeenCalled();
});
it("aborts a requested update when leaving the reader", async () => {
  let signal!: AbortSignal;
  api.download.mockImplementation(({ signal: current }: { signal: AbortSignal }) => {
    signal = current;
    return new Promise((_, reject) =>
      current.addEventListener("abort", () => reject(current.reason), { once: true }),
    );
  });
  await mountNotice();
  await click("التحقق من التحديث");
  await click("تنزيل التحديث");
  await act(async () => root.render(null));
  expect(signal.aborted).toBe(true);
  expect(updated).not.toHaveBeenCalled();
});
it("opens the native saved copy without a version check and remembers the page", async () => {
  await act(async () => root.render(<NativePdfDelivery resourceId="one" title="كتاب الرياضيات" />));
  await click("فتح الملف داخل التطبيق");
  expect(api.open).toHaveBeenCalledWith(
    expect.objectContaining({ localPath: "private/one.bin", initialPage: 5 }),
  );
  expect(api.remember).toHaveBeenCalledWith("one", 6);
  expect(api.meta).not.toHaveBeenCalled();
});
it("prevents opening a native file while its explicitly requested replacement is downloading", async () => {
  api.download.mockImplementation(
    ({ signal }: { signal: AbortSignal }) =>
      new Promise((_, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
      ),
  );
  await act(async () => root.render(<NativePdfDelivery resourceId="one" />));
  await click("التحقق من التحديث");
  await click("تنزيل التحديث");
  await click("فتح الملف داخل التطبيق");
  expect(api.open).not.toHaveBeenCalled();
});
it("keeps a browser saved copy visible while checking and cancels work on leaving", async () => {
  let signal!: AbortSignal;
  api.meta.mockImplementation((_id, _kind, current: AbortSignal) => {
    signal = current;
    return new Promise((_, reject) =>
      current.addEventListener("abort", () => reject(current.reason), { once: true }),
    );
  });
  await act(async () => root.render(<BrowserNativePdfDelivery resourceId="one" />));
  expect(host.querySelector("object")?.getAttribute("data")).toBe("blob:saved-copy");
  await click("التحقق من التحديث");
  expect(host.querySelector("object")?.getAttribute("data")).toBe("blob:saved-copy");
  await act(async () => root.render(null));
  expect(signal.aborted).toBe(true);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:saved-copy");
});
