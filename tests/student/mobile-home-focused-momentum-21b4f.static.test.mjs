/**
 * 21B4F — Mobile Home "Focused Momentum" simplification guards.
 * Static source contract tests (no DB, no network, no deploy).
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
const home = read("src/routes/_authenticated/app.tsx");
const greeting = read("src/components/home/HomeGreeting.tsx");
const cont = read("src/components/home/ContinueLearningCard.tsx");
const goal = read("src/components/home/DailyGoalCard.tsx");
const attention = read("src/components/home/NeedsAttentionSection.tsx");
const tools = read("src/components/home/LearningToolsSection.tsx");
const subjects = read("src/components/home/SemesterPicker.tsx");
const progress = read("src/components/home/CompactProgress.tsx");

const at = (needle) => home.indexOf(needle);

describe("21B4F home order", () => {
  it("1. Continue Learning appears before lower-priority sections", () => {
    expect(at("<HomeGreeting")).toBeGreaterThan(-1);
    expect(at("<ContinueLearningCard")).toBeGreaterThan(at("<HomeGreeting"));
    expect(at("<DailyGoalCard")).toBeGreaterThan(at("<ContinueLearningCard"));
    expect(at("<NeedsAttentionSection")).toBeGreaterThan(at("<DailyGoalCard"));
    expect(at("<LearningToolsSection")).toBeGreaterThan(at("<NeedsAttentionSection"));
    expect(at("<SemesterPicker")).toBeGreaterThan(at("<LearningToolsSection"));
    expect(at("<CompactProgress")).toBeGreaterThan(at("<SemesterPicker"));
  });

  it("2. new student gets a CTA, not a zero dashboard", () => {
    expect(cont).toContain("ابدأ أول درس");
    expect(progress).toContain("ابدأ التعلم ليظهر تقدمك هنا");
    // no big zero KPI grid on Home anymore
    expect(home).not.toContain("ProgressSummary");
    expect(home).not.toContain("WelcomeCard");
    expect(home).not.toContain("TodayMissionCard");
  });

  it("3. Needs Attention is hidden when empty", () => {
    expect(attention).toContain("if (flagged.length === 0) return null;");
    expect(attention).not.toContain("لا يوجد شيء");
  });

  it("4. Quick Actions expose exactly the expected set", () => {
    for (const route of ["/quick-review", "/my-mistakes", "/performance", "/ministerial-exams"]) {
      expect(tools).toContain(`to="${route}"`);
    }
    expect(tools.match(/<NavTile/g)?.length).toBe(4);
  });

  it("5. no duplicate primary CTA on Home", () => {
    expect(cont.match(/متابعة الدرس/g)?.length).toBe(1);
    expect(goal).not.toContain("متابعة الدرس");
    expect(goal).not.toContain("ابدأ الآن");
  });

  it("6. achievements placeholder hidden when nothing is earned", () => {
    expect(home).toContain("badges.filter((b) => b.earnedAt)");
    expect(home).toContain("earnedBadges.length > 0 &&");
  });

  it("7. AI assistant stays secondary (after Continue Learning)", () => {
    expect(at("<AiAssistantCard")).toBeGreaterThan(at("<ContinueLearningCard"));
    expect(at("<AiAssistantCard")).toBeGreaterThan(at("<SemesterPicker"));
  });

  it("8. subjects remain accessible from Home", () => {
    expect(subjects).toContain('to="/semesters/$semester"');
    expect(subjects).toContain("موادي");
  });

  it("9. textbook entry (21B4D) remains reachable from the subject surface", () => {
    const sheet = read("src/components/textbooks/SubjectTextbooksSheet.tsx");
    expect(sheet).toContain("كتب المنهج");
    expect(home).not.toContain("SubjectTextbooksSheet");
  });

  it("10. RTL is preserved on Home", () => {
    expect(home).toContain('dir="rtl"');
  });

  it("11. mobile-safe: truncation + min-w-0 guards, no fixed wide widths", () => {
    for (const src of [greeting, cont, goal, attention, progress, subjects]) {
      expect(src).not.toMatch(/w-\[\d{3,}px\]/);
      expect(src).not.toContain("overflow-x-scroll");
    }
    expect(cont).toContain("min-w-0");
    expect(cont).toContain("truncate");
    expect(subjects).toContain("truncate");
  });

  it("12. authenticated home routing unchanged", () => {
    expect(home).toContain('createFileRoute("/_authenticated/app")');
    expect(home).toContain('to: "/semesters/$semester"');
    expect(home).toContain("validateSearch: zodValidator(searchSchema)");
  });

  it("13. touch targets are at least ~44px on primary actions", () => {
    expect(cont).toContain("min-h-11");
    expect(attention).toContain("min-h-11");
  });
});

describe("21B4F needs-attention derivation", () => {
  it("flags weak scores and unfinished lessons only", () => {
    expect(attention).toContain("LOW_SCORE");
    expect(attention).toContain("درس بدأته ولم تكمله");
    expect(attention).toContain("slice(0, 3)");
  });
});
