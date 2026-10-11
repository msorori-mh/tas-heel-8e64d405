import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { StudentShell } from "@/components/student/StudentShell";
import { StudentHome } from "@/routes/_authenticated/app";
import { ExamsHubPage } from "@/routes/_authenticated/exams.index";
import "@/styles.css";
const root = createRootRoute({
  component: () => (
    <StudentShell>
      <Outlet />
    </StudentShell>
  ),
});
const home = createRoute({ getParentRoute: () => root, path: "/app", component: StudentHome });
const exams = createRoute({ getParentRoute: () => root, path: "/exams", component: ExamsHubPage });
const router = createRouter({ routeTree: root.addChildren([home, exams]) });
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
