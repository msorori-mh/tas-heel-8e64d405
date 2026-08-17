/**
 * LESSON_DYNAMIC_CAPABILITY_AND_STUDENT_UX_FIX_18B — static guards.
 * Prevents the fixed seven-step lesson model from coming back.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const LESSON_PAGE = "src/routes/_authenticated/lessons.$lessonId.tsx";
const ADMIN_PAGE = "src/routes/_authenticated/admin.lesson-content.$lessonId.tsx";
const ENGINE = "src/lib/lessons/lesson-capabilities.ts";

const read = (p) => readFileSync(p, "utf8");

describe("18B static guards", () => {
  it("NO_LITERAL_FIXED_STEP_NUMBERS — step numbers come from the render index", () => {
    const src = read(LESSON_PAGE);
    expect(src).toMatch(/stepNumber=\{index \+ 1\}/);
    expect(src).not.toMatch(/stepNumber=\{[1-9]\}/);
  });

  it("NO_FIXED_20_PERCENT_WEIGHT — no hardcoded progress weights", () => {
    const src = read(LESSON_PAGE);
    expect(src).not.toMatch(/completedWeights|weight\s*[:=]\s*0?\.2\b|\*\s*20\b/);
    expect(src).toMatch(/computeLessonProgress/);
  });

  it("NO_SEVEN_STEP_ASSUMPTION — denominator is never a constant", () => {
    const src = read(LESSON_PAGE);
    expect(src).not.toMatch(/\/\s*7\b|totalSteps\s*=\s*7|of\s*7/);
    const engine = read(ENGINE);
    expect(engine).toMatch(/denominator = tracked\.length/);
  });

  it("NO_EMPTY_RESOURCE_CARD_SPAM — only available+visible capabilities render", () => {
    const src = read(LESSON_PAGE);
    expect(src).toMatch(/visibleLessonCapabilities/);
    expect(src).not.toMatch(/لا توجد خريطة|لا يوجد فيديو|لا توجد تجربة/);
  });

  it("NO_SUBJECT_BASED_FAKE_CAPABILITIES — capabilities never derive from subject name", () => {
    const engine = read(ENGINE);
    expect(engine).not.toMatch(/subject_name|subjectName|"القرآن"|"كيمياء"|"فيزياء"/);
  });

  it("admin readiness reuses the same engine (single source of truth)", () => {
    const admin = read(ADMIN_PAGE);
    expect(admin).toMatch(/lesson-content-contract/);
    expect(admin).toMatch(/buildLessonCapabilityContract/);
  });
});
