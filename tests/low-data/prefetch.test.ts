import { beforeEach, afterEach, expect, it, vi } from "vitest";
const env = vi.hoisted(() => ({
  saver: true,
  listeners: new Set<() => void>(),
  network: vi.fn(),
  free: vi.fn(),
  download: vi.fn(),
  entry: vi.fn(),
  from: vi.fn(),
}));
vi.mock("@/lib/offline/data-saver", () => ({
  dataSaverSnapshot: () => env.saver,
  getDataSaverEnabled: async () => env.saver,
  subscribeDataSaver: (fn: () => void) => {
    env.listeners.add(fn);
    return () => env.listeners.delete(fn);
  },
}));
vi.mock("@/lib/offline/network", () => ({
  getNetworkState: env.network,
  getFreeStorageBytes: env.free,
}));
vi.mock("@/lib/offline/pdf-cache", () => ({ getEntry: env.entry, touchEntry: vi.fn() }));
vi.mock("@/lib/offline/lesson-file-client", () => ({
  downloadAndCache: env.download,
  fetchFileMeta: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: env.from } }));
import { prefetchNextLessons, scheduleLessonPrefetch } from "../../src/lib/offline/offline-pack";
import { withForegroundTransfer } from "../../src/lib/offline/download-priority";
let stop: (() => void) | undefined;
const params = { lessonIds: ["next-1", "next-2"] };
function setSaver(value: boolean) {
  env.saver = value;
  env.listeners.forEach((fn) => fn());
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  env.saver = true;
  env.listeners.clear();
  env.network.mockResolvedValue({ online: true, wifi: true });
  env.free.mockResolvedValue(500 * 1024 * 1024);
  env.entry.mockResolvedValue(null);
  env.download.mockResolvedValue({});
  env.from.mockImplementation(() => {
    const query = {
      select: () => query,
      in: () => query,
      abortSignal: () => query,
      then: (yes: (data: unknown) => unknown) =>
        Promise.resolve({
          data: params.lessonIds.map((lesson_id) => ({
            id: lesson_id + "-file",
            lesson_id,
            resource_type: "pdf",
            url: "a.pdf",
            is_primary: true,
          })),
          error: null,
        }).then(yes),
    };
    return query;
  });
});
afterEach(async () => {
  stop?.();
  stop = undefined;
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();
});
it("does zero automatic network work under data saver, including on Wi-Fi", async () => {
  expect(await prefetchNextLessons(params)).toBe(0);
  stop = scheduleLessonPrefetch(params);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(env.network).not.toHaveBeenCalled();
  expect(env.from).not.toHaveBeenCalled();
  expect(env.download).not.toHaveBeenCalled();
});
it.each([
  { online: false, wifi: false },
  { online: true, wifi: false },
])("does not prefetch on an unsuitable connection: %s", async (network) => {
  env.saver = false;
  env.network.mockResolvedValue(network);
  expect(await prefetchNextLessons(params)).toBe(0);
  expect(env.from).not.toHaveBeenCalled();
});
it("respects free space and skips files already saved", async () => {
  env.saver = false;
  env.free.mockResolvedValueOnce(100);
  expect(await prefetchNextLessons(params)).toBe(0);
  env.entry.mockImplementation(async (id: string) => (id.includes("next-1") ? {} : null));
  expect(await prefetchNextLessons(params)).toBe(1);
  expect(env.download).toHaveBeenCalledWith(
    expect.objectContaining({
      resourceId: "next-2-file",
      priority: "background",
      signal: expect.any(AbortSignal),
    }),
  );
});
it("waits for foreground completion and a quiet period, then runs only once", async () => {
  env.saver = false;
  let finish!: () => void;
  const opened = withForegroundTransfer(
    () =>
      new Promise<void>((yes) => {
        finish = yes;
      }),
  );
  stop = scheduleLessonPrefetch(params);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(env.download).not.toHaveBeenCalled();
  finish();
  await opened;
  await vi.advanceTimersByTimeAsync(2999);
  expect(env.download).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(env.download).toHaveBeenCalledTimes(2);
  await withForegroundTransfer(async () => undefined);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(env.download).toHaveBeenCalledTimes(2);
});
it("aborts a running prefetch when the student opens content, then resumes after idle", async () => {
  env.saver = false;
  let signal!: AbortSignal;
  env.download.mockImplementationOnce(({ signal: current }: { signal: AbortSignal }) => {
    signal = current;
    return new Promise((_, reject) =>
      current.addEventListener("abort", () => reject(current.reason), { once: true }),
    );
  });
  stop = scheduleLessonPrefetch(params);
  await vi.advanceTimersByTimeAsync(3000);
  expect(env.download).toHaveBeenCalledTimes(1);
  let finish!: () => void;
  const opened = withForegroundTransfer(
    () =>
      new Promise<void>((yes) => {
        finish = yes;
      }),
  );
  expect(signal.aborted).toBe(true);
  await vi.advanceTimersByTimeAsync(5000);
  expect(env.download).toHaveBeenCalledTimes(1);
  finish();
  await opened;
  await vi.advanceTimersByTimeAsync(3000);
  expect(env.download).toHaveBeenCalledTimes(3);
});
it.each(["saver", "leave"])(
  "cancels active automatic requests on %s without downloading the next file",
  async (action) => {
    env.saver = false;
    let signal!: AbortSignal;
    env.download.mockImplementation(({ signal: current }: { signal: AbortSignal }) => {
      signal = current;
      return new Promise((_, reject) =>
        current.addEventListener("abort", () => reject(current.reason), { once: true }),
      );
    });
    stop = scheduleLessonPrefetch(params);
    await vi.advanceTimersByTimeAsync(3000);
    if (action === "saver") setSaver(true);
    else stop();
    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(env.download).toHaveBeenCalledTimes(1);
  },
);
it("cancels scheduled work on leaving before the quiet period elapses", async () => {
  env.saver = false;
  stop = scheduleLessonPrefetch(params);
  await vi.advanceTimersByTimeAsync(1000);
  stop();
  await vi.advanceTimersByTimeAsync(5000);
  expect(env.from).not.toHaveBeenCalled();
});
