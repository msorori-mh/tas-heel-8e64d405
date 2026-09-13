/** Coordinate optional prefetch with the content the student opened. */
let foreground = 0;
const background = new Set<AbortController>();
const listeners = new Set<() => void>();
export const hasForegroundTransfers = () => foreground > 0;
export function subscribeDownloadPriority(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
function notify() {
  listeners.forEach((listener) => listener());
}

export async function withForegroundTransfer<T>(work: () => PromiseLike<T>): Promise<T> {
  foreground += 1;
  background.forEach((controller) => controller.abort());
  notify();
  try {
    return await work();
  } finally {
    foreground -= 1;
    notify();
  }
}

export function beginBackgroundTransfer(parent?: AbortSignal): {
  signal: AbortSignal;
  release: () => void;
} | null {
  if (hasForegroundTransfers() || parent?.aborted) return null;
  const controller = new AbortController();
  const abort = () => controller.abort();
  parent?.addEventListener("abort", abort, { once: true });
  background.add(controller);
  return {
    signal: controller.signal,
    release: () => {
      parent?.removeEventListener("abort", abort);
      background.delete(controller);
    },
  };
}
