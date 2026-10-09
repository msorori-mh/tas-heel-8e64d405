// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://studentamkeen.com"}
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  exchange: vi.fn(),
  navigate: vi.fn(),
  close: vi.fn(),
  launch: vi.fn(),
  native: vi.fn(() => true),
  subscribed: vi.fn(),
  values: new Map<string, string>(),
  listener: undefined as undefined | ((event: { url: string }) => void),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => api.navigate }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: api.native } }));
vi.mock("@capacitor/browser", () => ({ Browser: { close: api.close } }));
vi.mock("@capacitor/preferences", () => ({
  Preferences: {
    get: async ({ key }: { key: string }) => ({ value: api.values.get(key) ?? null }),
    set: async ({ key, value }: { key: string; value: string }) => {
      api.values.set(key, value);
    },
  },
}));
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: async (_: string, listener: typeof api.listener) => {
      api.subscribed();
      api.listener = listener;
      return {
        remove: async () => {
          if (api.listener === listener) api.listener = undefined;
        },
      };
    },
    getLaunchUrl: api.launch,
  },
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { exchangeCodeForSession: api.exchange } },
}));
import { NativeAuthDeepLinkHandler } from "../../src/components/mobile/NativeAuthDeepLinkHandler";
import {
  NATIVE_BRIDGE_URL,
  resetConsumedCallbacks,
  setNativeAuthDestination,
} from "../../src/lib/auth/native-oauth";
import { isCompletedNativeCallback } from "../../src/lib/auth/native-callback-ledger";

const code = "TEST_ONLY_native_code";
const callback = `${NATIVE_BRIDGE_URL}?code=${code}`;
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.clearAllMocks();
  api.values.clear();
  api.listener = undefined;
  localStorage.clear();
  resetConsumedCallbacks();
  vi.stubGlobal("crypto", webcrypto);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  api.exchange.mockResolvedValue({ data: { user: { id: "TEST_ONLY_USER" } }, error: null });
  api.navigate.mockResolvedValue(undefined);
  api.launch.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
async function mount() {
  await act(async () => {
    root.render(
      <StrictMode>
        <NativeAuthDeepLinkHandler />
      </StrictMode>,
    );
  });
  await vi.waitFor(() => expect(api.listener).toBeTypeOf("function"));
}
async function deliver() {
  await act(async () => {
    api.listener?.({ url: callback });
  });
}
async function expectRoute(to: string) {
  await act(async () => {
    await vi.waitFor(() => expect(api.navigate).toHaveBeenCalledWith({ to, replace: true }));
  });
}

it("exchanges concurrent duplicate delivery once and preserves explicit student choice", async () => {
  api.values.set("tamkeen.workspace.v1:TEST_ONLY_USER", "teacher");
  setNativeAuthDestination("student");
  await mount();
  await act(async () => {
    api.listener?.({ url: callback });
    api.listener?.({ url: callback });
  });
  await expectRoute("/auth/callback");
  expect(api.exchange).toHaveBeenCalledTimes(1);
  expect(api.values.get("tamkeen.workspace.v1:TEST_ONLY_USER")).toBe("student");
  expect(host.textContent).toBe("");
  expect([...api.values.values()].join(" ")).not.toContain(code);
});

it("teacher navigation does not reload and a later process launch does not re-exchange the spent code", async () => {
  setNativeAuthDestination("teacher");
  await mount();
  await deliver();
  await expectRoute("/academy");
  expect(await isCompletedNativeCallback(code)).toBe(true);
  await act(async () => root.unmount());
  root = createRoot(host);
  resetConsumedCallbacks();
  api.navigate.mockClear();
  api.launch.mockResolvedValue({ url: callback });
  await mount();
  await act(async () => {
    await vi.waitFor(() => expect(host.textContent).toBe(""));
  });
  expect(api.exchange).toHaveBeenCalledTimes(1);
  expect(api.navigate).not.toHaveBeenCalled();
});

it("exchange refusal is retryable and return-to-login really leaves the teacher page", async () => {
  api.exchange.mockResolvedValueOnce({
    data: { user: null },
    error: new Error("TEST_ONLY_REFUSAL"),
  });
  setNativeAuthDestination("student");
  await mount();
  await deliver();
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(host.textContent).toContain("تعذّر إكمال");
  });
  expect(await isCompletedNativeCallback(code)).toBe(false);
  await act(async () => host.querySelector("button")!.click());
  await expectRoute("/auth");
  await deliver();
  await expectRoute("/auth/callback");
  expect(api.exchange).toHaveBeenCalledTimes(2);
});

it("a failure after successful exchange never releases the single-use code for exchange again", async () => {
  api.navigate.mockRejectedValueOnce(new Error("TEST_ONLY_NAVIGATION_FAILURE"));
  setNativeAuthDestination("student");
  await mount();
  await deliver();
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(host.textContent).toContain("تعذّر إكمال");
  });
  await deliver();
  expect(api.exchange).toHaveBeenCalledTimes(1);
  expect(await isCompletedNativeCallback(code)).toBe(true);
});

it("web renders no overlay and invokes no native listener", async () => {
  api.native.mockReturnValueOnce(false).mockReturnValueOnce(false);
  await act(async () =>
    root.render(
      <StrictMode>
        <NativeAuthDeepLinkHandler />
      </StrictMode>,
    ),
  );
  expect(api.subscribed).not.toHaveBeenCalled();
  expect(api.launch).not.toHaveBeenCalled();
  expect(host.textContent).toBe("");
});
