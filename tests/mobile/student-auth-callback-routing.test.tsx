// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://studentamkeen.com"}
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  session: vi.fn(),
  user: vi.fn(),
  profile: vi.fn(),
  exchange: vi.fn(),
  useAuth: vi.fn(),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: api.useAuth }));
vi.mock("@/lib/auth/google-sign-in", () => ({ startGoogleSignIn: vi.fn() }));
vi.mock("@/lib/auth-helpers", () => ({ translateAuthError: (error: Error) => error.message }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getSession: api.session, getUser: api.user, exchangeCodeForSession: api.exchange },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: api.profile }) }) }),
  },
}));
import { Route as AuthRoute } from "../../src/routes/auth";
import { Route as CallbackRoute } from "../../src/routes/auth.callback";
let host: HTMLDivElement, root: Root;
let router: ReturnType<typeof createRouter>;
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  api.useAuth.mockReturnValue({ loading: false, session: null });
  api.session.mockResolvedValue({
    data: { session: { user: { id: "TEST_ONLY_STUDENT" } } },
    error: null,
  });
  api.user.mockResolvedValue({ data: { user: { id: "TEST_ONLY_STUDENT" } }, error: null });
  api.profile.mockResolvedValue({
    data: {
      full_name: "طالب اختبار",
      grade_uuid: "grade-12",
      governorate_id: "test-governorate",
      curriculum_track_id: "test-track",
    },
    error: null,
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});
async function mount(path: string) {
  history.replaceState(null, "", path);
  const base = createRootRoute({ component: Outlet });
  const auth = createRoute({
    getParentRoute: () => base,
    path: "auth",
    component: AuthRoute.options.component,
  });
  const callback = createRoute({
    getParentRoute: () => auth,
    path: "callback",
    component: CallbackRoute.options.component,
  });
  const mobile = createRoute({
    getParentRoute: () => auth,
    path: "mobile-callback",
    component: () => <p>TEST_ONLY_NATIVE_BRIDGE</p>,
  });
  const app = createRoute({
    getParentRoute: () => base,
    path: "app",
    component: () => <p>TEST_ONLY_STUDENT_HOME</p>,
  });
  const complete = createRoute({
    getParentRoute: () => base,
    path: "complete-profile",
    component: () => <p>TEST_ONLY_PROFILE_FORM</p>,
  });
  router = createRouter({
    routeTree: base.addChildren([auth.addChildren([callback, mobile]), app, complete]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await act(async () => {
    await router.load();
    root.render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
  });
}
it("mounts the web callback instead of the login form and enters the student's home", async () => {
  await mount("/auth/callback?code=TEST_ONLY_CODE");
  await act(async () => {
    await vi.waitFor(() => expect(host.textContent).toContain("TEST_ONLY_STUDENT_HOME"));
  });
  expect(api.useAuth).not.toHaveBeenCalled();
  expect(api.exchange).not.toHaveBeenCalled();
  expect(api.profile).toHaveBeenCalled();
});
it("only routes a genuinely incomplete profile to completion", async () => {
  api.profile.mockResolvedValue({ data: null, error: null });
  await mount("/auth/callback");
  await act(async () => {
    await vi.waitFor(() => expect(host.textContent).toContain("TEST_ONLY_PROFILE_FORM"));
  });
});
it("shows a profile lookup error instead of pretending the student has no profile", async () => {
  api.profile.mockResolvedValue({ data: null, error: new Error("TEST_ONLY_PROFILE_FAILURE") });
  await mount("/auth/callback");
  expect(host.textContent).toContain("TEST_ONLY_PROFILE_FAILURE");
  expect(host.textContent).not.toContain("TEST_ONLY_PROFILE_FORM");
});
it("shows provider rejection without starting session/profile requests", async () => {
  await mount("/auth/callback?error=access_denied");
  expect(host.textContent).toContain("access_denied");
  expect(api.session).not.toHaveBeenCalled();
  expect(api.profile).not.toHaveBeenCalled();
});
it("mounts the mobile bridge without executing the student entry redirect", async () => {
  await mount("/auth/mobile-callback");
  expect(host.textContent).toContain("TEST_ONLY_NATIVE_BRIDGE");
  expect(api.useAuth).not.toHaveBeenCalled();
  expect(api.exchange).not.toHaveBeenCalled();
});
it("still renders the Google-only entry at /auth", async () => {
  await mount("/auth");
  expect(host.textContent).toContain("المتابعة باستخدام Google");
  expect(api.useAuth).toHaveBeenCalled();
  expect(api.session).not.toHaveBeenCalled();
});
