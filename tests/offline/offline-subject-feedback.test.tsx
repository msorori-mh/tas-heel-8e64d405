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
    ownerId: "TEST_ONLY_OWNER",
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
it("keeps download failure visible after local refresh without rebuilding metadata", async () => {
  api.download.mockImplementation(async ({ onProgress }) => {
    onProgress({ loadedBytes: 3, totalBytes: 100, status: "downloading" });
    throw new Error("TEST_ONLY_DOWNLOAD_FAILURE");
  });
  await act(async () =>
    root.render(<OfflineSubjectPackCard subjectId="test-subject" subjectName="القراءة" />),
  );
  await clickDownload();
  expect(api.manifest).toHaveBeenCalledTimes(1);
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

it("shows the manifest failure code instead of a generic message", async () => {
  api.manifest.mockRejectedValue(new Error("OFFLINE_MANIFEST_FETCH_500"));
  await act(async () =>
    root.render(<OfflineSubjectPackCard subjectId="test-subject" subjectName="الكيمياء" />),
  );
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("OFFLINE_MANIFEST_FETCH_500");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("على الخادم");
});

it("discloses unavailable questions while keeping the available pack downloadable", async () => {
  api.manifest.mockImplementation(async (_subject, reportAvailability) => {
    reportAvailability?.(8);
    return { artifacts: [{ byteSize: 100 }] };
  });
  await act(async () =>
    root.render(<OfflineSubjectPackCard subjectId="test-subject" subjectName="الكيمياء" />),
  );
  expect(host.querySelector('[role="status"]')?.textContent).toContain("8");
  expect(host.querySelector('[role="status"]')?.textContent).toContain("لن تُضمّن");
  expect(
    [...host.querySelectorAll("button")].find((x) => x.textContent?.includes("تنزيل المادة"))
      ?.disabled,
  ).toBe(false);
});

it("downloads the exact preview without another manifest and re-inspects only local files", async () => {
  const preview = { artifacts: [{ byteSize: 100 }] };
  api.manifest.mockResolvedValue(preview);
  api.download.mockResolvedValue(undefined);
  await act(async () =>
    root.render(<OfflineSubjectPackCard subjectId="test-subject" subjectName="القراءة" />),
  );
  await clickDownload();
  expect(api.download).toHaveBeenCalledWith(
    expect.objectContaining({
      manifest: preview,
      expectedOwnerId: "TEST_ONLY_OWNER",
      subjectId: "test-subject",
    }),
  );
  expect(api.manifest).toHaveBeenCalledTimes(1);
  expect(api.inspect).toHaveBeenCalledTimes(2);
});

it("aborts pending preparation on navigation and ignores late responses from the previous subject", async () => {
  let firstSignal!: AbortSignal;
  let finish!: (value: unknown) => void;
  api.manifest.mockImplementationOnce((_id, _report, options) => {
    firstSignal = options.signal;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  await act(async () =>
    root.render(<OfflineSubjectPackCard subjectId="first" subjectName="الأولى" />),
  );
  await act(async () =>
    root.render(<OfflineSubjectPackCard subjectId="second" subjectName="الثانية" />),
  );
  expect(firstSignal.aborted).toBe(true);
  await act(async () => finish({ artifacts: [{ byteSize: 9000000 }] }));
  await clickDownload();
  expect(api.download).toHaveBeenCalledWith(
    expect.objectContaining({ subjectId: "second", manifest: { artifacts: [{ byteSize: 100 }] } }),
  );
});

it("refreshes changed metadata after an integrity conflict", async () => {
  api.download.mockRejectedValue(new Error("OFFLINE_ARTIFACT_HASH_MISMATCH"));
  await act(async () =>
    root.render(<OfflineSubjectPackCard subjectId="test-subject" subjectName="القراءة" />),
  );
  await clickDownload();
  expect(api.manifest).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain(
    "OFFLINE_ARTIFACT_HASH_MISMATCH",
  );
});

it("does not show the old download's cancellation on a newly selected subject", async () => {
  api.download.mockImplementation(
    ({ signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
          once: true,
        });
      }),
  );
  await act(async () =>
    root.render(<OfflineSubjectPackCard subjectId="first" subjectName="الأولى" />),
  );
  await clickDownload();
  await act(async () =>
    root.render(<OfflineSubjectPackCard subjectId="second" subjectName="الثانية" />),
  );
  expect(host.querySelector('[role="alert"]')).toBeNull();
  expect(host.textContent).toContain("الثانية");
});
