/** Reachability is a transport hint only; it never grants server permissions. */
export function createServiceReachability(options: {
  url: string;
  publicKey: string;
  fetch: typeof fetch;
  physicalOnline: () => boolean;
  probeMs?: number;
  authMs?: number;
}) {
  const target = new URL(options.url).origin;
  const listeners = new Set<(online: boolean) => void>();
  let online = false;
  let epoch = 0;
  let pending: Promise<boolean> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  const emit = (value: boolean) => {
    if (value === online) return;
    online = value;
    listeners.forEach((listener) => listener(value));
  };
  const unavailable = () => {
    epoch++;
    emit(false);
  };
  async function bounded(input: RequestInfo | URL, init: RequestInit | undefined, ms: number) {
    const controller = new AbortController();
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    const cancel = () => controller.abort(signal?.reason);
    if (signal?.aborted) cancel();
    else signal?.addEventListener("abort", cancel, { once: true });
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        options.fetch(input, { ...init, signal: controller.signal }),
        new Promise<Response>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new TypeError("Service connection timed out"));
          }, ms);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", cancel);
    }
  }
  async function probe(): Promise<boolean> {
    if (stopped) return false;
    if (!options.physicalOnline()) {
      unavailable();
      return false;
    }
    if (pending) return pending;
    const generation = epoch;
    pending = (async () => {
      try {
        const response = await bounded(
          `${target}/auth/v1/settings`,
          {
            headers: { apikey: options.publicKey },
            credentials: "omit",
            cache: "no-store",
          },
          options.probeMs ?? 1500,
        );
        await response.body?.cancel();
        // A server refusal still proves reachability. Auth/RLS decide access.
        if (!stopped && generation === epoch) emit(true);
      } catch {
        if (!stopped && generation === epoch) unavailable();
      } finally {
        pending = undefined;
      }
      return online;
    })();
    return pending;
  }
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (
      init?.method ?? (input instanceof Request ? input.method : "GET")
    ).toUpperCase();
    const read =
      url.origin === target &&
      method === "GET" &&
      (url.pathname.startsWith("/rest/v1/") || url.pathname === "/auth/v1/user");
    // Do not replay or impose short timeouts on mutations, refreshes, or file downloads.
    if (!read) return options.fetch(input, init);
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (signal?.aborted) throw signal.reason;
    if (!online) throw new TypeError("Service unavailable; saved content may be used");
    try {
      return url.pathname === "/auth/v1/user"
        ? await bounded(input, init, options.authMs ?? 2000)
        : await options.fetch(input, init);
    } catch (error) {
      if (!signal?.aborted) unavailable();
      throw error;
    }
  };
  return {
    fetch: transport,
    isOnline: () => online,
    check: () => (online ? probe() : Promise.resolve(false)),
    probe,
    physicalChanged(connected: boolean) {
      if (connected) void probe();
      else unavailable();
    },
    subscribe(listener: (value: boolean) => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (timer) return;
      stopped = false;
      timer = setInterval(() => {
        if (!online) void probe();
      }, 15_000);
      void probe();
    },
    stop() {
      stopped = true;
      epoch++;
      clearInterval(timer);
      timer = undefined;
      emit(false);
    },
  };
}
