import { createRoot } from "react-dom/client";
import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  Link,
} from "@tanstack/react-router";
import { StudentShell } from "@/components/student/StudentShell";
import { useExamNavigationGuard } from "@/hooks/use-exam-navigation-guard";
import { SubjectLessonBrowser } from "@/components/subjects/SubjectLessonBrowser";
import "@/styles.css";
document.documentElement.style.setProperty("--safe-area-inset-top", "28px");
document.documentElement.style.setProperty("--safe-area-inset-bottom", "24px");
const rootRoute = createRootRoute({
  component: () => (
    <StudentShell>
      <Outlet />
    </StudentShell>
  ),
});
function Exam() {
  useExamNavigationGuard(true);
  return (
    <section className="space-y-4">
      <h1 className="text-xl font-bold">نموذج وزاري تجريبي</h1>
      <label className="block">
        إجابتك
        <textarea className="block w-full rounded-xl border p-3" />
      </label>
      <Link to="/app" className="inline-flex min-h-11 rounded-xl border p-3">
        مغادرة الاختبار
      </Link>
    </section>
  );
}
const home = createRoute({
  getParentRoute: () => rootRoute,
  path: "/app",
  component: () => (
    <>
      <h1>موادي الدراسية</h1>
      <Link to="/ministerial-exams/sessions/demo">بدء نموذج</Link>
      <div style={{ height: 1300 }} />
      <p data-testid="last-content" className="rounded-xl border p-5">
        آخر محتوى في الصفحة
      </p>
    </>
  ),
});
const exam = createRoute({
  getParentRoute: () => rootRoute,
  path: "/ministerial-exams/sessions/demo",
  component: Exam,
});
const auth = createRoute({
  getParentRoute: () => rootRoute,
  path: "/auth",
  component: () => <h1>تسجيل الدخول</h1>,
});
const subject = createRoute({
  getParentRoute: () => rootRoute,
  path: "/subjects/search-fixture",
  component: () => (
    <>
      <h1 className="mb-4 text-xl font-bold">الرياضيات</h1>
      <SubjectLessonBrowser
        units={[
          {
            id: "intro",
            title: "المقدمة",
            description: null,
            sort_order: 0,
            is_free: true,
            semester: 1,
          },
          {
            id: "stats",
            title: "الإحصاء",
            description: null,
            sort_order: 1,
            is_free: true,
            semester: 1,
          },
          {
            id: "more",
            title: "تطبيقات",
            description: null,
            sort_order: 2,
            is_free: true,
            semester: 1,
          },
        ]}
        lessons={[
          {
            id: "intro",
            title: "مقدمة الرياضيات",
            unit_id: "intro",
            sort_order: 0,
            duration: "10",
            semester: 1,
          },
          {
            id: "stats",
            title: "مَبادِئ الإِحْصَاء",
            unit_id: "stats",
            sort_order: 1,
            duration: "15",
            semester: 1,
          },
          {
            id: "more",
            title: "الإحصاء المتقدم",
            unit_id: "more",
            sort_order: 2,
            duration: "20",
            semester: 1,
          },
          {
            id: "direct",
            title: "أساسيات الجبر",
            unit_id: null,
            sort_order: 3,
            duration: "12",
            semester: 1,
          },
        ]}
        completed={new Set()}
      />
    </>
  ),
});
const router = createRouter({ routeTree: rootRoute.addChildren([home, exam, auth, subject]) });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
