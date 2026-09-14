import { beforeEach, afterEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ session: vi.fn(), read: vi.fn(), save: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: api.session } },
}));
vi.mock("@/lib/offline/offline-artifact-cache", () => ({
  readOfflineArtifactBytes: api.read,
  saveOfflineArtifactBytes: api.save,
  removeOfflineArtifact: vi.fn(),
}));
import {
  downloadOfflineSubjectPack,
  prepareOfflineSubjectPack,
  deleteAllOfflinePacks,
} from "../../src/lib/offline/offline-pack-downloader";
import {
  MemoryOfflineStateAdapter,
  OfflineStateRepository,
} from "../../src/lib/offline/offline-state-store";
import { prepared, scope } from "./settings-fixtures";
beforeEach(() => {
  vi.clearAllMocks();
  api.session.mockResolvedValue({
    data: { session: { user: { id: scope.ownerId }, access_token: "TEST_ONLY" } },
  });
  api.read.mockResolvedValue(null);
  api.save.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());
it("metadata validates subject identity, retains omission counts, and propagates cancellation", async () => {
  const subject = await prepared();
  const controller = new AbortController();
  vi.mocked(fetch).mockImplementation(
    async () => new Response(JSON.stringify({ manifest: subject.manifest, omitted: 4 })),
  );
  const result = await prepareOfflineSubjectPack(subject.id, {
    expectedOwnerId: scope.ownerId,
    signal: controller.signal,
  });
  expect(result.omitted).toBe(4);
  expect(fetch).toHaveBeenCalledWith(
    "/api/offline-pack/manifest/one",
    expect.objectContaining({ signal: controller.signal }),
  );
  await expect(
    prepareOfflineSubjectPack("other", { expectedOwnerId: scope.ownerId }),
  ).rejects.toThrow("OFFLINE_MANIFEST_SCOPE_MISMATCH");
});
it("rejects a changed account before fetching or deleting content", async () => {
  api.session.mockResolvedValue({
    data: { session: { user: { id: "student-b" }, access_token: "TEST_ONLY" } },
  });
  const subject = await prepared();
  await expect(
    downloadOfflineSubjectPack({
      subjectId: subject.id,
      manifest: subject.manifest,
      expectedOwnerId: scope.ownerId,
    }),
  ).rejects.toThrow("OFFLINE_OWNER_CHANGED");
  await expect(
    deleteAllOfflinePacks(
      new OfflineStateRepository(new MemoryOfflineStateAdapter()),
      scope.ownerId,
    ),
  ).rejects.toThrow("OFFLINE_OWNER_CHANGED");
  expect(fetch).not.toHaveBeenCalled();
  expect(api.save).not.toHaveBeenCalled();
});
it("downloads the reviewed manifest without fetching metadata again and verifies device persistence", async () => {
  const subject = await prepared();
  const bytes = new TextEncoder().encode("abc");
  let stored = false;
  api.read.mockImplementation(async () => (stored ? bytes : null));
  api.save.mockImplementation(async () => {
    stored = true;
  });
  vi.mocked(fetch).mockResolvedValue(new Response(bytes));
  const result = await downloadOfflineSubjectPack({
    subjectId: subject.id,
    manifest: subject.manifest,
    expectedOwnerId: scope.ownerId,
    repository: new OfflineStateRepository(new MemoryOfflineStateAdapter()),
  });
  expect(result.status).toBe("ready");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/api/offline-pack/artifact/official-book%3Aone");
});
it("cancels a download waiting for session refresh before it can start a request", async () => {
  api.session.mockImplementation(() => new Promise(() => {}));
  const subject = await prepared();
  const controller = new AbortController();
  const pending = downloadOfflineSubjectPack({
    subjectId: subject.id,
    manifest: subject.manifest,
    expectedOwnerId: scope.ownerId,
    signal: controller.signal,
  });
  const result = expect(pending).rejects.toThrow("OFFLINE_DOWNLOAD_ABORTED");
  controller.abort();
  await result;
  expect(fetch).not.toHaveBeenCalled();
});
