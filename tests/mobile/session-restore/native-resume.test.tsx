// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({
  launchUrl: undefined as string | undefined,
  native: true,
  pathname: "/",
  user: null as { id: string } | null,
  loading: true,
  navigate: vi.fn(),
  read: vi.fn(),
  remember: vi.fn(),
}));
vi.mock("@capacitor/app", () => ({
  App: { getLaunchUrl: async () => ({ url: state.launchUrl }) },
}));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => state.native } }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => state }));
vi.mock("@tanstack/react-router", () => ({
  useRouterState: () => state.pathname,
  useNavigate: () => state.navigate,
}));
vi.mock("@/lib/auth/native-last-space", () => ({
  readNativeSpace: state.read,
  rememberNativeSpace: state.remember,
}));
import { NativeSessionResume } from "@/components/mobile/NativeSessionResume";
let root: Root, host: HTMLDivElement;
const render = () => act(async () => root.render(<NativeSessionResume />));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.launchUrl = undefined;
  state.native = true;
  state.pathname = "/";
  state.user = null;
  state.loading = true;
  vi.clearAllMocks();
  state.read.mockResolvedValue("student");
  state.remember.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});
test("waits for the native session then resumes the student without OAuth", async () => {
  await render();
  expect(state.navigate).not.toHaveBeenCalled();
  expect(host.textContent).toContain("استعادة");
  state.user = { id: "student-a" };
  state.loading = false;
  await render();
  expect(state.navigate).toHaveBeenCalledWith({ to: "/app", replace: true });
});
test("restores the teacher's saved space without opening the student profile", async () => {
  state.read.mockResolvedValue("teacher");
  state.user = { id: "teacher-a" };
  await render();
  expect(state.read).toHaveBeenCalledWith("teacher-a");
  expect(state.navigate).toHaveBeenCalledWith({ to: "/academy", replace: true });
});
test("does not redirect a signed-out session or a normal browser", async () => {
  state.loading = false;
  await render();
  expect(host.textContent).toBe("");
  expect(state.navigate).not.toHaveBeenCalled();
});
test("does not redirect a normal browser", async () => {
  state.native = false;
  state.user = { id: "student-a" };
  await render();
  expect(state.navigate).not.toHaveBeenCalled();
});
test("does not hijack an explicit return to the account chooser", async () => {
  state.pathname = "/auth";
  state.loading = false;
  await render();
  state.pathname = "/";
  state.user = { id: "student-a" };
  await render();
  expect(state.navigate).not.toHaveBeenCalled();
});
test("a late previous-owner lookup cannot navigate after sign-out", async () => {
  let finish!: (space: string) => void;
  state.read.mockReturnValue(
    new Promise<string>((r) => {
      finish = r;
    }),
  );
  state.user = { id: "teacher-a" };
  await render();
  state.user = null;
  state.loading = false;
  await render();
  await act(async () => finish("teacher"));
  expect(state.navigate).not.toHaveBeenCalled();
});

test("a cold OAuth callback is completed by the deep-link handler before choosing a space", async () => {
  state.launchUrl = "app.studentamkeen.tamkeen://auth/callback?code=fixture-code-1234";
  state.user = { id: "previous-owner" };
  await render();
  expect(state.read).not.toHaveBeenCalled();
  expect(state.navigate).not.toHaveBeenCalled();
});
