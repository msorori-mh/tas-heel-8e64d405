import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const shell = readFileSync("mobile/www/index.html", "utf8");
const plugin = readFileSync(
  "android/app/src/main/java/app/studentamkeen/tamkeen/TamkeenOfflineContentPlugin.java",
  "utf8",
);

describe("Android full offline student shell", () => {
  it("bundles all primary student navigation screens into the APK fallback", () => {
    for (const id of [
      "home-view",
      "subjects-view",
      "exams-view",
      "progress-view",
      "account-view",
      "lesson-view",
    ]) {
      expect(shell).toContain(`id="${id}"`);
    }
    for (const label of ["الرئيسية", "موادي", "الاختبارات", "التقدم", "حسابي"]) {
      expect(shell).toContain(label);
    }
    expect(shell).toContain('class="bottom-nav"');
  });

  it("derives offline dashboard stats only from the active owner's verified local state", () => {
    expect(plugin).toContain("public void getOfflineOverview(PluginCall call)");
    expect(plugin).toContain("String ownerId = activeOwner(state)");
    expect(plugin).toContain('"ready".equals(record.optString("status", ""))');
    expect(plugin).toContain("verifiedArtifactBytes(ownerId, record, artifact)");
    expect(plugin).not.toContain('call.getString("ownerId")');
    expect(shell).toContain("getOfflineOverview()");
  });

  it("keeps local lesson interactivity isolated from the native bridge", () => {
    expect(shell).toContain('frame.setAttribute("sandbox", "allow-scripts")');
    expect(shell).toContain('frame.setAttribute("sandbox", "")');
    expect(shell).toContain("interactiveDocument(body)");
    expect(shell).toContain("connect-src 'none'");
    expect(shell).not.toMatch(/allow-same-origin/);
  });

  it("keeps offline exams and progress available without network APIs", () => {
    expect(shell).toContain("readLessonAssessments({ lessonId: lessonId })");
    expect(shell).toContain("revealOfficialAnswer({");
    expect(shell).toContain("checkSelfTestAnswer({");
    expect(shell).toContain("pendingSyncCount");
    expect(shell).not.toMatch(/fetch\(|XMLHttpRequest|supabase/i);
  });
});
