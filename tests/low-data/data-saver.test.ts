// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";
const prefs = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn() }));
vi.mock("@capacitor/preferences", () => ({ Preferences: prefs }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  prefs.get.mockResolvedValue({ value: null });
  prefs.set.mockResolvedValue(undefined);
});
it("defaults to saving data and restores an explicit opt-out", async () => {
  prefs.get.mockResolvedValue({ value: "off" });
  const store = await import("../../src/lib/offline/data-saver");
  expect(store.dataSaverSnapshot()).toBe(true);
  expect(await store.getDataSaverEnabled()).toBe(false);
});
it("uses the safe default for a missing or unreadable preference", async () => {
  prefs.get.mockRejectedValue(new Error("storage unavailable"));
  const store = await import("../../src/lib/offline/data-saver");
  expect(await store.getDataSaverEnabled()).toBe(true);
});
it("a late initial read cannot reverse a newer user choice", async () => {
  let resolve!: (value: { value: string }) => void;
  prefs.get.mockReturnValue(
    new Promise((yes) => {
      resolve = yes;
    }),
  );
  const store = await import("../../src/lib/offline/data-saver");
  const reading = store.getDataSaverEnabled();
  await vi.waitFor(() => expect(prefs.get).toHaveBeenCalled());
  await store.setDataSaverEnabled(true);
  resolve({ value: "off" });
  expect(await reading).toBe(true);
});
it("a read begun after a user choice cannot restore the previous disk value", async () => {
  prefs.get.mockResolvedValue({ value: "off" });
  const store = await import("../../src/lib/offline/data-saver");
  const saving = store.setDataSaverEnabled(true);
  expect(await store.getDataSaverEnabled()).toBe(true);
  await saving;
});
it("publishes immediately and serializes rapid preference writes", async () => {
  let release!: () => void;
  prefs.set.mockImplementationOnce(
    () =>
      new Promise<void>((yes) => {
        release = yes;
      }),
  );
  const store = await import("../../src/lib/offline/data-saver");
  const listener = vi.fn();
  const off = store.subscribeDataSaver(listener);
  const first = store.setDataSaverEnabled(false);
  const second = store.setDataSaverEnabled(true);
  expect(store.dataSaverSnapshot()).toBe(true);
  expect(listener).toHaveBeenCalledTimes(2);
  await vi.waitFor(() => expect(prefs.set).toHaveBeenCalledTimes(1));
  release();
  await Promise.all([first, second]);
  expect(prefs.set.mock.calls.map(([arg]) => arg.value)).toEqual(["off", "on"]);
  off();
  await store.setDataSaverEnabled(false);
  expect(listener).toHaveBeenCalledTimes(2);
});
it("keeps the current choice if persistence fails and permits the next save", async () => {
  prefs.set.mockRejectedValueOnce(new Error("disk"));
  const store = await import("../../src/lib/offline/data-saver");
  await expect(store.setDataSaverEnabled(false)).rejects.toThrow("disk");
  expect(store.dataSaverSnapshot()).toBe(false);
  await store.setDataSaverEnabled(true);
  expect(store.dataSaverSnapshot()).toBe(true);
});
