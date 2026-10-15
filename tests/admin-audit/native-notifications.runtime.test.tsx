// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  native: vi.fn(),
  available: vi.fn(),
  listen: vi.fn(),
  remove: vi.fn(),
  diagnostic: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: api.native, isPluginAvailable: api.available },
}));
vi.mock("@capacitor/local-notifications", () => ({
  LocalNotifications: { addListener: api.listen },
}));
vi.mock("@/lib/diagnostics/telemetry", () => ({ captureDiagnosticSync: api.diagnostic }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => api.navigate }));
import { NativeNotificationHandler } from "../../src/components/mobile/NativeNotificationHandler";
import { scheduleLiveSessionReminders } from "../../src/lib/academy/live-session-reminders";
import type { LiveSession } from "../../apps/teacher-academy/src/types";
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  api.native.mockReturnValue(true);
  api.available.mockReturnValue(true);
  api.listen.mockResolvedValue({ remove: api.remove });
  host = document.createElement("div");
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});
async function render() {
  await act(async () => root.render(<NativeNotificationHandler />));
  await act(async () => {
    await vi.dynamicImportSettled();
  });
}
it("does not call a missing plugin in an older Android binary", async () => {
  api.available.mockReturnValue(false);
  await render();
  expect(api.listen).not.toHaveBeenCalled();
  expect(api.diagnostic).not.toHaveBeenCalled();
});
it("turns listener initialization rejection into a diagnostic warning", async () => {
  api.listen.mockRejectedValue(new Error("TEST_ONLY plugin rejection"));
  await render();
  expect(api.diagnostic).toHaveBeenCalledWith(
    expect.objectContaining({
      severity: "warning",
      action: "initialize_local_notification_listener",
    }),
  );
});
it("accepts only the academy destination and removes the listener", async () => {
  await render();
  const callback = api.listen.mock.calls[0][1];
  callback({ notification: { extra: { destination: "https://example.invalid" } } });
  expect(api.navigate).not.toHaveBeenCalled();
  callback({ notification: { extra: { destination: "/academy" } } });
  expect(api.navigate).toHaveBeenCalledWith({ to: "/academy" });
  await act(async () => root.unmount());
  expect(api.remove).toHaveBeenCalledTimes(1);
});
it("offers an Arabic update instruction for reminder requests on old binaries", async () => {
  api.available.mockReturnValue(false);
  await expect(scheduleLiveSessionReminders({} as LiveSession)).rejects.toThrow("حدّث تطبيق تمكين");
});
