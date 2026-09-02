import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const manifestRoute = read("src/routes/api/offline-pack.manifest.$subjectId.ts");
const artifactRoute = read("src/routes/api/offline-pack.artifact.$resourceId.ts");
const builder = read("src/lib/offline/offline-pack-manifest.ts");
const downloader = read("src/lib/offline/offline-pack-downloader.ts");
const state = read("src/lib/offline/offline-pack-state.ts");
const capacitor = read("capacitor.config.ts");

describe("OFFLINE-02 security and rollout guards", () => {
  it("uses caller RLS and explicit subject/lesson access gates", () => {
    expect(manifestRoute).toContain('rpc("can_access_subject"');
    expect(manifestRoute).toContain('rpc("lesson_student_content_gate"');
    expect(artifactRoute).toContain('rpc("can_access_lesson"');
    expect(artifactRoute).toContain('rpc(\n    "lesson_student_content_gate"');
    expect(manifestRoute).not.toContain("supabaseAdmin");
    expect(artifactRoute).not.toContain("supabaseAdmin");
  });

  it("never selects question or answer tables into an offline manifest", () => {
    for (const source of [manifestRoute, artifactRoute, builder]) {
      expect(source).not.toMatch(
        /\.from\(["'](?:questions|question_options|lesson_assessments)["']\)/,
      );
      expect(source).not.toContain("answers_payload");
    }
    expect(builder).toContain("OFFLINE_ANSWER_LEAK_DETECTED");
    expect(builder).toContain("CAPABILITY_NOT_READY");
  });

  it("verifies exact bytes before and after private persistence", () => {
    expect(downloader).toContain("await verifyOfflineArtifact(bytes, artifact)");
    expect(downloader).toContain("OFFLINE_ARTIFACT_PERSISTENCE_FAILED");
    expect(downloader).toContain("await verifyOfflineArtifact(persisted, artifact)");
    expect(state).toContain("carriedArtifactIds");
  });

  it("does not switch the production WebView during OFFLINE-02", () => {
    expect(capacitor).toContain('url: "https://studentamkeen.com"');
  });
});
