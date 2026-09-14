import { beforeEach, afterEach, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({
  from: vi.fn(),
  metadata: vi.fn(),
  download: vi.fn(),
  inspect: vi.fn(),
  read: vi.fn(),
  free: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: api.from } }));
vi.mock("@/lib/offline/offline-pack-downloader", () => ({
  prepareOfflineSubjectPack: api.metadata,
  downloadOfflineSubjectPack: api.download,
  inspectOfflineSubjectPack: api.inspect,
}));
vi.mock("@/lib/offline/offline-state-store", () => ({
  deviceOfflineStateRepository: { read: api.read },
}));
vi.mock("@/lib/offline/network", () => ({ getFreeStorageBytes: api.free }));
import {
  prepareStudentDownloads,
  downloadStudentSubjects,
  readSavedStudentDownloads,
} from "../../src/lib/offline/offline-download-library";
import { hasForegroundTransfers } from "../../src/lib/offline/download-priority";
import { prepared, savedSubject, scope } from "./settings-fixtures";
let query: {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  abortSignal: ReturnType<typeof vi.fn>;
};
const rows = [
  { id: "one", name: "رياضيات", curriculum_track_id: "track-a" },
  { id: "two", name: "علوم", curriculum_track_id: null },
  { id: "foreign", name: "منهج آخر", curriculum_track_id: "track-b" },
];
beforeEach(async () => {
  vi.clearAllMocks();
  query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    abortSignal: vi.fn().mockResolvedValue({ data: rows, error: null }),
  };
  api.from.mockReturnValue(query);
  api.metadata.mockImplementation(async (id) => prepared(id));
  api.inspect.mockImplementation(async (id) => savedSubject(await prepared(id), false).local);
  api.free.mockResolvedValue(1000);
  api.download.mockImplementation(
    async ({ subjectId }) => savedSubject(await prepared(subjectId)).local.record,
  );
  api.read.mockResolvedValue({ packs: [] });
});
afterEach(() => vi.useRealTimers());
it("prepares both semesters with the grade and shared-track rules, fetching no content", async () => {
  const result = await prepareStudentDownloads(scope, new AbortController().signal);
  expect(query.eq).toHaveBeenCalledWith("grade_id", "grade-12");
  expect(result.subjects.map((s) => s.id)).toEqual(["one", "two"]);
  expect(result.subjects.map((s) => s.manifest.scope.semester)).toEqual([1, 2]);
  expect(api.download).not.toHaveBeenCalled();
  expect(api.metadata).toHaveBeenCalledWith(
    "one",
    expect.objectContaining({ expectedOwnerId: "student-a", signal: expect.any(AbortSignal) }),
  );
  expect(hasForegroundTransfers()).toBe(false);
});
it("continues past a subject with no downloadable content and reports its exclusion", async () => {
  api.metadata.mockRejectedValueOnce(new Error("OFFLINE_MANIFEST_FETCH_422"));
  const result = await prepareStudentDownloads(scope, new AbortController().signal);
  expect(result.unavailable.map((s) => s.id)).toEqual(["one"]);
  expect(result.subjects.map((s) => s.id)).toEqual(["two"]);
});
it("rejects a server manifest for a different grade instead of including it in the full download", async () => {
  const other = await prepared();
  other.manifest.scope.gradeId = "other-grade";
  api.metadata.mockResolvedValue(other);
  await expect(prepareStudentDownloads(scope, new AbortController().signal)).rejects.toThrow(
    "OFFLINE_MANIFEST_SCOPE_MISMATCH",
  );
  expect(api.download).not.toHaveBeenCalled();
});
it("stops on transport failure instead of claiming a partial catalog is the full plan", async () => {
  api.metadata.mockRejectedValueOnce(new Error("network down"));
  await expect(prepareStudentDownloads(scope, new AbortController().signal)).rejects.toThrow(
    "network down",
  );
  expect(api.metadata).toHaveBeenCalledTimes(1);
});
it("cancels stalled metadata immediately and does not request subsequent subjects", async () => {
  const controller = new AbortController();
  api.metadata.mockImplementation(() => new Promise(() => {}));
  const pending = prepareStudentDownloads(scope, controller.signal);
  const result = expect(pending).rejects.toThrow("OFFLINE_DOWNLOAD_ABORTED");
  await vi.waitFor(() => expect(api.metadata).toHaveBeenCalledTimes(1));
  controller.abort();
  await result;
  expect(api.metadata.mock.calls[0][1].signal.aborted).toBe(true);
  expect(hasForegroundTransfers()).toBe(false);
});
it("bounds metadata waiting on an unresponsive network", async () => {
  vi.useFakeTimers();
  query.abortSignal.mockImplementation(() => new Promise(() => {}));
  const result = expect(
    prepareStudentDownloads(scope, new AbortController().signal),
  ).rejects.toThrow("OFFLINE_METADATA_TIMEOUT");
  await vi.advanceTimersByTimeAsync(30_000);
  await result;
  expect(api.metadata).not.toHaveBeenCalled();
});
it("downloads sequentially with aggregate progress and reuses the reviewed manifests", async () => {
  const subjects = [await prepared(), await prepared("two")];
  const events: string[] = [];
  const progress = vi.fn();
  api.download.mockImplementation(async (args) => {
    events.push(`start:${args.subjectId}`);
    expect(hasForegroundTransfers()).toBe(true);
    args.onProgress({ loadedBytes: 3 });
    await Promise.resolve();
    events.push(`end:${args.subjectId}`);
  });
  await downloadStudentSubjects({
    ownerId: scope.ownerId,
    subjects,
    signal: new AbortController().signal,
    onProgress: progress,
    onReady: async (id) => {
      events.push(`ready:${id}`);
    },
  });
  expect(events).toEqual([
    "start:one",
    "end:one",
    "ready:one",
    "start:two",
    "end:two",
    "ready:two",
  ]);
  expect(progress).toHaveBeenLastCalledWith(
    expect.objectContaining({ completed: 2, count: 2, loadedBytes: 6, totalBytes: 6 }),
  );
  expect(api.download.mock.calls[0][0].manifest).toBe(subjects[0].manifest);
  expect(api.metadata).not.toHaveBeenCalled();
});
it("stops the queue after interruption and retains completed subjects", async () => {
  const controller = new AbortController();
  const ready = vi.fn();
  api.download.mockImplementation(async () => {
    controller.abort();
    throw new Error("aborted");
  });
  await expect(
    downloadStudentSubjects({
      ownerId: scope.ownerId,
      subjects: [await prepared(), await prepared("two")],
      signal: controller.signal,
      onProgress: vi.fn(),
      onReady: ready,
    }),
  ).rejects.toThrow();
  expect(api.download).toHaveBeenCalledTimes(1);
  expect(ready).not.toHaveBeenCalled();
});
it("prevents downloading in a changed session and when remaining storage is insufficient", async () => {
  const subject = await prepared();
  const options = {
    ownerId: scope.ownerId,
    subjects: [subject],
    signal: new AbortController().signal,
    onProgress: vi.fn(),
    onReady: vi.fn(),
  };
  api.inspect.mockResolvedValue({ ...savedSubject(subject).local, ownerId: "student-b" });
  await expect(downloadStudentSubjects(options)).rejects.toThrow("OFFLINE_OWNER_CHANGED");
  api.inspect.mockResolvedValue(savedSubject(subject, false).local);
  api.free.mockResolvedValue(2);
  await expect(downloadStudentSubjects(options)).rejects.toThrow("OFFLINE_INSUFFICIENT_STORAGE");
  expect(api.download).not.toHaveBeenCalled();
});
it("does not require free space for already verified identical files on resume", async () => {
  const subject = await prepared();
  api.inspect.mockResolvedValue(savedSubject(subject).local);
  api.free.mockResolvedValue(0);
  await downloadStudentSubjects({
    ownerId: scope.ownerId,
    subjects: [subject],
    signal: new AbortController().signal,
    onProgress: vi.fn(),
    onReady: vi.fn(),
  });
  expect(api.download).toHaveBeenCalledTimes(1);
});
it("lists and verifies only the current owner’s saved packs without requesting the network catalog", async () => {
  const subject = await prepared();
  const record = savedSubject(subject).local.record!;
  api.read.mockResolvedValue({ packs: [record, { ...record, ownerId: "student-b" }] });
  const result = await readSavedStudentDownloads(scope.ownerId, new AbortController().signal);
  expect(result).toHaveLength(1);
  expect(api.inspect).toHaveBeenCalledTimes(1);
  expect(api.from).not.toHaveBeenCalled();
  expect(api.metadata).not.toHaveBeenCalled();
});
