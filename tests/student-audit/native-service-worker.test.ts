// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const native = vi.hoisted(() => vi.fn());
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: native } }));
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("PROD", true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("retires only the app worker in native Android and never registers a replacement", async () => {
  native.mockReturnValue(true);
  const unregister = vi.fn();
  const academyUnregister = vi.fn();
  const register = vi.fn();
  vi.stubGlobal("navigator", {
    serviceWorker: {
      register,
      getRegistrations: async () => [
        { active: { scriptURL: `${window.location.origin}/sw.js` }, unregister },
        {
          active: { scriptURL: `${window.location.origin}/academy/sw.js` },
          unregister: academyUnregister,
        },
      ],
    },
  });
  const { registerServiceWorker } = await import("@/lib/pwa/register-sw");
  registerServiceWorker();
  await vi.waitFor(() => expect(unregister).toHaveBeenCalledOnce());
  expect(register).not.toHaveBeenCalled();
  expect(academyUnregister).not.toHaveBeenCalled();
});
it("continues registering the PWA worker in the web browser", async () => {
  native.mockReturnValue(false);
  const register = vi.fn().mockResolvedValue({ addEventListener() {} });
  vi.stubGlobal("navigator", { serviceWorker: { register } });
  const { registerServiceWorker } = await import("@/lib/pwa/register-sw");
  registerServiceWorker();
  window.dispatchEvent(new Event("load"));
  await vi.waitFor(() => expect(register).toHaveBeenCalledWith("/sw.js"));
});
