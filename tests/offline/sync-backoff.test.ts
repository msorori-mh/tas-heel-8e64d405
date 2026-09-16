import { expect, it } from "vitest";
import { offlineRetryDelay, offlineReconnectDelay } from "../../src/lib/offline/sync-backoff";
it("spreads retries and reconnects across devices while bounding delays", () => {
  expect(offlineRetryDelay(1, () => 0)).toBe(500);
  expect(offlineRetryDelay(1, () => 0.999)).toBe(1000);
  expect(offlineRetryDelay(4, () => 0)).toBe(4000);
  expect(offlineRetryDelay(1000, () => 1)).toBe(21600000);
  const delays = Array.from({ length: 100 }, (_, i) => offlineReconnectDelay(() => i / 100));
  expect(new Set(delays).size).toBe(100);
  expect(Math.min(...delays)).toBeGreaterThanOrEqual(500);
  expect(Math.max(...delays)).toBeLessThan(5000);
});
