import { Outlet, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";

/** Render a page only at its own URL; nested detail routes replace it entirely. */
export function RouteIndexContent({ routeId, children }: { routeId: string; children: ReactNode }) {
  const hasChild = useRouterState({
    select: (state) => {
      const index = state.matches.findIndex((match) => match.routeId === routeId);
      return index >= 0 && index < state.matches.length - 1;
    },
  });
  return hasChild ? <Outlet /> : children;
}
