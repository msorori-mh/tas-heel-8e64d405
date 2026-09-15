// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ inspect: vi.fn(), manifest: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/offline/offline-pack-downloader", () => ({
  inspectOfflineSubjectPack: api.inspect,
  fetchOfflineSubjectPackManifest: api.manifest,
  downloadOfflineSubjectPack: api.download,
  deleteOfflineSubjectPack: vi.fn(),
}));
import { OfflineSubjectPackCard } from "../../src/components/offline/OfflineSubjectPackCard";
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  api.inspect.mockResolvedValue({
    record: null,
    presentArtifactIds: new Set(),
    presentBytes: 0,
    totalBytes: 100,
    ready: false,
  });
  api.manifest.mockResolvedValue({ artifacts: [{ byteSize: 100 }] });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function clickDownload() {
  const button = [...host.querySelectorAll("button")].find((x) =>
    x.textContent?.includes("تنزيل المادة"),
  )!;
  await act(async () => button.click());
}
it("keeps download failure visible after successful metadata refresh and clears unfinished progress", async () => {
  api.download.mockImplementation(async ({ onProgress }) => {
    onProgress({ loadedBytes: 3, totalBytes: 100, status: "downloading" });
    throw new Error("TEST_ONLY_DOWNLOAD_FAILURE");
  });
  await act(async () =>
    root.render(<OfflineSubjectPackCard subjectId="test-subject" subjectName="القراءة" />),
  );
  await clickDownload();
  expect(api.manifest).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("تعذّر إكمال التنزيل");
  expect(host.textContent).not.toContain("جارٍ التحقق من الملف الحالي");
  expect(host.textContent).not.toContain("3%");
  api.download.mockResolvedValue(undefined);
  await clickDownload();
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
it("preserves pause feedback through metadata refresh", async () => {
  api.download.mockRejectedValue(new Error("OFFLINE_DOWNLOAD_ABORTED"));
  await act(async () =>
    root.render(<OfflineSubjectPackCard subjectId="test-subject" subjectName="القراءة" />),
  );
  await clickDownload();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("توقف التنزيل");
});

it("reports deliberate pause when browser fetch rejects with AbortError", async () => {
  api.download.mockImplementation(
    ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
          once: true,
        });
      }),
  );
  await act(async () =>
    root.render(<OfflineSubjectPackCard subjectId="test-subject" subjectName="القراءة" />),
  );
  await clickDownload();
  const pause = [...host.querySelectorAll("button")].find((button) =>
    button.textContent?.includes("إيقاف"),
  )!;
  await act(async () => pause.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("توقف التنزيل");
  expect(host.textContent).not.toContain("تحقق من الاتصال");
});
