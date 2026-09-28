import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const component = read("src/components/questions/MathAnswerInput.tsx");
const lesson = read("src/routes/_authenticated/lessons.$lessonId.tsx");
const ministerial = read("src/routes/_authenticated/ministerial-exams.sessions.$sessionId.tsx");
const offline = read("mobile/www/index.html");

describe("scientific answer keyboard wiring", () => {
  it("uses one reusable input in lesson assessment and ministerial text answers", () => {
    expect(component).toContain("MathAnswerInput");
    expect(lesson).toContain("<MathAnswerInput");
    expect(ministerial).toContain("<MathAnswerInput");
  });

  it("keeps native typing while adding caret-aware scientific symbols", () => {
    expect(component).toContain('inputMode="text"');
    expect(component).toContain("selectionStart");
    expect(component).toContain("setSelectionRange");
    expect(component).toContain("لوحة الرموز العلمية");
    expect(component).toContain("إظهار الرموز الرياضية");
    expect(component).toContain("الناتج مباشرة:");
    expect(component).toContain("evaluateArabicMathPreview");
  });

  it("passes subject and question context so non-science text answers stay simple", () => {
    expect(lesson).toContain("subjectName={subjectName}");
    expect(lesson).toContain("questionText={q.question_text}");
    expect(ministerial).toContain("subjectName={data.model?.subject_name ?? null}");
    expect(ministerial).toContain("questionText={current.question_text}");
  });

  it("keeps the same scientific symbol entry available in the bundled offline lesson flow", () => {
    expect(offline).toContain("function scienceMathKeys(subjectTitle)");
    expect(offline).toContain("function attachMathKeyboard(input, subjectTitle)");
    expect(offline).toContain("لوحة الرموز العلمية");
    expect(offline).toContain('["<", "<"]');
    expect(offline).toContain('[" >", ">"]'.replace(" ", ""));
    expect(offline).toContain('["[", "["]');
    expect(offline).toContain('["{", "{"]');
    expect(offline).toContain('["−∞", "−∞"]');
    expect(offline).toContain('["Δ المميز", "Δ=ب²−٤أج"]');
    expect(offline).toContain("evaluateScienceInput");
    expect(offline).toContain("الناتج مباشرة:");
    expect(offline).toContain('["جا", "جا()"]');
    expect(offline).toContain('["جتا", "جتا()"]');
    expect(offline).toContain('["ظا", "ظا()"]');
    expect(offline).toContain('["→", "→"]');
    expect(offline).toContain('["⇌", "⇌"]');
    expect(offline).toContain("setSelectionRange(cursor, cursor)");
  });
});
