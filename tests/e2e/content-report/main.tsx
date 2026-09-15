import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { ContentCompletionReport } from "@/components/admin/ContentCompletionReport";
import "../../../src/styles.css";
const root = createRootRoute({
  component: () => (
    <QueryClientProvider client={client}>
      <main className="p-4 max-w-full min-w-0">
        <Outlet />
      </main>
    </QueryClientProvider>
  ),
});
const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const route = createRoute({
  getParentRoute: () => root,
  path: "/",
  component: () => <ContentCompletionReport enabled />,
});
const lesson = createRoute({
  getParentRoute: () => root,
  path: "/admin/lesson-content/$lessonId",
  component: () => <h1>مساحة معالجة الدرس التجريبية</h1>,
});
const textbooks = createRoute({
  getParentRoute: () => root,
  path: "/admin/textbooks",
  component: () => <h1>إدارة كتب المادة التجريبية</h1>,
});
const router = createRouter({ routeTree: root.addChildren([route, lesson, textbooks]) });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
