// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  saved: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  navigate: vi.fn(),
  notify: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => api.navigate }));
vi.mock("@/hooks/use-connectivity", () => ({ useConnectivity: () => true }));
vi.mock("@/lib/offline/network", () => ({ getNetworkState: async () => ({ online: true }) }));
vi.mock("@/lib/offline/student-shell-cache", () => ({
  readStudentIdentity: api.saved,
  rememberStudentIdentity: vi.fn().mockResolvedValue(undefined),
  forgetStudentIdentity: vi.fn(),
  clearStudentViews: vi.fn(),
}));
vi.mock("@/lib/offline/offline-state-store", () => ({
  setActiveOfflineOwner: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: api.from,
    rpc: api.rpc,
    auth: {
      getSession: () => new Promise(() => {}),
      getUser: () => new Promise(() => {}),
      onAuthStateChange: (fn: typeof api.notify) => {
        api.notify = fn;
        return { data: { subscription: { unsubscribe() {} } } };
      },
    },
  },
}));
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { useRequireAdminSection } from "@/lib/admin-route-access";
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const saved = {
  user: { id: "admin-test" },
  profile: { user_id: "admin-test", full_name: "cached" },
};
let root: Root,
  host: HTMLDivElement,
  auth: ReturnType<typeof useAuth>,
  guard: ReturnType<typeof useRequireAdminSection>;
let roles: ReturnType<typeof deferred<{ data: boolean; error: null }>>;
function Capture() {
  auth = useAuth();
  guard = useRequireAdminSection("full");
  return <span>{guard.loading ? "waiting" : guard.enabled ? "admin" : "denied"}</span>;
}
const render = () =>
  act(async () =>
    root.render(
      <AuthProvider>
        <Capture />
      </AuthProvider>,
    ),
  );
async function accept() {
  await act(async () => {
    api.notify("INITIAL_SESSION", { user: saved.user });
    await vi.advanceTimersByTimeAsync(0);
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  roles = deferred();
  api.saved.mockResolvedValue(saved);
  api.from.mockReturnValue({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => ({ data: { ...saved.profile, full_name: "server" }, error: null }),
      }),
    }),
  });
  api.rpc.mockImplementation((_: string, args: { _role: string }) =>
    args._role === "admin" ? roles.promise : Promise.resolve({ data: false, error: null }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("waits for online roles after a cached identity and keeps the admin route", async () => {
  await render();
  expect(auth.loading).toBe(false);
  expect(guard.loading).toBe(true);
  expect(guard.enabled).toBe(false);
  expect(api.navigate).not.toHaveBeenCalled();
  await accept();
  expect(guard.loading).toBe(true);
  expect(api.navigate).not.toHaveBeenCalled();
  await act(async () => roles.resolve({ data: true, error: null }));
  expect(guard.enabled).toBe(true);
  expect(api.navigate).not.toHaveBeenCalled();
});
it("redirects a non-admin only after the role response settles", async () => {
  await render();
  await accept();
  expect(api.navigate).not.toHaveBeenCalled();
  await act(async () => roles.resolve({ data: false, error: null }));
  expect(guard.enabled).toBe(false);
  expect(api.navigate).toHaveBeenCalledWith({ to: "/app", replace: true });
});
it("does not let a late disk identity overwrite an accepted online profile or roles", async () => {
  const disk = deferred<typeof saved>();
  api.saved.mockReturnValue(disk.promise);
  await render();
  await accept();
  await act(async () => roles.resolve({ data: true, error: null }));
  expect(auth.isAdmin).toBe(true);
  await act(async () => disk.resolve(saved));
  expect(auth.profile?.full_name).toBe("server");
  expect(auth.isAdmin).toBe(true);
  expect(guard.enabled).toBe(true);
});
