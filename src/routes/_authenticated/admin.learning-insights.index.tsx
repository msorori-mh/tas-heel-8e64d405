import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/learning-insights/")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/learning-insights/mistakes", replace: true });
  },
});
