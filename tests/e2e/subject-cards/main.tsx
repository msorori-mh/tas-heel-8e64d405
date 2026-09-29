import { createRoot } from "react-dom/client";
import {
  createRouter,
  createRootRoute,
  createRoute,
  RouterProvider,
  Outlet,
} from "@tanstack/react-router";
import { SubjectGroupsGrid } from "../../../src/components/home/SubjectGroupsGrid";
import "../../../src/styles.css";
const subjects = [
  { id: "arabic", name: "البلاغة والنقد", icon: null, color: null, sort_order: 0 },
  { id: "reading", name: "القراءة والقصة", icon: null, color: null, sort_order: 1 },
  { id: "english", name: "اللغة الإنجليزية", icon: null, color: null, sort_order: 2 },
  { id: "chemistry", name: "الكيمياء", icon: null, color: null, sort_order: 3 },
  { id: "physics", name: "الفيزياء", icon: null, color: null, sort_order: 4 },
];
function Review() {
  const Grid = SubjectGroupsGrid;
  return (
    <main style={{ maxWidth: 1150, margin: "auto", padding: 12, paddingBottom: 90 }}>
      <h1 style={{ fontSize: 20, fontWeight: 900, margin: "4px 0 16px" }}>موادي</h1>
      <Grid
        subjects={subjects}
        semester={1}
        meta={{
          arabic: { lessons: 8, completed: 0 },
          reading: {
            lessons: 23,
            completed: 3,
            started: true,
            resumeLesson: { id: "lesson-reading", title: "القراءة الناقدة" },
          },
          english: { lessons: 36, completed: 36 },
          chemistry: { lessons: 0, completed: 0 },
          physics: { lessons: 12, completed: 0, progressKnown: false },
        }}
        downloads={{ arabic: "downloaded", reading: "partial" }}
      />
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          background: "white",
          borderTop: "1px solid #ddd",
          display: "flex",
          justifyContent: "space-around",
          padding: 16,
          fontSize: 12,
          zIndex: 20,
        }}
      >
        <span>الرئيسية</span>
        <strong>موادي</strong>
        <span>الاختبارات</span>
        <span>التقدم</span>
        <span>حسابي</span>
      </nav>
    </main>
  );
}
const rootRoute = createRootRoute({ component: Outlet });
const route = createRoute({ getParentRoute: () => rootRoute, path: "/", component: Review });
const subjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/subjects/$subjectId",
  component: () => <p>تم فتح المادة</p>,
});
const lessonRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/lessons/$lessonId",
  component: () => <p>تم فتح الدرس</p>,
});
const router = createRouter({
  routeTree: rootRoute.addChildren([route, subjectRoute, lessonRoute]),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
