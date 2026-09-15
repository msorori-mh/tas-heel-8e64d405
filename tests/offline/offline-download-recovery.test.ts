import { afterEach, expect, it, vi } from "vitest";
import { fetchOfflineRead } from "../../src/lib/offline/offline-fetch";
import {
  OfflineDownloadError,
  offlineDownloadErrorMessage,
  offlineResponseError,
} from "../../src/lib/offline/offline-download-error";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("recovers a dropped connection with at most three attempts", async () => {
  vi.useFakeTimers();
  const request = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce(new Response("ok"));
  vi.stubGlobal("fetch", request);
  const pending = fetchOfflineRead("/api/offline-pack/manifest/test");
  await vi.runAllTimersAsync();
  expect(await (await pending).text()).toBe("ok");
  expect(request).toHaveBeenCalledTimes(2);
  request.mockReset().mockRejectedValue(new TypeError("Failed to fetch"));
  const failed = expect(fetchOfflineRead("/api/offline-pack/manifest/test")).rejects.toThrow(
    "Failed to fetch",
  );
  await vi.runAllTimersAsync();
  await failed;
  expect(request).toHaveBeenCalledTimes(3);
});
it("cancels network retry promptly without another request", async () => {
  vi.useFakeTimers();
  const controller = new AbortController();
  const request = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
  vi.stubGlobal("fetch", request);
  const failed = expect(
    fetchOfflineRead("/api/offline-pack/manifest/test", { signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  await vi.advanceTimersByTimeAsync(1);
  controller.abort();
  await failed;
  await vi.runAllTimersAsync();
  expect(request).toHaveBeenCalledTimes(1);
});
it.each([401, 403, 404, 409, 500])("does not retry non-transient HTTP %s", async (status) => {
  const request = vi.fn().mockResolvedValue(new Response("error", { status }));
  vi.stubGlobal("fetch", request);
  expect((await fetchOfflineRead("/api/offline-pack/artifact/test")).status).toBe(status);
  expect(request).toHaveBeenCalledTimes(1);
});
it("does not expose arbitrary server bodies or secrets in diagnostics", async () => {
  const error = await offlineResponseError(
    new Response(JSON.stringify({ error: "Bearer secret-token from server" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    }),
    "OFFLINE_MANIFEST_FETCH",
  );
  expect(error).toMatchObject({ message: "OFFLINE_MANIFEST_FETCH_500", serverCode: undefined });
  expect(offlineDownloadErrorMessage(error)).not.toContain("secret-token");
});
it.each([
  [new OfflineDownloadError("OFFLINE_MANIFEST_FETCH_500", "server_misconfigured"), "غير مهيأة"],
  [new Error("OFFLINE_ARTIFACT_DOWNLOAD_503"), "مشغول"],
  [new Error("OFFLINE_ARTIFACT_DOWNLOAD_401"), "جلسة الحساب"],
  [new Error("OFFLINE_ARTIFACT_HASH_MISMATCH"), "حدّث قائمة"],
  [new DOMException("quota", "QuotaExceededError"), "المساحة المتاحة"],
])("explains the actual failure and retained files", (error, expected) => {
  expect(offlineDownloadErrorMessage(error)).toContain(expected);
  expect(offlineDownloadErrorMessage(error)).toContain("الملفات المكتملة محفوظة");
});
it("shows a bounded server reason so manifest failures can be diagnosed", async () => {
  const failure = await offlineResponseError(
    Response.json({ error: "OFFLINE_ASSESSMENT_OPTION_BINDING_MISMATCH" }, { status: 500 }),
    "OFFLINE_MANIFEST_FETCH",
  );
  expect(offlineDownloadErrorMessage(failure)).toContain(
    "OFFLINE_ASSESSMENT_OPTION_BINDING_MISMATCH",
  );
});
it("never renders arbitrary server bodies as diagnostic text", () => {
  const failure = new OfflineDownloadError(
    "OFFLINE_MANIFEST_FETCH_500",
    "private response: email@example.test",
  );
  expect(offlineDownloadErrorMessage(failure)).not.toContain("email@example.test");
  expect(offlineDownloadErrorMessage(failure)).toContain("OFFLINE_MANIFEST_FETCH_500");
});
