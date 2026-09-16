// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ sync: vi.fn() }));
vi.mock("@/lib/offline/offline-sync", () => ({ syncOfflineOutboxForCurrentSession: api.sync }));
vi.mock("@/lib/offline/sync-backoff", () => ({ offlineReconnectDelay: () => 1000 }));
import { OfflineSyncBridge } from "../../src/components/offline/OfflineSyncBridge";
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it("coalesces reconnect signals and prevents overlapping drains", async () => {
  let finish!: () => void;
  api.sync.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  await act(async () => root.render(<OfflineSyncBridge />));
  for (let i = 0; i < 20; i++) window.dispatchEvent(new Event("online"));
  expect(api.sync).not.toHaveBeenCalled();
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(api.sync).toHaveBeenCalledTimes(1);
  window.dispatchEvent(new Event("online"));
  await act(async () => vi.advanceTimersByTimeAsync(10000));
  expect(api.sync).toHaveBeenCalledTimes(1);
  await act(async () => finish());
  window.dispatchEvent(new Event("online"));
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(api.sync).toHaveBeenCalledTimes(2);
  await act(async () => finish());
});
it("does not send queued work after the bridge unmounts", async () => {
  await act(async () => root.render(<OfflineSyncBridge />));
  await act(async () => root.render(null));
  window.dispatchEvent(new Event("online"));
  await act(async () => vi.advanceTimersByTimeAsync(5000));
  expect(api.sync).not.toHaveBeenCalled();
});
