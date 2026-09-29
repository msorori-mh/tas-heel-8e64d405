import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";
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
  clearStudentViews: vi.fn().mockResolvedValue(undefined),
  rememberStudentIdentity: vi.fn().mockResolvedValue(undefined),
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
  state.getUser.mockImplementation(() => new Promise(() => {}));
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
test("an SDK SIGNED_OUT event does not erase the durable student lease", async () => {
  let finish!: (value: typeof identity) => void;
  state.saved.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await render();
  await act(async () => state.notify?.("SIGNED_OUT", null));
  await act(async () => finish(identity));
  expect(current.user?.id).toBe("student-a");
  expect(current.profile?.full_name).toBe("طالبة");
  expect(state.forget).not.toHaveBeenCalled();
});

test("a temporary refresh failure on reconnect keeps the local student home available", async () => {
  await render();
  state.getUser.mockResolvedValue({
    data: { user: null },
    error: new AuthRetryableFetchError("unavailable", 503),
  });
  state.online = true;
  await render();
  expect(current.user?.id).toBe("student-a");
  expect(current.profile?.full_name).toBe("طالبة");
  expect(state.forget).not.toHaveBeenCalled();
  expect(current.isContentStaff).toBe(false);
});

test("a revoked session on reconnect clears the identity and reopens login", async () => {
  await render();
  state.getUser.mockResolvedValue({
    data: { user: null },
    error: new AuthApiError("revoked", 401),
  });
  state.online = true;
  await render();
  expect(current.user).toBeNull();
  expect(state.forget).toHaveBeenCalled();
  expect(state.owner).toHaveBeenCalledWith(null);
});
test("an online cold start without credentials does not trap a remembered account", async () => {
  state.online = true;
  state.getUser.mockResolvedValue({ data: { user: null }, error: new AuthSessionMissingError() });
  await render();
  expect(current.user).toBeNull();
  expect(current.loading).toBe(false);
});
test("an online SDK sign-out cannot be undone by a delayed identity bootstrap", async () => {
  state.online = true;
  let finish!: (value: typeof identity) => void;
  state.saved.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  await render();
  await act(async () => state.notify?.("SIGNED_OUT", null));
  await act(async () => finish(identity));
  expect(current.user).toBeNull();
  expect(state.forget).toHaveBeenCalled();
});

test("a delayed revocation cleanup cannot clear a newer account's offline owner", async () => {
  await render();
  let finish!: () => void;
  state.forget.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  state.online = true;
  await render();
  await act(async () => state.notify?.("SIGNED_OUT", null));
  expect(state.forget).toHaveBeenCalledOnce();
  state.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({
          data: { ...identity.profile, user_id: "student-b" },
          error: null,
        }),
      }),
    }),
  });
  state.rpc.mockResolvedValue({ data: false, error: null });
  await act(async () => state.notify?.("SIGNED_IN", { user: { id: "student-b" } }));
  await act(async () => finish());
  expect(current.user?.id).toBe("student-b");
  expect(state.owner).toHaveBeenLastCalledWith("student-b");
});
