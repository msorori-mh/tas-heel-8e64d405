/** Bound expensive work per server instance. This is not a distributed rate limit. */
export function createOfflineCapacityLimit(maximum: number, queueMaximum = 16, waitMs = 15_000) {
  let active = 0;
  const queue: Array<() => void> = [];
  const acquire = (signal?: AbortSignal): Promise<boolean> => {
    if (signal?.aborted) return Promise.resolve(false);
    if (active < maximum) {
      active += 1;
      return Promise.resolve(true);
    }
    if (queue.length >= queueMaximum) return Promise.resolve(false);
    return new Promise((resolve) => {
      const finish = (granted: boolean) => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
        const index = queue.indexOf(grant);
        if (index >= 0) queue.splice(index, 1);
        if (granted) active += 1;
        resolve(granted);
      };
      const grant = () => finish(true);
      const abort = () => finish(false);
      const timer = setTimeout(abort, waitMs);
      queue.push(grant);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
  };
  return async (work: () => Promise<Response>, signal?: AbortSignal): Promise<Response> => {
    if (!(await acquire(signal))) {
      return new Response(JSON.stringify({ error: "offline_capacity_busy" }), {
        status: signal?.aborted ? 499 : 503,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
          "retry-after": "3",
        },
      });
    }
    try {
      return await work();
    } finally {
      active -= 1;
      queue[0]?.();
    }
  };
}

export const withOfflineManifestCapacity = createOfflineCapacityLimit(2);
export const withOfflineArtifactCapacity = createOfflineCapacityLimit(8);
