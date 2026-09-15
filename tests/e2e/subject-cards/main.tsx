import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { Route as IndexRoute } from "../../../src/routes/_authenticated/semesters.index";
import { Route as SemesterRoute } from "../../../src/routes/_authenticated/semesters.$semester";
import "../../../src/styles.css";

// Render the real route components, tabs, query view, cards and textbook sheets.
// Only account identity and query results are TEST_ONLY fixtures.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
const names = [
  ["english", "اللغة الإنجليزية", "languages"],
  ["algebra", "الرياضيات - الجبر", "calculator"],
  ["geometry", "الرياضيات - الهندسة", "calculator"],
  ["quran", "القرآن الكريم", "flask"],
  ["physics", "الفيزياء", "atom"],
  ["arabic", "اللغة العربية", "bookText"],
  ["chemistry", "الكيمياء", "flask"],
  ["biology", "الأحياء", "dna"],
  ["islamic", "التربية الإسلامية", "book"],
  ["computer", "الحاسوب", "laptop"],
];
const subjects = names.map(([id, name, icon], sort_order) => ({
  id,
  name,
  icon,
  sort_order,
  color: null,
}));
for (const semester of [1, 2]) {
  const meta = Object.fromEntries(
    subjects.map(({ id }, i) => [
      id,
      {
        lessons: i === 4 ? 0 : 20,
        completed: i === 0 ? (semester === 1 ? 5 : 15) : i === 3 ? 20 : i % 4,
      },
    ]),
  );
  queryClient.setQueryData(
    [
      "semester-subjects",
      "TEST_ONLY_GRADE",
      "TEST_ONLY_TRACK",
      semester,
      "TEST_ONLY_STUDENT",
      false,
    ],
    { subjects, meta },
  );
  for (const subject of subjects) {
    queryClient.setQueryData(["subject-textbooks", subject.id, semester], []);
  }
}

const root = createRootRoute({
  component: () => (
    <QueryClientProvider client={queryClient}>
      <main className="mx-auto max-w-[1200px] p-4">
        <Outlet />
      </main>
    </QueryClientProvider>
  ),
});
const authenticated = createRoute({
  getParentRoute: () => root,
  id: "_authenticated",
  component: Outlet,
});
const index = IndexRoute.update({
  id: "/semesters/",
  path: "/semesters/",
  getParentRoute: () => authenticated,
} as Parameters<typeof IndexRoute.update>[0]);
const semester = SemesterRoute.update({
  id: "/semesters/$semester",
  path: "/semesters/$semester",
  getParentRoute: () => authenticated,
} as Parameters<typeof SemesterRoute.update>[0]);
const subject = createRoute({
  getParentRoute: () => authenticated,
  path: "/subjects/$subjectId",
  component: () => <p>TEST_ONLY subject destination</p>,
});
const app = createRoute({
  getParentRoute: () => authenticated,
  path: "/app",
  component: () => <p>TEST_ONLY home</p>,
});
export const fixtureRouter = createRouter({
  routeTree: root.addChildren([authenticated.addChildren([index, semester, subject, app])]),
});
export const fixtureRoot = createRoot(document.getElementById("root")!);
fixtureRoot.render(<RouterProvider router={fixtureRouter} />);
