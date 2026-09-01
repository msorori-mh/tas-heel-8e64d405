import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { getSubjectVisualTone } from "../../src/lib/subjects/subject-visual-tone";

const read = (path: string) => readFileSync(path, "utf8");

describe("STUDENT_VITALITY_COLOR_SYSTEM_01", () => {
  it("assigns stable, restrained accents to curriculum families", () => {
    const quran = getSubjectVisualTone("القرآن الكريم");
    const arabic = getSubjectVisualTone("اللغة العربية - النحو والصرف");
    const chemistry = getSubjectVisualTone("الكيمياء");
    const biology = getSubjectVisualTone("الأحياء");

    expect(quran.accent).toBe("#0F766E");
    expect(arabic.accent).toBe("#4338CA");
    expect(chemistry.accent).toBe("#0E7490");
    expect(biology.accent).toBe("#15803D");
    expect(new Set([quran.accent, arabic.accent, chemistry.accent, biology.accent]).size).toBe(4);
  });

  it("accepts only safe stored hex colours for unknown subjects", () => {
    expect(getSubjectVisualTone("مادة اختيارية", "#123abc").accent).toBe("#123ABC");
    expect(getSubjectVisualTone("مادة اختيارية", "url(javascript:alert(1))").accent).toBe(
      "#4F46E5",
    );
  });

  it("uses colour as a contained accent and keeps unavailable subjects non-navigable", () => {
    const styles = read("src/styles.css");
    const grid = read("src/components/home/SubjectGroupsGrid.tsx");

    expect(styles).toContain("--subject-accent");
    expect(styles).toContain("--subject-soft");
    expect(styles).toContain("--subject-wash");
    expect(grid).toContain("getSubjectVisualTone");
    expect(grid).toContain("available ? (");
    expect(grid).toContain('to="/subjects/$subjectId"');
    expect(grid).toContain("المحتوى قيد التجهيز");
    expect(grid).toContain("كتب المنهج");
  });

  it("replaces zero dashboards with an actionable performance empty state", () => {
    const performance = read("src/routes/_authenticated/performance.tsx");

    expect(performance).toContain("PerformanceEmptyState");
    expect(performance).toContain("صفحة أدائك تبدأ مع أول خطوة");
    expect(performance).toContain("ابدأ أول درس");
    expect(performance).toContain("أقوى مادة لديك");
    expect(performance).toContain("data.by_subject.length > 0");
    expect(performance).toContain("data.strengths.lessons.length > 0");
    expect(performance).toContain("data.weaknesses.lessons.length > 0");
  });

  it("adds a goal ring, real streak and one data-led daily suggestion", () => {
    const home = read("src/routes/_authenticated/app.tsx");
    const goal = read("src/components/home/DailyGoalCard.tsx");
    const suggestion = read("src/components/home/AiAssistantCard.tsx");

    expect(home).toContain("streakDays={stats?.streakDays ?? 0}");
    expect(home).toContain("items={continueItems} stats={stats}");
    expect(goal).toContain('role="progressbar"');
    expect(goal).toContain("conic-gradient");
    expect(goal).toContain("استمرارية");
    expect(suggestion).toContain("buildDailySuggestion");
    expect(suggestion).toContain("اقتراح اليوم");
    expect(suggestion).not.toContain("SUGGESTIONS.map");
  });

  it("stays lightweight and motion-accessible", () => {
    const grid = read("src/components/home/SubjectGroupsGrid.tsx");
    const suggestion = read("src/components/home/AiAssistantCard.tsx");

    expect(grid).toContain("motion-reduce:transition-none");
    expect(suggestion).toContain("motion-reduce:transition-none");
    for (const source of [grid, suggestion]) {
      expect(source).not.toMatch(/\.(mp4|webm|gif)["']/i);
      expect(source).not.toContain("setInterval(");
    }
  });
});
