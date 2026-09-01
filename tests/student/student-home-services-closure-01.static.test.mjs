import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const dashboard = read("src/hooks/use-home-dashboard.ts");
const shell = read("src/components/student/StudentShell.tsx");
const exams = read("src/routes/_authenticated/exams.index.tsx");
const suggestions = read("src/components/home/AiAssistantCard.tsx");
const subjects = read("src/components/student/SemesterSubjectsView.tsx");
const subjectGrid = read("src/components/home/SubjectGroupsGrid.tsx");
const achievements = read("src/components/home/AchievementsSection.tsx");
const landing = read("src/routes/index.tsx");

describe("STUDENT_HOME_SERVICES_CLOSURE_01", () => {
  it("uses the unified performance RPC as the single progress source", () => {
    expect(dashboard).toContain('fetchStudentUnifiedPerformance("ALL")');
    expect(dashboard).toContain("performance.progress.completed_lessons");
    expect(dashboard).toContain("performance.progress.total_lessons");
    expect(dashboard).not.toContain('.from("lessons")');
  });

  it("routes the primary tests entry to an honest exams hub", () => {
    expect(shell).toContain('label: "الاختبارات"');
    expect(shell).toContain('to: "/exams"');
    expect(exams).toContain('createFileRoute("/_authenticated/exams/")');
    expect(exams).toContain("اختبارات المواد");
    expect(exams).toContain("سجل الاختبارات");
    expect(exams).toContain("النماذج الوزارية");
  });

  it("derives one honest daily suggestion without calling it AI", () => {
    expect(suggestions).toContain("buildDailySuggestion");
    expect(suggestions).toContain("اقتراح اليوم");
    expect(suggestions).not.toContain("مساعدك الذكي");
    expect(shell).not.toContain("المساعد الذكي");
    expect(suggestions).toContain('to: "/semesters"');
    expect(suggestions).toContain('to: "/my-mistakes"');
    expect(suggestions).not.toContain("SUGGESTIONS.map");
  });

  it("counts student-visible lessons and labels empty subjects as preparing", () => {
    expect(subjects).toContain("fetchStudentLessonVisibility");
    expect(subjects).toContain("visibility.get(lesson.id) !== false");
    expect(subjectGrid).toContain("المحتوى قيد التجهيز");
    expect(subjectGrid).not.toContain('"ابدأ المذاكرة"');
  });

  it("shows achievement state without claiming the feature is coming soon", () => {
    expect(achievements).toContain("غير مكتسبة");
    expect(achievements).not.toContain("قريبًا");
  });

  it("publishes legal links and the production canonical origin", () => {
    for (const route of ["/privacy", "/terms", "/data-deletion"]) {
      expect(landing).toContain(`to="${route}"`);
    }
    for (const path of [
      "src/routes/__root.tsx",
      "src/routes/index.tsx",
      "src/routes/about.tsx",
      "src/routes/contact.tsx",
      "src/routes/privacy.tsx",
      "src/routes/terms.tsx",
      "src/routes/data-deletion.tsx",
      "src/routes/sitemap[.]xml.ts",
      "public/robots.txt",
    ]) {
      const source = read(path);
      expect(source).not.toContain("tas-heel.lovable.app");
      expect(source).toContain("studentamkeen.com");
    }
  });
});
