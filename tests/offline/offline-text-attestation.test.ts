import { expect, it } from "vitest";
import { isOfflineTextApproved } from "../../src/lib/offline/offline-text-attestation";
import { sha256Hex } from "../../src/lib/offline/offline-pack-contract";
import { buildOfflineSubjectPack } from "../../src/lib/offline/offline-pack-manifest";
const lessonId = "11111111-1111-4111-8111-111111111111";
const body = '<p dir="rtl">درس عربي 🧪</p>';
const snapshot = {
  snapshotVersion: "v3.snapshot.1",
  capability: "officialBookContent",
  lessonId,
  payload: [{ content: body }],
};
// Obtained from the project's actual PostgreSQL v3_capability_snapshot_hash RPC.
const snapshotHash = "e4d1d4707252fad8f07ea346769f557d934976802b1c55cd1a5c4d13df3f8023";
async function input() {
  return {
    body,
    bodySha256: await sha256Hex(new TextEncoder().encode(body)),
    expectedSha256: snapshotHash,
    lessonId,
    capability: "officialBookContent",
    readySnapshot: snapshot,
  };
}
it("verifies legacy snapshot approval against the PostgreSQL golden hash", async () => {
  expect(await isOfflineTextApproved(await input())).toBe(true);
});
it("retains exact-body publication approval", async () => {
  const value = await input();
  expect(
    await isOfflineTextApproved({
      ...value,
      expectedSha256: value.bodySha256,
      readySnapshot: undefined,
    }),
  ).toBe(true);
});
it("rejects changed live bytes despite an intact approved snapshot", async () => {
  expect(
    await isOfflineTextApproved({
      ...(await input()),
      body: body + "changed",
      bodySha256: await sha256Hex(new TextEncoder().encode(body + "changed")),
    }),
  ).toBe(false);
});
it("rejects tampered snapshots and unrecognized approval shapes", async () => {
  expect(
    await isOfflineTextApproved({
      ...(await input()),
      readySnapshot: { ...snapshot, payload: [{ content: "changed" }] },
    }),
  ).toBe(false);
  expect(
    await isOfflineTextApproved({
      ...(await input()),
      readySnapshot: { ...snapshot, snapshotVersion: "unknown" },
    }),
  ).toBe(false);
});
it("binds snapshot approval to its lesson and capability", async () => {
  expect(await isOfflineTextApproved({ ...(await input()), lessonId: "another-lesson" })).toBe(
    false,
  );
  expect(await isOfflineTextApproved({ ...(await input()), capability: "quickReview" })).toBe(
    false,
  );
});
it("builds an exact-body manifest from legacy approved text without changing the manifest contract", async () => {
  const t = "2026-09-01T00:00:00.000Z";
  const result = await buildOfflineSubjectPack({
    scope: { gradeId: "grade-12", curriculumTrackId: null, semester: 1, subjectId: "subject-1" },
    lessons: [
      {
        id: lessonId,
        title: "درس",
        sortOrder: 0,
        updatedAt: t,
        managed: true,
        visible: true,
        readyCapabilities: { officialBookContent: { sha256: snapshotHash, readyAt: t, snapshot } },
      },
    ],
    textSources: [
      {
        sourceType: "official-book",
        sourceId: "book-1",
        lessonId,
        title: "كتاب",
        body,
        updatedAt: t,
        sortOrder: 0,
        attestation: "lifecycle",
      },
    ],
    textbooks: [],
  });
  expect(result.manifest.artifacts).toHaveLength(1);
  expect(result.manifest.artifacts[0].sha256).toBe((await input()).bodySha256);
  expect(JSON.stringify(result.manifest)).not.toContain("readySnapshot");
});

it("verifies bodyless database metadata only against exact content in an approved snapshot", async () => {
  const value = await input();
  expect(await isOfflineTextApproved({ ...value, body: undefined })).toBe(true);
  expect(
    await isOfflineTextApproved({
      ...value,
      body: undefined,
      bodySha256: await sha256Hex(new TextEncoder().encode("changed")),
    }),
  ).toBe(false);
  expect(
    await isOfflineTextApproved({
      ...value,
      body: undefined,
      readySnapshot: { ...snapshot, payload: [{ content: "changed" }] },
    }),
  ).toBe(false);
  expect(
    await isOfflineTextApproved({ ...value, body: undefined, lessonId: "another-lesson" }),
  ).toBe(false);
});
