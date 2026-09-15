import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  available: false,
  files: new Map<string, string>(),
  read: vi.fn(),
  save: vi.fn(),
  compareAndSwap: vi.fn(),
  filesystemWrites: vi.fn(),
  readError: null as Error | null,
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => mock.available },
  registerPlugin: () => ({ read: mock.read, save: mock.save, compareAndSwap: mock.compareAndSwap }),
}));
vi.mock("@capacitor/filesystem", () => ({
  Directory: { Data: "DATA" },
  Encoding: { UTF8: "utf8" },
  Filesystem: {
    async mkdir() {},
    async writeFile({ path, data }: { path: string; data: string }) {
      mock.filesystemWrites();
      mock.files.set(path, data);
    },
    async readFile({ path }: { path: string }) {
      if (mock.readError) throw mock.readError;
      if (!mock.files.has(path))
        throw Object.assign(new Error("File does not exist"), { code: "OS-PLUG-FILE-0008" });
      return { data: mock.files.get(path) };
    },
  },
}));
import {
  createDeviceOfflineStateAdapter,
  emptyOfflineState,
  OfflineStateRepository,
} from "../../src/lib/offline/offline-state-store";
import {
  readOfflineArtifactBytes,
  saveOfflineArtifactBytes,
} from "../../src/lib/offline/offline-artifact-cache";
import { sha256Hex, type OfflinePackArtifact } from "../../src/lib/offline/offline-pack-contract";
const primary = "tamkeen/offline/foundation-v1.json";
const backup = "tamkeen/offline/foundation-v1.backup.json";
beforeEach(() => {
  mock.available = false;
  mock.files.clear();
  mock.readError = null;
  vi.clearAllMocks();
});
it("keeps the previous APK's journal readable and writable until its binary is upgraded", async () => {
  const legacy = { ...emptyOfflineState(), activeOwnerId: "student-a" } as Record<string, unknown>;
  delete legacy.revision;
  delete legacy.packBackups;
  mock.files.set(primary, JSON.stringify(legacy));
  const repository = new OfflineStateRepository(createDeviceOfflineStateAdapter());
  expect((await repository.read()).activeOwnerId).toBe("student-a");
  await repository.update((state) => {
    state.activeOwnerId = null;
  });
  expect(JSON.parse(mock.files.get(backup)!).activeOwnerId).toBe("student-a");
  expect(
    (await new OfflineStateRepository(createDeviceOfflineStateAdapter()).read()).activeOwnerId,
  ).toBeNull();
  expect(mock.read).not.toHaveBeenCalled();
});
it("recovers the legacy backup but preserves corrupt state and storage errors", async () => {
  mock.files.set(primary, "{bad");
  mock.files.set(backup, JSON.stringify(emptyOfflineState()));
  const repository = new OfflineStateRepository(createDeviceOfflineStateAdapter());
  expect((await repository.read()).revision).toBe(0);
  mock.files.set(backup, "{also-bad");
  await expect(repository.update(() => {})).rejects.toThrow("OFFLINE_STATE_CORRUPT");
  expect(mock.files.get(primary)).toBe("{bad");
  mock.files.clear();
  mock.readError = new Error("disk unavailable");
  await expect(repository.read()).rejects.toThrow("OFFLINE_STATE_CORRUPT");
  expect(mock.filesystemWrites).not.toHaveBeenCalled();
});
it("uses native CAS when available and never falls back to plaintext on encrypted-state failure", async () => {
  mock.available = true;
  mock.files.set(primary, JSON.stringify(emptyOfflineState()));
  mock.read.mockRejectedValueOnce(new Error("keystore unavailable"));
  const repository = new OfflineStateRepository(createDeviceOfflineStateAdapter());
  await expect(repository.update(() => {})).rejects.toThrow("OFFLINE_STATE_NATIVE_READ_FAILED");
  mock.read.mockResolvedValue({ snapshot: emptyOfflineState() });
  mock.compareAndSwap.mockResolvedValue({ committed: true });
  await repository.update((state) => {
    state.activeOwnerId = "student-a";
  });
  expect(mock.compareAndSwap).toHaveBeenCalledWith(
    expect.objectContaining({ expectedRevision: 0 }),
  );
  expect(mock.filesystemWrites).not.toHaveBeenCalled();
});
it("routes artifact writes through encryption and rejects plaintext fallback or wrong returned bytes", async () => {
  mock.available = true;
  const bytes = new TextEncoder().encode("lesson");
  const artifact: OfflinePackArtifact = {
    artifactId: "a",
    resourceId: "official-book:one",
    kind: "lesson-html",
    lessonId: "one",
    title: "درس",
    relativePath: "packs/a.html",
    byteSize: bytes.length,
    sha256: await sha256Hex(bytes),
    contentType: "text/html",
    sortOrder: 0,
  };
  mock.save.mockRejectedValueOnce(new Error("storage full"));
  await expect(saveOfflineArtifactBytes("student-a", artifact, bytes)).rejects.toThrow(
    "storage full",
  );
  expect(mock.filesystemWrites).not.toHaveBeenCalled();
  mock.files.set("tamkeen/offline-artifacts/student-a/packs/a.html", btoa("lesson"));
  mock.read.mockRejectedValueOnce(new Error("authentication failed"));
  expect(await readOfflineArtifactBytes("student-a", artifact)).toBeNull();
  mock.read.mockResolvedValueOnce({ data: btoa("broken") });
  expect(await readOfflineArtifactBytes("student-a", artifact)).toBeNull();
  mock.read.mockResolvedValueOnce({ data: btoa("lesson") });
  expect(await readOfflineArtifactBytes("student-a", artifact)).toEqual(bytes);
});
