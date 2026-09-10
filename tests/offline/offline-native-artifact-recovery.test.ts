import { beforeEach, expect, it, vi } from "vitest";
const files = vi.hoisted(() => new Map<string, string>());
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Filesystem: {
    async mkdir() {},
    async writeFile({ path, data }: { path: string; data: string }) {
      files.set(path, data);
    },
    async readFile({ path }: { path: string }) {
      if (!files.has(path)) throw new Error("MISSING");
      return { data: files.get(path) };
    },
    async deleteFile({ path }: { path: string }) {
      files.delete(path);
    },
  },
}));
import {
  nativePath,
  readOfflineArtifactBytes,
  saveOfflineArtifactBytes,
} from "../../src/lib/offline/offline-artifact-cache";
import { sha256Hex, type OfflinePackArtifact } from "../../src/lib/offline/offline-pack-contract";
beforeEach(() => files.clear());
async function artifact(body: string): Promise<OfflinePackArtifact> {
  return {
    artifactId: "html-one",
    resourceId: "official-book:one",
    kind: "lesson-html",
    lessonId: "one",
    title: "درس",
    relativePath: "packs/one.html",
    byteSize: body.length,
    sha256: await sha256Hex(new TextEncoder().encode(body)),
    contentType: "text/html",
    sortOrder: 0,
  };
}
it("reads native files without IndexedDB and preserves old revisions during updates", async () => {
  const old = await artifact("old");
  const next = await artifact("new");
  await saveOfflineArtifactBytes("student-a", old, new TextEncoder().encode("old"));
  expect(await readOfflineArtifactBytes("student-a", next)).toBeNull();
  expect(files.has(nativePath("student-a", old))).toBe(true);
  await saveOfflineArtifactBytes("student-a", next, new TextEncoder().encode("new"));
  expect(new TextDecoder().decode((await readOfflineArtifactBytes("student-a", old))!)).toBe("old");
  expect(new TextDecoder().decode((await readOfflineArtifactBytes("student-a", next))!)).toBe(
    "new",
  );
  expect(await readOfflineArtifactBytes("student-b", old)).toBeNull();
});
it("reads a verified legacy file, rejects tampering, and never deletes it during a failed read", async () => {
  const entry = await artifact("old");
  const path = "tamkeen/offline-artifacts/student-a/" + entry.relativePath;
  files.set(path, btoa("old"));
  expect(await readOfflineArtifactBytes("student-a", entry)).not.toBeNull();
  files.set(path, btoa("bad"));
  expect(await readOfflineArtifactBytes("student-a", entry)).toBeNull();
  expect(files.has(path)).toBe(true);
});
it("rejects owner path collisions instead of normalizing two identities into one", async () => {
  const entry = await artifact("old");
  await expect(
    saveOfflineArtifactBytes("student/a", entry, new TextEncoder().encode("old")),
  ).rejects.toThrow("OFFLINE_OWNER_ID_INVALID");
});
