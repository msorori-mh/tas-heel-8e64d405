/** Per-instance admission only; this is not a distributed rate limit.
 * Shared state contains expiring primitive tickets, never another request's I/O,
 * timer or promise callback. Workers can abandon a disconnected request before
 * finally runs, so both active and waiting tickets must expire independently.
 */
export function createOfflineCapacityLimit(
  maximum: number,
  queueMaximum = 16,
  waitMs = 15_000,
  workMs = 120_000,
) {
  const active = new Map<symbol, number>();
  const waiting = new Map<symbol, number>();
  const prune = () => {
    const now = Date.now();
    for (const [id, expires] of active) if (expires <= now) active.delete(id);
    for (const [id, expires] of waiting) if (expires <= now) waiting.delete(id);
  };
  const pause = (ms: number, signal?: AbortSignal) =>
    new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        signal?.removeEventListener("abort", finish);
        resolve();
      };
      const timer = setTimeout(finish, ms);
      signal?.addEventListener("abort", finish, { once: true });
      if (signal?.aborted) finish();
    });
  const refusal = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        "retry-after": "3",
      },
    });
  return async (
    work: (signal: AbortSignal) => Promise<Response>,
    signal?: AbortSignal,
  ): Promise<Response> => {
    const ticket = Symbol();
    const waitUntil = Date.now() + waitMs;
    prune();
    if (signal?.aborted) return refusal(499, "offline_request_cancelled");
    if (active.size >= maximum || waiting.size > 0) {
      if (waiting.size >= queueMaximum) return refusal(503, "offline_capacity_busy");
      waiting.set(ticket, waitUntil);
      try {
        while (true) {
          prune();
          if (signal?.aborted) return refusal(499, "offline_request_cancelled");
          if (Date.now() >= waitUntil) return refusal(503, "offline_capacity_busy");
          if (active.size < maximum && waiting.keys().next().value === ticket) break;
          await pause(Math.min(50, waitUntil - Date.now()), signal);
        }
      } finally {
        waiting.delete(ticket);
      }
    }
    const workUntil = Date.now() + workMs;
    active.set(ticket, workUntil);
    const controller = new AbortController();
    let stop!: (response: Response) => void;
    const cancelled = new Promise<Response>((resolve) => {
      stop = resolve;
    });
    const abort = () => {
      controller.abort();
      stop(refusal(499, "offline_request_cancelled"));
    };
    const timer = setTimeout(() => {
      controller.abort();
      stop(refusal(504, "offline_preparation_timeout"));
    }, workMs);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    try {
      return await Promise.race([
        Promise.resolve().then(async () => {
          controller.signal.throwIfAborted();
          const response = await work(controller.signal);
          if (Date.now() >= workUntil) {
            controller.abort();
            return refusal(504, "offline_preparation_timeout");
          }
          return response;
        }),
        cancelled,
      ]);
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      // An expired ticket may already be gone. Never decrement another request.
      active.delete(ticket);
    }
  };
}

export const withOfflineManifestCapacity = createOfflineCapacityLimit(2);
export const withOfflineArtifactCapacity = createOfflineCapacityLimit(8);
