// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
const native = vi.hoisted(() => ({ value: false }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.value } }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  native.value = false;
});
it("registers when the academy mounts after window.load, with scope covering both academy URLs", async () => {
  vi.resetModules();
  vi.stubGlobal("isSecureContext", true);
  vi.spyOn(document, "readyState", "get").mockReturnValue("complete");
  const registration = { waiting: null, addEventListener: vi.fn() };
  const register = vi.fn().mockResolvedValue(registration);
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register,
      getRegistrations: vi.fn().mockResolvedValue([]),
      addEventListener: vi.fn(),
      controller: null,
    },
  });
  const { initializeAcademyPwa } = await import("../../apps/teacher-academy/src/pwa/academy-pwa");
  initializeAcademyPwa();
  await Promise.resolve();
  expect(register).toHaveBeenCalledExactlyOnceWith("/academy-sw.js", { scope: "/academy" });
  initializeAcademyPwa();
  expect(register).toHaveBeenCalledOnce();
});
it("does not register an academy worker or prompt for PWA installation inside native Android", async () => {
  vi.resetModules();
  native.value = true;
  const register = vi.fn();
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: { register } });
  const { initializeAcademyPwa } = await import("../../apps/teacher-academy/src/pwa/academy-pwa");
  initializeAcademyPwa();
  expect(register).not.toHaveBeenCalled();
});
