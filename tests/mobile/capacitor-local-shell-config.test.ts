import { afterEach, describe, expect, it, vi } from "vitest";

const originalEnabled = process.env.TAMKEEN_CAPACITOR_LIVE_RELOAD;
const originalUrl = process.env.TAMKEEN_CAPACITOR_LIVE_RELOAD_URL;

async function loadConfig() {
  vi.resetModules();
  return (await import("../../capacitor.config")).default;
}

afterEach(() => {
  if (originalEnabled === undefined) delete process.env.TAMKEEN_CAPACITOR_LIVE_RELOAD;
  else process.env.TAMKEEN_CAPACITOR_LIVE_RELOAD = originalEnabled;
  if (originalUrl === undefined) delete process.env.TAMKEEN_CAPACITOR_LIVE_RELOAD_URL;
  else process.env.TAMKEEN_CAPACITOR_LIVE_RELOAD_URL = originalUrl;
  vi.resetModules();
});

describe("Capacitor local release shell", () => {
  it("has no remote server URL by default", async () => {
    delete process.env.TAMKEEN_CAPACITOR_LIVE_RELOAD;
    delete process.env.TAMKEEN_CAPACITOR_LIVE_RELOAD_URL;
    const config = await loadConfig();
    expect(config.webDir).toBe("dist-mobile");
    expect(config.server?.url).toBeUndefined();
    expect(config.server?.hostname).toBe("studentamkeen.com");
    expect(config.server?.cleartext).toBe(false);
    expect(config.server?.errorPath).toBe("index.html");
  });

  it("requires explicit opt-in and rejects public or unsafe origins", async () => {
    delete process.env.TAMKEEN_CAPACITOR_LIVE_RELOAD;
    process.env.TAMKEEN_CAPACITOR_LIVE_RELOAD_URL = "https://192.168.1.20:5173";
    await expect(loadConfig()).rejects.toThrow("TAMKEEN_CAPACITOR_LIVE_RELOAD=1");

    process.env.TAMKEEN_CAPACITOR_LIVE_RELOAD = "1";
    for (const url of ["https://studentamkeen.com", "http://192.168.1.20:5173"]) {
      process.env.TAMKEEN_CAPACITOR_LIVE_RELOAD_URL = url;
      await expect(loadConfig()).rejects.toThrow("HTTPS private-network origin");
    }
  });

  it("accepts an explicit HTTPS private-network development origin", async () => {
    process.env.TAMKEEN_CAPACITOR_LIVE_RELOAD = "1";
    process.env.TAMKEEN_CAPACITOR_LIVE_RELOAD_URL = "https://192.168.1.20:5173/path";
    const config = await loadConfig();
    expect(config.server?.url).toBe("https://192.168.1.20:5173");
  });
});
