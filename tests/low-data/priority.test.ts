import { expect, it } from "vitest";
import {
  beginBackgroundTransfer,
  hasForegroundTransfers,
  withForegroundTransfer,
} from "../../src/lib/offline/download-priority";
it("holds priority until all concurrent opened-content requests settle", async () => {
  let finishA!: () => void, finishB!: () => void;
  const optional = beginBackgroundTransfer()!;
  const a = withForegroundTransfer(
    () =>
      new Promise<void>((yes) => {
        finishA = yes;
      }),
  );
  const b = withForegroundTransfer(
    () =>
      new Promise<void>((yes) => {
        finishB = yes;
      }),
  );
  expect(optional.signal.aborted).toBe(true);
  expect(beginBackgroundTransfer()).toBeNull();
  finishA();
  await a;
  expect(hasForegroundTransfers()).toBe(true);
  finishB();
  await b;
  expect(hasForegroundTransfers()).toBe(false);
  optional.release();
});
it("propagates leaving the lesson and removes the parent listener on release", () => {
  const parent = new AbortController();
  const released = beginBackgroundTransfer(parent.signal)!;
  released.release();
  const live = beginBackgroundTransfer(parent.signal)!;
  parent.abort();
  expect(live.signal.aborted).toBe(true);
  expect(released.signal.aborted).toBe(false);
  expect(beginBackgroundTransfer(parent.signal)).toBeNull();
  live.release();
});
it("releases foreground ownership even on a synchronous exception", async () => {
  await expect(
    withForegroundTransfer(() => {
      throw new Error("render request");
    }),
  ).rejects.toThrow();
  expect(hasForegroundTransfers()).toBe(false);
});
