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
const mainActivity = read("android/app/src/main/java/app/studentamkeen/tamkeen/MainActivity.java");
const shell = read("mobile/www/index.html");
const state = read("src/lib/offline/offline-state-store.ts");
const auth = read("src/hooks/use-auth.tsx");
const contract = read("src/lib/offline/offline-pack-contract.ts");
const manifestBuilder = read("src/lib/offline/offline-pack-manifest.ts");
const manifestRoute = read("src/routes/api/offline-pack.manifest.$subjectId.ts");
const capacitor = read("capacitor.config.ts");

describe("OFFLINE-04 Android cold-start lesson entry", () => {
  it("keeps the online app and OAuth origin unchanged while retaining the local error entry", () => {
    expect(capacitor).toContain('url: "https://studentamkeen.com"');
    expect(capacitor).toContain('errorPath: "index.html"');
    expect(mainActivity).toContain("registerPlugin(TamkeenOfflineContentPlugin.class)");
  });

  it("pins the offline entry to the last authenticated owner and clears it on sign-out", () => {
    expect(state).toContain("activeOwnerId");
    expect(state).toContain("setActiveOfflineOwner");
    expect(auth).toContain("setActiveOfflineOwner(sess?.user?.id ?? null)");
    expect(auth).toContain("setActiveOfflineOwner(data.session?.user?.id ?? null)");
    expect(auth).toContain("await setActiveOfflineOwner(null)");
  });

  it("exposes display labels in the content-addressed manifest without URLs or auth data", () => {
    expect(contract).toContain("lessonTitle:");
    expect(contract).toContain("subjectTitle:");
    expect(manifestBuilder).toContain("lessonTitle: lesson.title");
    expect(manifestBuilder).toContain("subjectTitle: input.subjectTitle");
    expect(manifestRoute).toContain('.select("id,name,grade_id,curriculum_track_id,semester")');
    expect(manifestRoute).toContain("subjectTitle: subject.name");
    expect(stripComments(contract)).not.toMatch(/access.?token|refresh.?token|signed.?url/i);
  });

  it("accepts no owner or path from JavaScript and verifies ready state, owner, size and SHA", () => {
    expect(java).toContain('@CapacitorPlugin(name = "TamkeenOfflineContent")');
    expect(java).toContain('call.getString("lessonId")');
    expect(java).not.toContain('call.getString("ownerId")');
    expect(java).not.toContain('call.getString("path")');
    expect(java).toContain('record.optString("status", "")');
    expect(java).toContain('record.optString("ownerId", "")');
    expect(java).toContain('record.optJSONArray("verifiedArtifactIds")');
    expect(java).toContain("candidate.length() != expectedSize");
    expect(java).toContain('MessageDigest.getInstance("SHA-256")');
    expect(java).toContain("canonicalCandidate.startsWith(canonicalRoot + File.separator)");
  });

  it("keeps text rendering narrow and returns only safe assessment prompts initially", () => {
    expect(java).toContain('"lesson-html".equals(kind) || "quick-review".equals(kind)');
    expect(java).toContain('"official-book".equals(type)');
    expect(java).toContain('"lab-experiment".equals(type)');
    expect(java).toContain("public void readLessonAssessments(PluginCall call)");
    const safeQuestion = java.slice(
      java.indexOf("private JSObject safeQuestion"),
      java.indexOf("@PluginMethod", java.indexOf("private JSObject safeQuestion")),
    );
    expect(safeQuestion).toContain('safe.put("questionText", text)');
    expect(safeQuestion).not.toMatch(
      /modelAnswer|correctOptionId|feedbackByOption|whyCorrect|whyWrong/,
    );
  });

  it("renders verified bodies in a script-disabled sandbox with no network dependency", () => {
    expect(shell).toContain("listSavedSubjects()");
    expect(shell).toContain("readLesson({ lessonId: lessonId })");
    expect(shell).toContain("readLessonAssessments({ lessonId: lessonId })");
    expect(shell).toContain('frame.setAttribute("sandbox", "")');
    expect(shell).toContain("frame.srcdoc =");
    expect(stripComments(shell)).not.toMatch(/\.innerHTML\s*=/);
    expect(stripComments(shell)).not.toMatch(/fetch\(|XMLHttpRequest|supabase/i);
    expect(shell).toContain("connect-src 'none'");
  });
});
