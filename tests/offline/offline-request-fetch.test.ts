import { afterEach, expect, it, vi } from "vitest";
import { offlineRequestFetch } from "../../src/lib/offline/offline-request-fetch.server";
afterEach(() => vi.unstubAllGlobals());
it("cancels underlying reads with either the request deadline or the individual query", async () => {
  const request = vi.fn().mockResolvedValue(new Response("ok"));
  vi.stubGlobal("fetch", request);
  for (const cancelParent of [true, false]) {
    const parent = new AbortController(),
      query = new AbortController();
    await offlineRequestFetch(parent.signal)("https://test.invalid", { signal: query.signal });
    const passed = request.mock.lastCall![1].signal as AbortSignal;
    expect(passed.aborted).toBe(false);
    (cancelParent ? parent : query).abort();
    expect(passed.aborted).toBe(true);
  }
});
it("starts no more database reads after the request has been cancelled", () => {
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  const parent = new AbortController();
  parent.abort();
  expect(() => offlineRequestFetch(parent.signal)("https://test.invalid")).toThrow();
  expect(request).not.toHaveBeenCalled();
});
