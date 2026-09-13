import { beforeEach, afterEach, expect, it, vi } from "vitest";
const cache = vi.hoisted(() => ({
  getEntry: vi.fn(),
  readFile: vi.fn(),
  saveFile: vi.fn(),
  touchEntry: vi.fn(),
  enforceCacheLimit: vi.fn(),
}));
const auth = vi.hoisted(() => ({ getSession: vi.fn() }));
const policy = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/lib/offline/pdf-cache", () => ({ ...cache, DEFAULT_CACHE_LIMIT_BYTES: 1000 }));
vi.mock("@/lib/offline/entitlement", () => ({ canOpenCachedResource: policy }));
import {
  resolveLessonFile,
  fetchFileMeta,
  downloadAndCache,
} from "../../src/lib/offline/lesson-file-client";
import {
  beginBackgroundTransfer,
  hasForegroundTransfers,
} from "../../src/lib/offline/download-priority";
const local = new Blob(["verified old PDF"]);
const fetcher = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetcher);
  cache.getEntry.mockResolvedValue({ downloadedVersion: "v1", lastOpenedPage: 7 });
  cache.readFile.mockResolvedValue(local);
  cache.touchEntry.mockResolvedValue(undefined);
  cache.saveFile.mockResolvedValue(undefined);
  cache.enforceCacheLimit.mockResolvedValue(0);
  policy.mockResolvedValue({ allowed: true });
  auth.getSession.mockResolvedValue({ data: { session: { access_token: "test-token" } } });
  fetcher.mockImplementation(() => new Promise(() => undefined));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("opens verified local bytes with zero network/auth requests even when the network never settles", async () => {
  const result = await resolveLessonFile({ resourceId: "one" });
  expect(result).toMatchObject({ blob: local, fromCache: true, version: "v1", lastOpenedPage: 7 });
  expect(policy).toHaveBeenCalledWith("one");
  expect(cache.readFile).toHaveBeenCalledWith("one");
  expect(fetcher).not.toHaveBeenCalled();
  expect(auth.getSession).not.toHaveBeenCalled();
});
it("does not wait for a slow last-read metadata write", async () => {
  cache.touchEntry.mockImplementation(() => new Promise(() => undefined));
  expect((await resolveLessonFile({ resourceId: "one" })).blob).toBe(local);
});
it("does not use a denied local copy when the authenticated server refuses access", async () => {
  policy.mockResolvedValue({ allowed: false });
  fetcher.mockResolvedValue(new Response(null, { status: 403 }));
  await expect(resolveLessonFile({ resourceId: "one" })).rejects.toThrow("403");
  expect(cache.readFile).not.toHaveBeenCalled();
  expect(cache.saveFile).not.toHaveBeenCalled();
});
it("does not return a corrupt/missing cached file when offline", async () => {
  cache.readFile.mockResolvedValue(null);
  fetcher.mockRejectedValue(new TypeError("offline"));
  await expect(resolveLessonFile({ resourceId: "one" })).rejects.toThrow("offline");
});
it("downloads a missing textbook through the authenticated textbook endpoint without a HEAD", async () => {
  cache.getEntry.mockResolvedValue(null);
  fetcher.mockResolvedValue(new Response("PDF bytes", { headers: { "x-file-version": "v2" } }));
  const result = await resolveLessonFile({ resourceId: "book 1", kind: "textbook" });
  expect(result.fromCache).toBe(false);
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    "/api/subject-textbook/book%201",
    expect.objectContaining({ method: "GET", headers: { Authorization: "Bearer test-token" } }),
  );
  expect(cache.saveFile).toHaveBeenCalledWith(
    expect.objectContaining({
      version: "v2",
      contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
    }),
  );
});
it("rejects a bad server hash before overwriting any saved bytes", async () => {
  fetcher.mockResolvedValue(
    new Response("broken", { headers: { "x-file-sha256": "0".repeat(64) } }),
  );
  await expect(downloadAndCache({ resourceId: "one" })).rejects.toThrow("hash_mismatch");
  expect(cache.saveFile).not.toHaveBeenCalled();
});
it("cancels a metadata check even when session retrieval hangs", async () => {
  auth.getSession.mockImplementation(() => new Promise(() => undefined));
  const controller = new AbortController();
  const check = fetchFileMeta("one", "lesson", controller.signal);
  controller.abort();
  await expect(check).rejects.toMatchObject({ name: "AbortError" });
  expect(fetcher).not.toHaveBeenCalled();
});
it("does not cache a transfer cancelled while receiving its body", async () => {
  const controller = new AbortController();
  fetcher.mockResolvedValue({
    ok: true,
    headers: new Headers(),
    body: null,
    blob: async () => {
      controller.abort();
      return local;
    },
  });
  await expect(
    downloadAndCache({ resourceId: "one", signal: controller.signal }),
  ).rejects.toMatchObject({ name: "AbortError" });
  expect(cache.saveFile).not.toHaveBeenCalled();
  expect(hasForegroundTransfers()).toBe(false);
});
it("a requested PDF cancels optional work and releases priority after a failure", async () => {
  const optional = beginBackgroundTransfer()!;
  fetcher.mockRejectedValue(new Error("offline"));
  await expect(downloadAndCache({ resourceId: "one" })).rejects.toThrow("offline");
  expect(optional.signal.aborted).toBe(true);
  expect(hasForegroundTransfers()).toBe(false);
  optional.release();
});
