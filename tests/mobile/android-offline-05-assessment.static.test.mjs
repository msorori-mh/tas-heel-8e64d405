import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const stripComments = (source) =>
  source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const java = read(
  "android/app/src/main/java/app/studentamkeen/tamkeen/TamkeenOfflineContentPlugin.java",
);
const shell = read("mobile/www/index.html");

describe("OFFLINE-05 Android assessment bridge", () => {
  it("never accepts an owner or filesystem path from the bundled page", () => {
    expect(java).not.toContain('call.getString("ownerId")');
    expect(java).not.toContain('call.getString("path")');
    expect(java).toContain("String ownerId = activeOwner(state)");
    expect(java).toContain("verifiedAssessmentBundle(state, ownerId, lessonId");
  });

  it("does not expose answer keys through the initial question list", () => {
    const safeQuestion = java.slice(
      java.indexOf("private JSObject safeQuestion"),
      java.indexOf("@PluginMethod", java.indexOf("private JSObject safeQuestion")),
    );
    expect(safeQuestion).toContain('safe.put("questionId", questionId)');
    expect(safeQuestion).toContain('safe.put("options", safeOptions');
    expect(safeQuestion).not.toMatch(
      /modelAnswer|correctOptionId|feedbackByOption|whyCorrect|whyWrong/,
    );
    expect(safeQuestion).toContain('"savedAnswer"');
    expect(safeQuestion).toContain('"selectedOptionId"');
  });

  it("requires a student attempt before reveal and a valid option before grading", () => {
    expect(java).toContain("attempt.trim().isEmpty()");
    expect(java).toContain('call.reject("offline_assessment_attempt_invalid")');
    expect(java).toContain("boolean optionExists = false");
    expect(java).toContain('call.reject("offline_assessment_option_not_found")');
  });

  it("persists activity before returning answers and uses an idempotent outbox", () => {
    const reveal = java.slice(
      java.indexOf("public void revealOfficialAnswer"),
      java.indexOf("public void checkSelfTestAnswer"),
    );
    expect(reveal.indexOf("persistOfficialAttempt")).toBeLessThan(reveal.indexOf("call.resolve"));
    expect(java).toContain("persistSelfTestAttempt(");
    expect(java).toContain('"official-question-note"');
    expect(java).toContain('"lesson-progress"');
    expect(java).toContain('current.optString("idempotencyKey", "")');
    expect(java).toContain("mutationPayloadJson(");
    expect(java).toContain("jsonString(answerText)");
    expect(java).toContain("STATE_WRITE_LOCK");
    expect(java).toContain("foundation-v1.next.json");
    expect(java).toContain("output.getFD().sync()");
    expect(java).not.toContain("java.time.Instant");
    expect(java).not.toContain("String.join(");
  });

  it("keeps the bundled surface network-free and uses text-only DOM writes", () => {
    const source = stripComments(shell);
    expect(shell).toContain("readLessonAssessments({ lessonId: lessonId })");
    expect(shell).toContain("revealOfficialAnswer({");
    expect(shell).toContain("checkSelfTestAnswer({");
    expect(shell).toContain("question.savedAnswer");
    expect(shell).toContain("question.selectedOptionId");
    expect(source).not.toMatch(/\.innerHTML\s*=/);
    expect(source).not.toMatch(/fetch\(|XMLHttpRequest|supabase/i);
    expect(shell).toContain("connect-src 'none'");
  });
});
