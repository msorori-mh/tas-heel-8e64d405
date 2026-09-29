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
import { expect, it, vi } from "vitest";
import { useExamNavigationGuard, requestStudentSignOut } from "@/hooks/use-exam-navigation-guard";
it("cancel keeps the live attempt; confirmation permits leaving; sign-out is checked first", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("scrollTo", vi.fn());
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  function Exam() {
    useExamNavigationGuard(true);
    return <h1>اختبار جارٍ</h1>;
  }
  const base = createRootRoute({ component: Outlet });
  const exam = createRoute({ getParentRoute: () => base, path: "/exam", component: Exam });
  const other = createRoute({
    getParentRoute: () => base,
    path: "/other",
    component: () => <h1>صفحة أخرى</h1>,
  });
  const router = createRouter({
    routeTree: base.addChildren([exam, other]),
    history: createMemoryHistory({ initialEntries: ["/exam"] }),
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => {
      await router.load();
      root.render(<RouterProvider router={router} />);
    });
    expect(requestStudentSignOut()).toBe(false);
    await act(async () => {
      void router.navigate({ to: "/other" });
    });
    expect(router.state.location.pathname).toBe("/exam");
    confirm.mockReturnValue(true);
    expect(requestStudentSignOut()).toBe(true);
    confirm.mockClear();
    await act(async () => {
      await router.navigate({ to: "/other" });
    });
    expect(router.state.location.pathname).toBe("/other");
    expect(confirm).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});
