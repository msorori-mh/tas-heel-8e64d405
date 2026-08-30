/**
 * STUDENT_HOME_SUBJECT_CARD_UX_V2
 *
 * Presentation-only contracts for the approved stakeholder review changes.
 * No DB, RLS, RPC, content, admin, or academy behavior is changed here.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const shell = read("src/components/student/StudentShell.tsx");
const home = read("src/routes/_authenticated/app.tsx");
const continueCard = read("src/components/home/ContinueLearningCard.tsx");
const dailyGoal = read("src/components/home/DailyGoalCard.tsx");
const tools = read("src/components/home/LearningToolsSection.tsx");
const navTile = read("src/components/common/NavTile.tsx");
const semesters = read("src/routes/_authenticated/semesters.index.tsx");
const subjectsView = read("src/components/student/SemesterSubjectsView.tsx");
const subjectGrid = read("src/components/home/SubjectGroupsGrid.tsx");

describe("STUDENT_HOME_SUBJECT_CARD_UX_V2", () => {
  it("uses a wider canvas only for student dashboard and subject-catalog surfaces", () => {
    expect(shell).toContain('data-student-canvas={usesWideLearningCanvas ? "wide" : "standard"}');
    expect(shell).toContain('pathname === "/app"');
    expect(shell).toContain('pathname === "/semesters"');
    expect(shell).toContain("max-w-[1360px]");
    expect(shell).toContain("max-w-[1200px]");
    expect(shell).toContain("isContentStaff &&");
  });

  it("keeps one primary next action and pairs it with the daily target on wide screens", () => {
    expect(home).toContain("xl:grid-cols-[minmax(0,1.55fr)_minmax(300px,0.75fr)]");
    expect(home.indexOf("<ContinueLearningCard")).toBeLessThan(home.indexOf("<DailyGoalCard"));
    expect(continueCard).toContain("خطوتك التالية");
    expect(continueCard).toContain("التقدم في الدرس");
    expect(continueCard).toContain("subject-card-accent");
    expect(dailyGoal).toContain("h-2");
  });

  it("fills the learning-tools row without leaving an empty fourth column", () => {
    expect(tools).toContain("repeat(auto-fit,minmax(220px,1fr))");
    expect(navTile).toContain("min-h-20");
    expect(navTile).toContain("text-[15px]");
  });

  it("uses three subject columns on wide desktops and one integrated card surface", () => {
    expect(subjectGrid).toContain("xl:grid-cols-3");
    expect(subjectGrid).toContain("min-h-40");
    expect(subjectGrid).toContain("كتب المنهج");
    expect(subjectGrid).toContain("عرض أو تنزيل");
    expect(subjectGrid).toContain("min-h-11 w-full");
    expect(subjectGrid).not.toContain('className="mt-1.5 inline-flex items-center');
  });

  it("communicates subject readiness and progress without exposing one flat card state", () => {
    for (const label of ["قريبًا", "جاهزة", "قيد التقدم", "مكتملة"]) {
      expect(subjectGrid).toContain(label);
    }
    expect(subjectGrid).toContain('role="progressbar"');
    expect(subjectGrid).toContain("المحتوى قيد التجهيز");
    expect(subjectsView).toContain('aria-label="ملخص مواد الفصل"');
    expect(subjectsView).toContain("المواد الأساسية");
    expect(subjectsView).toContain("مواد جاهزة");
    expect(subjectsView).toContain("مرحلة تجهيز المحتوى");
  });

  it("counts main subjects from database grouping metadata and drills into real branches", () => {
    expect(subjectsView).toContain("curriculum_track_id,group_code,group_name");
    expect(subjectsView).toContain("groupSubjectsByMainCategory(subjects)");
    expect(subjectsView).toContain("value={subjectGroups.length}");
    expect(subjectGrid).toContain("groups.find((g) => g.id === openGroupKey)");
    expect(subjectGrid).toContain("setOpenGroupKey(group.id)");
    expect(subjectGrid).toContain("فتح فروع مادة");
    expect(subjectGrid).toContain("اختر فرع المادة");
    expect(subjectGrid).toContain("params={{ subjectId: to }}");
  });

  it("keeps semester tabs keyboard-visible and touch-safe", () => {
    expect(semesters).toContain("min-h-11");
    expect(semesters).toContain("focus-visible:ring-2");
    expect(semesters).toContain('role="tablist"');
    expect(semesters).toContain("aria-selected={semester === value}");
  });

  it("does not introduce fixed mobile widths or horizontal scrolling", () => {
    for (const source of [
      home,
      continueCard,
      dailyGoal,
      tools,
      navTile,
      semesters,
      subjectsView,
      subjectGrid,
    ]) {
      expect(source).not.toContain("overflow-x-scroll");
      expect(source).not.toMatch(/w-\[\d{3,}px\]/);
    }
  });
});
