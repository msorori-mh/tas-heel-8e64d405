// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any -- Controlled Supabase callback and response test doubles. */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../../src/hooks/use-auth";

const api = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signOut: vi.fn(),
  owner: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: api.from, rpc: api.rpc, auth: api },
}));
vi.mock("@/lib/offline/offline-state-store", () => ({ setActiveOfflineOwner: api.owner }));
function deferred<T = any>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const session = (id: string, token = "token") => ({ user: { id }, access_token: token });
let root: Root, host: HTMLDivElement, state: ReturnType<typeof useAuth>;
let notify: (event: string, session: any) => void;
let snapshot: ReturnType<typeof deferred>;
let pending: { uid: string; kind: string; request: ReturnType<typeof deferred> }[];
function Capture() {
  state = useAuth();
  return <span>{state.profile?.full_name}</span>;
}
async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}
async function emit(event: string, value: any) {
  await act(async () => {
    notify(event, value);
  });
  await tick();
}
async function finish(uid: string, admin = false) {
  await act(async () => {
    for (const item of pending.filter((p) => p.uid === uid))
      item.request.resolve({
        data:
          item.kind === "profile"
            ? { user_id: uid, full_name: uid }
            : item.kind === "admin" && admin,
        error: null,
      });
  });
}
beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  pending = [];
  snapshot = deferred();
  const enqueue = (uid: string, kind: string) => {
    const request = deferred();
    pending.push({ uid, kind, request });
    return request.promise;
  };
  api.getSession.mockReturnValue(snapshot.promise);
  api.onAuthStateChange.mockImplementation((callback) => {
    notify = callback;
    return { data: { subscription: { unsubscribe: vi.fn() } } };
  });
  api.from.mockImplementation(() => ({
    select: () => ({
      eq: (_: string, uid: string) => ({ maybeSingle: () => enqueue(uid, "profile") }),
    }),
  }));
  api.rpc.mockImplementation((_: string, args) => enqueue(args._user_id, args._role));
  api.owner.mockResolvedValue(undefined);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("starts all three independent requests together and deduplicates INITIAL_SESSION + snapshot", async () => {
  await emit("INITIAL_SESSION", session("student"));
  // Profile is still pending: roles must already be in flight.
  expect(pending.map((p) => p.kind)).toEqual(["profile", "admin", "content_manager"]);
  await act(async () => snapshot.resolve({ data: { session: session("student") } }));
  await tick();
  expect(pending).toHaveLength(3);
  expect(state.loading).toBe(true);
  expect(api.owner).toHaveBeenCalledExactlyOnceWith("student");
  await finish("student");
  expect(state.loading).toBe(false);
  expect(state.profile?.user_id).toBe("student");
});
it("also deduplicates when the snapshot finishes before INITIAL_SESSION", async () => {
  await act(async () => snapshot.resolve({ data: { session: session("student") } }));
  await tick();
  await finish("student");
  await emit("INITIAL_SESSION", session("student"));
  expect(pending).toHaveLength(3);
});
it("shares in-flight work across repeated sign-in notifications", async () => {
  await emit("INITIAL_SESSION", session("student"));
  await emit("SIGNED_IN", session("student"));
  expect(pending).toHaveLength(3);
  await finish("student");
});
it("completes bootstrap with three requests in total", async () => {
  await emit("INITIAL_SESSION", session("student"));
  await act(async () => snapshot.resolve({ data: { session: session("student") } }));
  await tick();
  await finish("student");
  await finish("student");
  await tick();
  expect(pending).toHaveLength(3);
  expect(state.loading).toBe(false);
});
it("an explicit refresh supersedes a pre-save profile read", async () => {
  await emit("INITIAL_SESSION", session("student"));
  const older = pending.slice();
  const refresh = state.refreshProfile();
  expect(pending).toHaveLength(6);
  await act(async () => {
    for (const item of pending.slice(3))
      item.request.resolve({
        data: item.kind === "profile" ? { user_id: "student", full_name: "updated name" } : false,
        error: null,
      });
    await refresh;
    for (const item of older)
      item.request.resolve({
        data: item.kind === "profile" ? { user_id: "student", full_name: "old name" } : true,
        error: null,
      });
  });
  expect(state.profile?.full_name).toBe("updated name");
  expect(state.isAdmin).toBe(false);
});
it("updates a refreshed token without downloading profile and roles again", async () => {
  await emit("INITIAL_SESSION", session("student"));
  await finish("student");
  await emit("TOKEN_REFRESHED", session("student", "new-token"));
  expect(state.session?.access_token).toBe("new-token");
  expect(pending).toHaveLength(3);
  expect(api.owner).toHaveBeenCalledExactlyOnceWith("student");
});
it("still rechecks roles on subsequent sign-in and allows profile refresh after a save", async () => {
  await emit("INITIAL_SESSION", session("student"));
  await finish("student");
  await emit("SIGNED_IN", session("student"));
  expect(pending).toHaveLength(6);
  await finish("student");
  const refresh = state.refreshProfile();
  expect(pending).toHaveLength(9);
  await finish("student");
  await refresh;
});
it("discards a late privileged response and a stale snapshot after sign-out", async () => {
  await emit("INITIAL_SESSION", session("admin"));
  await emit("SIGNED_OUT", null);
  await finish("admin", true);
  await act(async () => snapshot.resolve({ data: { session: session("admin") } }));
  await tick();
  expect(state.user).toBeNull();
  expect(state.profile).toBeNull();
  expect(state.isAdmin).toBe(false);
  expect(state.loading).toBe(false);
  expect(api.owner.mock.calls.map(([uid]) => uid)).toEqual(["admin", null]);
});
it("isolates overlapping account loads even when the old request finishes last", async () => {
  await emit("INITIAL_SESSION", session("admin"));
  await emit("SIGNED_IN", session("student"));
  await finish("student");
  await finish("admin", true);
  expect(state.profile?.user_id).toBe("student");
  expect(state.isContentStaff).toBe(false);
  expect(api.owner.mock.calls.map(([uid]) => uid)).toEqual(["admin", "student"]);
});
it("does not start a queued old-account request after switching accounts", async () => {
  await act(async () => {
    notify("INITIAL_SESSION", session("admin"));
    notify("SIGNED_IN", session("student"));
  });
  await tick();
  expect(pending.map((p) => p.uid)).toEqual(["student", "student", "student"]);
});
it("settles a failed session read without hanging the loading screen", async () => {
  await act(async () => snapshot.reject(new Error("connection failed")));
  await tick();
  expect(state.loading).toBe(false);
  expect(state.user).toBeNull();
  expect(pending).toHaveLength(0);
});
it("fails role checks closed while retaining a successfully loaded profile", async () => {
  await emit("INITIAL_SESSION", session("student"));
  await act(async () => {
    for (const p of pending)
      p.request.resolve(
        p.kind === "profile"
          ? { data: { user_id: "student" }, error: null }
          : { data: true, error: { message: "denied" } },
      );
  });
  expect(state.profile?.user_id).toBe("student");
  expect(state.isAdmin).toBe(false);
  expect(state.isContentStaff).toBe(false);
});

it("returns the refreshed persisted profile and retains content-staff roles", async () => {
  await emit("INITIAL_SESSION", session("student"));
  await finish("student");
  const refreshed = state.refreshProfile();
  let result;
  await act(async () => {
    for (const p of pending.slice(3))
      p.request.resolve({
        data:
          p.kind === "profile"
            ? { user_id: "student", full_name: "saved" }
            : p.kind === "content_manager",
        error: null,
      });
    result = await refreshed;
  });
  expect(result).toEqual({ user_id: "student", full_name: "saved" });
  expect(state.isContentStaff).toBe(true);
});

it("rejects an explicit refresh when the persisted profile cannot be read", async () => {
  await emit("INITIAL_SESSION", session("student"));
  await finish("student");
  const refreshed = state.refreshProfile().catch((error) => error);
  let result;
  await act(async () => {
    for (const p of pending.slice(3))
      p.request.resolve({
        data: null,
        error: p.kind === "profile" ? { message: "read denied" } : null,
      });
    result = await refreshed;
  });
  expect(result).toEqual({ message: "read denied" });
  expect(state.profile).toBeNull();
});
