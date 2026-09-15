import type { OfflineSyncResult } from "./offline-sync";

/** Foreground scheduler; the persistent queue survives suspension and restarts. */
export function createOfflineSyncScheduler(options: {
  sync(signal: AbortSignal): Promise<OfflineSyncResult>;
  canSync(): boolean;
  onError?(error: unknown): void;
  onResult?(result: OfflineSyncResult): void;
}) {
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  const schedule = (delay: number) => {
    if (stopped) return;
    clearTimeout(timer);
    timer = setTimeout(() => void run(), delay);
  };
  const run = async () => {
    if (stopped || running) return;
    clearTimeout(timer);
    if (!options.canSync()) return;
    running = true;
    controller = new AbortController();
    let delay = 15_000;
    try {
      const result = await options.sync(controller.signal);
      if (!stopped) options.onResult?.(result);
      if (result.claimed >= 100 || result.failed > 0) delay = 1_000;
    } catch (error) {
      if (!stopped) options.onError?.(error);
    } finally {
      running = false;
      controller = undefined;
      schedule(delay);
    }
  };
  return {
    wake: () => void run(),
    pause() {
      clearTimeout(timer);
      controller?.abort();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
    },
  };
}
