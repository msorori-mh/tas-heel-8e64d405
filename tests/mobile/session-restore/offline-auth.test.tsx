// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
const state = vi.hoisted(() => ({
  online: false,
  saved: vi.fn(),
  forget: vi.fn(),
  owner: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
  notify: null as null | ((event: string, session: unknown) => void),
}));
vi.mock("@/hooks/use-connectivity", () => ({ useConnectivity: () => state.online }));
vi.mock("@/lib/offline/network", () => ({
  getNetworkState: async () => ({ online: state.online }),
}));
vi.mock("@/lib/offline/student-shell-cache", () => ({
  readStudentIdentity: state.saved,
  forgetStudentIdentity: state.forget,
  rememberStudentIdentity: vi.fn(),
}));
vi.mock("@/lib/offline/offline-state-store", () => ({ setActiveOfflineOwner: state.owner }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: state.from,
    rpc: state.rpc,
    auth: {
      getUser: state.getUser,
      getSession: () => new Promise(() => {}),
      onAuthStateChange: (notify: typeof state.notify) => {
        state.notify = notify;
        return { data: { subscription: { unsubscribe() {} } } };
      },
      signOut: async () => {
        state.notify?.("SIGNED_OUT", null);
      },
    },
  },
}));
import { AuthProvider, useAuth } from "@/hooks/use-auth";
const identity = {
  user: { id: "student-a" },
  profile: {
    id: "profile-a",
    user_id: "student-a",
    full_name: "طالبة",
    grade_id: 12,
    curriculum_track_id: "track-a",
    governorate_id: "gov-a",
  },
};
let current: ReturnType<typeof useAuth>, root: Root, host: HTMLDivElement;
function Capture() {
  current = useAuth();
  return <span>{current.profile?.full_name}</span>;
}
const render = () =>
  act(async () =>
    root.render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    ),
  );
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  state.online = false;
  state.saved.mockResolvedValue(identity);
  state.owner.mockResolvedValue(undefined);
  state.forget.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
test("opens local student home while the SDK is indefinitely waiting for refresh", async () => {
  await render();
  expect(current.user?.id).toBe("student-a");
  expect(current.loading).toBe(false);
  expect(current.profileComplete).toBe(true);
  expect(current.session).toBeNull();
  expect(current.isAdmin).toBe(false);
  expect(current.isContentStaff).toBe(false);
  expect(state.from).not.toHaveBeenCalled();
  expect(state.rpc).not.toHaveBeenCalled();
  await act(async () => state.notify?.("INITIAL_SESSION", null));
  expect(current.profile?.full_name).toBe("طالبة");
});
test("explicit offline logout revokes identity and the active pack owner", async () => {
  await render();
  await act(async () => current.signOut());
  expect(current.user).toBeNull();
  expect(current.profile).toBeNull();
  expect(state.forget).toHaveBeenCalled();
  expect(state.owner).toHaveBeenCalledWith(null);
});
test("native offline status wins over a stale online navigator during cold start", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  await render();
  await act(async () => state.notify?.("INITIAL_SESSION", null));
  expect(current.user?.id).toBe("student-a");
  expect(current.profile?.full_name).toBe("طالبة");
  expect(state.owner).not.toHaveBeenCalledWith(null);
  expect(state.from).not.toHaveBeenCalled();
});
test("a late local identity read cannot restore the account after sign-out", async () => {
  let finish!: (value: typeof identity) => void;
  state.saved.mockReturnValue(
    new Promise((r) => {
      finish = r;
    }),
  );
  await render();
  await act(async () => state.notify?.("SIGNED_OUT", null));
  await act(async () => finish(identity));
  expect(current.user).toBeNull();
  expect(current.profile).toBeNull();
});

test("a definitively revoked session on reconnect cannot keep a local identity active", async () => {
  await render();
  state.getUser.mockResolvedValue({ data: { user: null }, error: new Error("session revoked") });
  state.online = true;
  await render();
  expect(current.user).toBeNull();
  expect(current.profile).toBeNull();
  expect(state.owner).toHaveBeenCalledWith(null);
  expect(current.isContentStaff).toBe(false);
});
