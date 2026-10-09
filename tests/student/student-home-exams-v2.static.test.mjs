import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");
describe("student home and exams v2", () => {
  it("simplifies the exam hub and shares its history query", () => {
    const hub = read("src/routes/_authenticated/exams.index.tsx");
    expect(hub).not.toContain("Breadcrumbs");
    expect(hub).not.toContain("عند نشرها");
    expect(hub).toContain("slice(0, 3)");
    expect(hub).toContain('to="/exams/history/$sessionId"');
    for (const page of [hub, read("src/routes/_authenticated/exams.history.tsx")])
      expect(page).toContain("useExamHistory");
    const hook = read("src/hooks/use-exam-history.ts");
    expect(hook).toContain('["exam-history", user?.id]');
    expect(hook).toContain(".limit(100)");
    expect(hub).toContain("useSemesterSubjects");
    expect(hub).toContain("historyPercentage");
  });
  it("moves account actions from the mobile header to settings", () => {
    const shell = read("src/components/student/StudentShell.tsx");
    const header = shell.slice(
      shell.indexOf('<header className="student-shell-header'),
      shell.indexOf("</header>", shell.indexOf('<header className="student-shell-header')),
    );
    expect(header).not.toContain("LogOut");
    expect(header).not.toContain("GraduationCap");
    expect(header).toContain("isContentStaff &&");
    const settings = read("src/routes/_authenticated/settings.tsx");
    expect(settings).toContain('href="/academy"');
    expect(settings).toContain("تسجيل الخروج");
  });
  it("uses Arabic counts and admin data rather than fixed dates", () => {
    expect(read("src/components/home/CompactProgress.tsx")).toContain("arabicCount");
    const countdown = read("src/components/home/ExamCountdown.tsx");
    expect(countdown).toContain("use-exam-countdown");
    expect(countdown).not.toMatch(/20\d{2}-\d{2}-\d{2}/);
    expect(read("src/hooks/use-exam-countdown.ts")).toContain(
      '["exam-countdown", trackId, gradeId]',
    );
  });
  it("sets native dark icons and preserves edge-to-edge CSS insets", () => {
    expect(read("capacitor.config.ts")).toContain(
      'StatusBar: { overlaysWebView: false, style: "LIGHT", backgroundColor: "#FFFFFF" }',
    );
    const runtime = read("src/components/mobile/NativeStatusBar.tsx");
    expect(runtime).toContain("Capacitor.isNativePlatform()");
    expect(runtime).toContain("style: Style.Light");
    expect(runtime).toContain("Number(android[1]) < 15");
  });
});
