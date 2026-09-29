// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  back: null as null | ((data: { canGoBack: boolean }) => void),
  minimize: vi.fn(),
  historyBack: vi.fn(),
  navigate: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  useRouter: () => ({ history: { back: state.historyBack }, navigate: state.navigate }),
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: async (_name: string, callback: typeof state.back) => {
      state.back = callback;
      return { remove: vi.fn() };
    },
    minimizeApp: state.minimize,
  },
}));
import { AndroidBackHandler } from "@/components/mobile/AndroidBackHandler";
let root: Root, host: HTMLDivElement;
beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<AndroidBackHandler />));
  await vi.waitFor(() => expect(state.back).not.toBeNull());
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  state.back = null;
  vi.unstubAllGlobals();
});
it.each(["/academy", "/academy/"])(
  "minimizes from %s without returning through OAuth or student pages",
  (path) => {
    window.history.replaceState(null, "", path);
    state.back?.({ canGoBack: true });
    expect(state.minimize).toHaveBeenCalledOnce();
    expect(state.historyBack).not.toHaveBeenCalled();
    expect(state.navigate).not.toHaveBeenCalled();
  },
);
it("allows the academy to close its menu or return home before minimizing", () => {
  window.history.replaceState(null, "", "/academy");
  const cancel = (event: Event) => event.preventDefault();
  window.addEventListener("tamkeen:academy-back", cancel);
  try {
    state.back?.({ canGoBack: true });
    expect(state.minimize).not.toHaveBeenCalled();
    expect(state.historyBack).not.toHaveBeenCalled();
  } finally {
    window.removeEventListener("tamkeen:academy-back", cancel);
  }
});
it("returns verification and callback routes to the academy without revisiting login", () => {
  window.history.replaceState(null, "", "/academy/verify");
  state.back?.({ canGoBack: true });
  expect(state.navigate).toHaveBeenCalledWith({ to: "/academy", replace: true });
  expect(state.historyBack).not.toHaveBeenCalled();
});
