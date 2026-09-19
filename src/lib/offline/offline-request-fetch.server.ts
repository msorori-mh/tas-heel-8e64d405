/** Keep every Supabase read (including auth and answer RPCs) in this request's lifetime. */
export function offlineRequestFetch(signal: AbortSignal): typeof fetch {
  return (input, init) => {
    signal.throwIfAborted();
    const inherited = init?.signal ?? (input instanceof Request ? input.signal : undefined);
    return fetch(input, {
      ...init,
      signal: inherited ? AbortSignal.any([signal, inherited]) : signal,
    });
  };
}
