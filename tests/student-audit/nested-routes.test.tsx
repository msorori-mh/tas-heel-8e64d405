// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { afterEach, expect, it, vi } from "vitest";
const query = vi.hoisted(() => vi.fn(() => ({ isLoading: true })));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "student" }, profile: {} }) }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: query,
  useQueryClient: () => ({}),
  useMutation: () => ({}),
}));
import { Route as historyRoute } from "@/routes/_authenticated/exams.history";
import { Route as gradesRoute } from "@/routes/_authenticated/grades";
import { Route as sessionRoute } from "@/routes/_authenticated/ministerial-exams.sessions.$sessionId";
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
afterEach(() => query.mockClear());
for (const [fileRoute, path, childPath, url] of [
  [historyRoute, "/exams/history", "$sessionId", "/exams/history/session-a"],
  [gradesRoute, "/grades", "$gradeId/subjects", "/grades/grade-a/subjects"],
  [
    sessionRoute,
    "/ministerial-exams/sessions/$sessionId",
    "result",
    "/ministerial-exams/sessions/session-a/result",
  ],
] as const) {
  it(`opens ${url} directly and through navigation without mounting its parent page`, async () => {
    const rootRoute = createRootRoute({ component: Outlet });
    const authRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: "_authenticated",
      component: Outlet,
    });
    const parent = fileRoute.update({ path, getParentRoute: () => authRoute } as never);
    const child = createRoute({
      getParentRoute: () => parent,
      path: childPath,
      component: () => <h1>تفاصيل المحاولة</h1>,
    });
    const other = createRoute({
      getParentRoute: () => rootRoute,
      path: "/other",
      component: () => <p>صفحة أخرى</p>,
    });
    const routeTree = rootRoute.addChildren([
      authRoute.addChildren([parent.addChildren([child])]),
      other,
    ]);
    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: [url] }),
    });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => {
        await router.load();
        root.render(<RouterProvider router={router} />);
      });
      expect(host.textContent).toBe("تفاصيل المحاولة");
      expect(query).not.toHaveBeenCalled();
      await act(async () => {
        await router.navigate({ to: "/other" });
      });
      await act(async () => {
        await router.navigate({ to: url });
      });
      expect(host.textContent).toBe("تفاصيل المحاولة");
      expect(query).not.toHaveBeenCalled();
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
}
