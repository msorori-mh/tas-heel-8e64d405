const TRANSIENT = new Set([429, 502, 503, 504]);

export function offlineRetryDelay(value: string | null, attempt: number, now = Date.now()): number {
  const seconds = value == null ? NaN : Number(value);
  const specified = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value ?? "") - now;
  // Bound the wait and scatter devices after a service restart.
  return Math.min(
    30_000,
    Math.max(0, Number.isFinite(specified) ? specified : 1000 * 2 ** attempt),
  );
}

function wait(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Aborted", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}

/** GET/HEAD only. Never retry an access denial, stale hash, or a write. */
export async function fetchOfflineRead(input: string, init: RequestInit = {}): Promise<Response> {
  if (!["GET", "HEAD"].includes((init.method ?? "GET").toUpperCase())) {
    throw new Error("OFFLINE_RETRY_READS_ONLY");
  }
  for (let attempt = 0; ; attempt += 1) {
    const response = await fetch(input, init);
    if (!TRANSIENT.has(response.status) || attempt >= 2) return response;
    const delay = offlineRetryDelay(response.headers.get("retry-after"), attempt);
    await response.body?.cancel();
    await wait(delay + Math.floor(Math.random() * 400), init.signal);
  }
}
