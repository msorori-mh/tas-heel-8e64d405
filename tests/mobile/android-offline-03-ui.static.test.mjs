import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const subjectRoute = read("src/routes/_authenticated/subjects.$subjectId.tsx");
const lessonRoute = read("src/routes/_authenticated/lessons.$lessonId.tsx");
const card = read("src/components/offline/OfflineSubjectPackCard.tsx");
const settings = read("src/components/offline/OfflineContentSettings.tsx");
const localContent = read("src/lib/offline/offline-lesson-content.ts");
const capacitor = read("capacitor.config.ts");

describe("OFFLINE-03 truthful student UI", () => {
  it("uses the attested subject manifest instead of the legacy PDF-only pack", () => {
    expect(subjectRoute).toContain("OfflineSubjectPackCard");
    expect(subjectRoute).not.toContain("<OfflinePackCard");
    expect(card).toContain("fetchOfflineSubjectPackManifest");
    expect(card).toContain("downloadOfflineSubjectPack");
    expect(card).toContain("inspectOfflineSubjectPack");
    expect(card).toContain("استكمال التنزيل");
    expect(settings).not.toContain("OfflinePackCard");
    expect(settings).toContain("deleteAllOfflinePacks");
    expect(settings).toContain('to="/semesters"');
  });

  it("labels a pack ready only from verified device presence", () => {
    expect(card).toContain("local?.ready === true");
    expect(card).toContain("متاح دون إنترنت");
    expect(card).toContain("digestOfflinePackManifest");
    expect(card).toContain("يتوفر تحديث");
  });

  it("hydrates lesson bodies from owner-isolated, hash-verified local bytes", () => {
    expect(lessonRoute).toContain("readOfflineLessonContent(profile!.user_id, lessonId)");
    expect(lessonRoute).toContain("offlineContent?.officialBook?.body");
    expect(lessonRoute).toContain("offlineContent?.experiments");
    expect(localContent).toContain("record.ownerId === ownerId");
    expect(localContent).toContain("await verifyOfflineArtifact(bytes, artifact)");
    expect(localContent).not.toContain("question");
    expect(localContent).not.toContain("answer");
  });

  it("does not claim restart-in-airplane-mode closure before the embedded-app gate", () => {
    expect(capacitor).toContain('url: "https://studentamkeen.com"');
    expect(card).not.toContain("بعد إعادة تشغيل التطبيق");
  });
});
