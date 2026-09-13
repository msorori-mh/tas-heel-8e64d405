import { afterEach, beforeEach, expect, it, vi } from "vitest";
let win: EventTarget,
  register: ReturnType<typeof vi.fn>,
  registration: EventTarget & { waiting?: unknown };
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("PROD", true);
  win = new EventTarget();
  registration = new EventTarget();
  register = vi.fn().mockResolvedValue(registration);
  vi.stubGlobal("window", win);
  vi.stubGlobal("document", { readyState: "complete" });
  vi.stubGlobal("navigator", { serviceWorker: { register, controller: null } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("registers when hydration occurs after window.load and deduplicates route remounts", async () => {
  const { registerServiceWorker } = await import("../../src/lib/pwa/register-sw");
  registerServiceWorker();
  registerServiceWorker();
  win.dispatchEvent(new Event("load"));
  expect(register).toHaveBeenCalledExactlyOnceWith("/sw.js");
});
it("waits for load when called early and registers once", async () => {
  vi.stubGlobal("document", { readyState: "loading" });
  const { registerServiceWorker } = await import("../../src/lib/pwa/register-sw");
  registerServiceWorker();
  registerServiceWorker();
  expect(register).not.toHaveBeenCalled();
  win.dispatchEvent(new Event("load"));
  win.dispatchEvent(new Event("load"));
  expect(register).toHaveBeenCalledTimes(1);
});
it("does not register in development or when unsupported", async () => {
  const { registerServiceWorker } = await import("../../src/lib/pwa/register-sw");
  vi.stubEnv("PROD", false);
  registerServiceWorker();
  expect(register).not.toHaveBeenCalled();
  vi.stubEnv("PROD", true);
  vi.stubGlobal("navigator", {});
  registerServiceWorker();
  expect(register).not.toHaveBeenCalled();
});
it("can retry registration after a storage/network failure", async () => {
  register.mockRejectedValueOnce(new Error("offline"));
  const { registerServiceWorker } = await import("../../src/lib/pwa/register-sw");
  registerServiceWorker();
  for (let i = 0; i < 5; i++) await Promise.resolve();
  registerServiceWorker();
  expect(register).toHaveBeenCalledTimes(2);
});
