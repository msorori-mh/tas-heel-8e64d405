import { afterEach, describe, expect, it, vi } from "vitest";
import { createOfflineCapacityLimit } from "../../src/lib/offline/offline-capacity.server";
import { fetchOfflineRead, offlineRetryDelay } from "../../src/lib/offline/offline-fetch";
import {
  buildOfflineSubjectPack,
  type OfflinePackBuildInput,
} from "../../src/lib/offline/offline-pack-manifest";
import { fingerprintOfflineText } from "../../src/lib/offline/offline-text-metadata";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const date = "2026-09-01T00:00:00.000Z";
function input(body: string): OfflinePackBuildInput {
  return {
    subjectTitle: "TEST_ONLY",
    scope: { subjectId: id(1), gradeId: id(2), curriculumTrackId: id(3), semester: 1 },
    lessons: [
      {
        id: id(4),
        title: "درس",
        sortOrder: 1,
        updatedAt: date,
        managed: false,
        visible: true,
        readyCapabilities: {},
      },
    ],
    textSources: [
      {
        sourceId: id(5),
        sourceType: "official-book",
        lessonId: id(4),
        title: "الكتاب",
        body,
        updatedAt: date,
        sortOrder: 0,
        attestation: "lifecycle",
      },
    ],
    textbooks: [],
  };
}
describe("offline preparation capacity", () => {
  it("rejects excess work and frees the slot after both success and error", async () => {
    const limit = createOfflineCapacityLimit(1, 0);
    let release!: () => void;
    const active = limit(async () => {
      await new Promise<void>((r) => {
        release = r;
      });
      return new Response("ok");
    });
    await Promise.resolve();
    const rejected = await limit(async () => new Response("should not run"));
    expect(rejected.status).toBe(503);
    expect(rejected.headers.get("retry-after")).toBe("3");
    release();
    expect(await (await active).text()).toBe("ok");
    await expect(
      limit(async () => {
        throw new Error("failed");
      }),
    ).rejects.toThrow("failed");
    expect((await limit(async () => new Response("next"))).status).toBe(200);
  });
  it("queues a burst fairly, bounds waiting, and removes cancelled callers", async () => {
    vi.useFakeTimers();
    const limit = createOfflineCapacityLimit(1, 2, 1000);
    let release!: () => void;
    const order: number[] = [];
    const first = limit(async () => {
      await new Promise<void>((r) => {
        release = r;
      });
      return new Response("first");
    });
    await Promise.resolve();
    const c = new AbortController();
    const cancelled = limit(async () => {
      order.push(99);
      return new Response("never");
    }, c.signal);
    const second = limit(async () => {
      order.push(2);
      return new Response("second");
    });
    expect((await limit(async () => new Response("over queue"))).status).toBe(503);
    c.abort();
    expect((await cancelled).status).toBe(499);
    release();
    await first;
    await vi.advanceTimersByTimeAsync(50);
    await second;
    expect(order).toEqual([2]);
    let unlock!: () => void;
    const held = limit(async () => {
      await new Promise<void>((r) => {
        unlock = r;
      });
      return new Response("held");
    });
    await Promise.resolve();
    const timed = limit(async () => new Response("late"));
    await vi.advanceTimersByTimeAsync(1001);
    expect((await timed).status).toBe(503);
    unlock();
    await held;
    expect((await limit(async () => new Response("recovered"))).status).toBe(200);
  });
  it("cancels active work and admits a new request even if the old promise never settles", async () => {
    const limit = createOfflineCapacityLimit(1, 0);
    const parent = new AbortController();
    let workSignal!: AbortSignal;
    const abandoned = limit(async (signal) => {
      workSignal = signal;
      return new Promise<Response>(() => {});
    }, parent.signal);
    await Promise.resolve();
    parent.abort();
    expect((await abandoned).status).toBe(499);
    expect(workSignal.aborted).toBe(true);
    expect((await limit(async () => new Response("next"))).status).toBe(200);
  });

  it("bounds a stuck preparation and propagates its timeout to database reads", async () => {
    vi.useFakeTimers();
    const limit = createOfflineCapacityLimit(1, 0, 1000, 2000);
    let workSignal!: AbortSignal;
    const stuck = limit(async (signal) => {
      workSignal = signal;
      return new Promise<Response>(() => {});
    });
    await vi.advanceTimersByTimeAsync(2001);
    expect((await stuck).status).toBe(504);
    expect(workSignal.aborted).toBe(true);
    expect((await limit(async () => new Response("next"))).status).toBe(200);
  });

  it("reclaims orphaned tickets without their timers or finally running, without releasing a newer ticket", async () => {
    vi.useFakeTimers();
    const limit = createOfflineCapacityLimit(1, 0, 1000, 2000);
    let releaseOld!: (response: Response) => void;
    const old = limit(
      () =>
        new Promise<Response>((resolve) => {
          releaseOld = resolve;
        }),
    );
    await Promise.resolve();
    // A disconnected Worker can abandon its callbacks while the isolate survives.
    vi.setSystemTime(Date.now() + 2001);
    let releaseNew!: (response: Response) => void;
    const next = limit(
      () =>
        new Promise<Response>((resolve) => {
          releaseNew = resolve;
        }),
    );
    await Promise.resolve();
    releaseOld(new Response("late"));
    await old;
    expect((await limit(async () => new Response("must not run"))).status).toBe(503);
    releaseNew(new Response("next"));
    await next;
  });

  it("reclaims an orphaned queue ticket as well as the expired active ticket", async () => {
    vi.useFakeTimers();
    const limit = createOfflineCapacityLimit(1, 1, 1000, 2000);
    const parent = new AbortController();
    const held = limit(() => new Promise<Response>(() => {}), parent.signal);
    const queued = limit(async () => new Response("old queue"), parent.signal);
    await Promise.resolve();
    vi.setSystemTime(Date.now() + 2001);
    expect((await limit(async () => new Response("recovered"))).status).toBe(200);
    parent.abort();
    await held;
    await queued;
  });

  it("retries only transient reads and returns a final access denial immediately", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const mock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 503, headers: { "retry-after": "1" } }))
      .mockResolvedValueOnce(new Response("", { status: 403 }));
    vi.stubGlobal("fetch", mock);
    const result = fetchOfflineRead("/artifact");
    await vi.advanceTimersByTimeAsync(1001);
    expect((await result).status).toBe(403);
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("caps retries and rejects writes", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(new Response("", { status: 429, headers: { "retry-after": "0" } })),
        ),
    );
    const result = fetchOfflineRead("/artifact");
    await vi.runAllTimersAsync();
    expect((await result).status).toBe(429);
    expect(fetch).toHaveBeenCalledTimes(3);
    await expect(fetchOfflineRead("/artifact", { method: "POST" })).rejects.toThrow("READS_ONLY");
  });
  it("cancels a retry wait without starting another download", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(new Response("", { status: 503, headers: { "retry-after": "30" } })),
    );
    const c = new AbortController();
    const result = fetchOfflineRead("/artifact", { signal: c.signal });
    const rejection = expect(result).rejects.toThrow("Aborted");
    await vi.advanceTimersByTimeAsync(1);
    c.abort();
    await rejection;
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("bounds server retry dates", () => {
    expect(offlineRetryDelay("9999", 0)).toBe(30000);
    expect(offlineRetryDelay("-10", 0)).toBe(0);
    expect(offlineRetryDelay(null, 1)).toBe(2000);
  });
  it("produces exactly the same manifest without reading the HTML body", async () => {
    const original = input('<html dir="rtl"><img src="data:image/png;base64,QUJD">محتوى</html>');
    const expected = await buildOfflineSubjectPack(original);
    const prepared = structuredClone(original);
    prepared.textSources[0].preparedMetadata = await fingerprintOfflineText(
      prepared.textSources[0].body!,
    );
    delete prepared.textSources[0].body;
    expect(await buildOfflineSubjectPack(prepared)).toEqual(expected);
  });
  it.each(["data-answer=", '<img src="https://example.com/img">', "  "])(
    "preserves rejection/omission for %s",
    async (body) => {
      const original = input(body),
        prepared = input(body);
      prepared.textSources[0].preparedMetadata = await fingerprintOfflineText(body);
      delete prepared.textSources[0].body;
      const run = async (i: OfflinePackBuildInput) => {
        try {
          return await buildOfflineSubjectPack(i);
        } catch (e) {
          return (e as Error).message;
        }
      };
      expect(await run(prepared)).toEqual(await run(original));
    },
  );
  it("rejects missing, malformed, oversized and stale metadata", async () => {
    const source = input("test");
    source.textSources[0].preparedMetadata = {};
    delete source.textSources[0].body;
    await expect(buildOfflineSubjectPack(source)).rejects.toThrow("METADATA_INVALID");
    source.textSources[0].preparedMetadata = {
      ...(await fingerprintOfflineText("test")),
      byteSize: 6 * 1024 * 1024,
    };
    await expect(buildOfflineSubjectPack(source)).rejects.toThrow("HTML_TOO_LARGE");
    source.textSources[0].preparedMetadata = await fingerprintOfflineText("test");
    source.lessons[0].managed = true;
    source.lessons[0].readyCapabilities = {
      officialBookContent: { sha256: "0".repeat(64), readyAt: date },
    };
    await expect(buildOfflineSubjectPack(source)).rejects.toThrow("READY_HASH_MISMATCH");
  });
});
