import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * TAMKEEN_FOCUSED_MOMENTUM_V2_PROTOTYPE_19A
 * Visual prototype shell. UI only — no data, no business logic.
 * The `fm-v2` class scopes the prototype theme to this subtree.
 */
export const Route = createFileRoute("/prototype/19a")({
  component: () => (
    <div className="fm-v2 min-h-screen w-full overflow-x-hidden" dir="rtl" lang="ar">
      <Outlet />
    </div>
  ),
});
