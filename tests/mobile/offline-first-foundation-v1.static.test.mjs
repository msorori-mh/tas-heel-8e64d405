import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const mainActivity = read("android/app/src/main/java/app/studentamkeen/tamkeen/MainActivity.java");
const nativeStore = read(
  "android/app/src/main/java/app/studentamkeen/tamkeen/TamkeenOfflineStorePlugin.java",
);
const bridge = read("src/lib/offline/native-offline-store.ts");
const packageContract = read("src/lib/offline/content-package.ts");
const capacitorConfig = read("capacitor.config.ts");

describe("offline-first V1 local foundation", () => {
  it("registers an app-private native SQLite store without replacing the existing PDF plugin", () => {
    expect(mainActivity).toContain("registerPlugin(TamkeenPdfViewerPlugin.class)");
    expect(mainActivity).toContain("registerPlugin(TamkeenOfflineStorePlugin.class)");
    expect(nativeStore).toContain('DB_NAME = "tamkeen-offline.db"');
    expect(nativeStore).toContain("extends SQLiteOpenHelper");
  });

  it("keeps curriculum snapshots and sync mutations in separate tables", () => {
    expect(nativeStore).toContain("CREATE TABLE offline_content");
    expect(nativeStore).toContain("CREATE TABLE sync_queue");
    expect(nativeStore).toContain("offline_content_kind_scope_idx");
    expect(nativeStore).toContain("sync_queue_pending_idx");
  });

  it("makes queued writes idempotent instead of replaying duplicates", () => {
    expect(nativeStore).toMatch(/idempotency_key TEXT NOT NULL UNIQUE/);
    expect(nativeStore).toMatch(/CONFLICT_IGNORE/);
    expect(nativeStore).toMatch(/markMutationSynced/);
    expect(nativeStore).toMatch(/attempts = attempts \+ 1/);
  });

  it("fails closed when secret-like fields are offered for offline persistence", () => {
    for (const forbidden of [
      "access_token",
      "refresh_token",
      "authorization",
      "password",
      "service_role",
      "signed_url",
      "secret",
    ]) {
      expect(nativeStore).toContain(forbidden);
      expect(bridge).toContain(forbidden);
    }
    expect(nativeStore).toContain("offline_payload_rejected");
    expect(bridge).toContain("offline_payload_forbidden_key");
  });

  it("defines package scope for grade, curriculum track, semester and subject", () => {
    expect(packageContract).toContain('type CurriculumTrack = "sanaa" | "aden"');
    expect(packageContract).toContain('type SemesterScope = "s1" | "s2" | "full_year"');
    expect(packageContract).toContain("gradeId: string");
    expect(packageContract).toContain("subjectId?: string | null");
    expect(packageContract).toContain("buildOfflineScopeKey");
  });

  it("covers the seven lesson-component family plus questions and ministerial exams", () => {
    for (const kind of [
      "lesson_component",
      "book_question",
      "self_test",
      "ministerial_exam",
      "review_index",
    ]) {
      expect(packageContract).toContain(`\"${kind}\"`);
    }
  });

  it("does not switch the production shell yet; migration to bundled student UI remains a later gate", () => {
    expect(capacitorConfig).toContain('url: "https://studentamkeen.com"');
    expect(capacitorConfig).toContain('errorPath: "index.html"');
  });

  it("never drops local student data during future SQLite upgrades", () => {
    expect(nativeStore).toContain("Future versions must use additive migrations");
    expect(nativeStore).not.toMatch(/DROP TABLE/i);
  });
});
