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
import { readOfflineLessonContent } from "../../src/lib/offline/offline-lesson-content";
import { sha256Hex } from "../../src/lib/offline/offline-pack-contract";
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
it("third-secondary journey resumes a cut file, retains completed files, then reads with zero network", async () => {
  const subject = await prepared();
  const firstId = "11111111-1111-4111-8111-111111111111";
  const secondId = "22222222-2222-4222-8222-222222222222";
  const body = new TextEncoder().encode('<article dir="rtl">درس ثالث ثانوي محفوظ</article>');
  subject.manifest.artifacts = [firstId, secondId].map((id, index) => ({
    ...subject.manifest.artifacts[0],
    artifactId: `official-book:${id}`,
    resourceId: `official-book:${id}`,
    relativePath: `packs/${id}.html`,
    lessonId: `lesson-${index + 1}`,
    byteSize: body.byteLength,
  }));
  for (const artifact of subject.manifest.artifacts) artifact.sha256 = await sha256Hex(body);
  const stored = new Map<string, Uint8Array>();
  api.read.mockImplementation(async (_owner, artifact) => stored.get(artifact.artifactId) ?? null);
  api.save.mockImplementation(async (_owner, artifact, bytes) => {
    stored.set(artifact.artifactId, bytes);
  });
  let cut = true;
  vi.mocked(fetch).mockImplementation(async (url) => {
    if (String(url).includes(secondId) && cut)
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(body.slice(0, 8));
            controller.error(new TypeError("connection reset during transfer"));
          },
        }),
      );
    return new Response(body);
  });
  const adapter = new MemoryOfflineStateAdapter();
  const repository = new OfflineStateRepository(adapter);
  const request = {
    subjectId: subject.id,
    manifest: subject.manifest,
    expectedOwnerId: scope.ownerId,
    repository,
    onProgress: vi.fn(),
  };
  await expect(downloadOfflineSubjectPack(request)).rejects.toThrow("connection reset");
  const partial = (await repository.read()).packs[0];
  expect(partial.status).toBe("failed");
  expect(partial.verifiedArtifactIds).toEqual([`official-book:${firstId}`]);
  const saved = await readOfflineLessonContent(scope.ownerId, "lesson-1", repository, api.read);
  expect(saved.officialBook?.body).toContain("درس ثالث ثانوي محفوظ");
  cut = false;
  const resumedRepository = new OfflineStateRepository(adapter);
  expect(
    (await downloadOfflineSubjectPack({ ...request, repository: resumedRepository })).status,
  ).toBe("ready");
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes(firstId))).toHaveLength(
    1,
  );
  expect(
    vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes(secondId)),
  ).toHaveLength(2);
  vi.mocked(fetch).mockClear().mockRejectedValue(new TypeError("offline"));
  for (const lessonId of ["lesson-1", "lesson-2"]) {
    const lesson = await readOfflineLessonContent(
      scope.ownerId,
      lessonId,
      resumedRepository,
      api.read,
    );
    expect(lesson.gradeId).toBe("grade-12");
    expect(lesson.officialBook?.body).toContain("درس ثالث ثانوي محفوظ");
  }
  expect(fetch).not.toHaveBeenCalled();
  expect(
    (await readOfflineLessonContent("student-b", "lesson-1", resumedRepository, api.read))
      .officialBook,
  ).toBeNull();
});
it("uses a renewed session for each file during a long third-secondary download", async () => {
  const subject = await prepared();
  subject.manifest.artifacts.push({
    ...subject.manifest.artifacts[0],
    artifactId: "second",
    resourceId: "second",
    relativePath: "packs/second.html",
  });
  const bytes = new TextEncoder().encode("abc");
  const stored = new Map<string, Uint8Array>();
  let token = "TEST_ONLY_INITIAL";
  api.session.mockImplementation(async () => ({
    data: { session: { user: { id: scope.ownerId }, access_token: token } },
  }));
  api.read.mockImplementation(async (_owner, artifact) => stored.get(artifact.artifactId) ?? null);
  api.save.mockImplementation(async (_owner, artifact, data) => {
    stored.set(artifact.artifactId, data);
    token = "TEST_ONLY_RENEWED";
  });
  vi.mocked(fetch).mockImplementation(async (_url, init) => {
    if (
      init?.headers &&
      (init.headers as Record<string, string>).Authorization === `Bearer ${token}`
    )
      return new Response(bytes);
    return new Response("expired", { status: 401 });
  });
  const result = await downloadOfflineSubjectPack({
    subjectId: subject.id,
    manifest: subject.manifest,
    expectedOwnerId: scope.ownerId,
    repository: new OfflineStateRepository(new MemoryOfflineStateAdapter()),
  });
  expect(result.status).toBe("ready");
  expect(vi.mocked(fetch).mock.calls.map(([, init]) => init?.headers)).toEqual([
    { Authorization: "Bearer TEST_ONLY_INITIAL" },
    { Authorization: "Bearer TEST_ONLY_RENEWED" },
  ]);
});
it("stops before sending the next file request when the account changes mid-download", async () => {
  const subject = await prepared();
  subject.manifest.artifacts.push({
    ...subject.manifest.artifacts[0],
    artifactId: "second",
    resourceId: "second",
    relativePath: "packs/second.html",
  });
  const stored = new Map<string, Uint8Array>();
  const bytes = new TextEncoder().encode("abc");
  api.read.mockImplementation(async (_owner, artifact) => stored.get(artifact.artifactId) ?? null);
  api.save.mockImplementation(async (_owner, artifact, data) => {
    stored.set(artifact.artifactId, data);
    api.session.mockResolvedValue({
      data: { session: { user: { id: "student-b" }, access_token: "TEST_ONLY_OTHER" } },
    });
  });
  vi.mocked(fetch).mockImplementation(async () => new Response(bytes));
  await expect(
    downloadOfflineSubjectPack({
      subjectId: subject.id,
      manifest: subject.manifest,
      expectedOwnerId: scope.ownerId,
      repository: new OfflineStateRepository(new MemoryOfflineStateAdapter()),
    }),
  ).rejects.toThrow("OFFLINE_OWNER_CHANGED");
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("preserves a server setup diagnostic instead of misclassifying it as storage failure", async () => {
  vi.mocked(fetch).mockResolvedValue(
    new Response(JSON.stringify({ error: "OFFLINE_ASSESSMENT_SERVER_MISCONFIGURED" }), {
      status: 500,
      headers: { "content-type": "application/json" },
    }),
  );
  await expect(
    prepareOfflineSubjectPack("one", { expectedOwnerId: scope.ownerId }),
  ).rejects.toMatchObject({
    message: "OFFLINE_MANIFEST_FETCH_500",
    serverCode: "OFFLINE_ASSESSMENT_SERVER_MISCONFIGURED",
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("retries a busy manifest while preserving owner checks, omissions and abort signal", async () => {
  const subject = await prepared();
  const controller = new AbortController();
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.mocked(fetch)
    .mockResolvedValueOnce(new Response("busy", { status: 503, headers: { "retry-after": "0" } }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ manifest: subject.manifest, omitted: 3 })),
    );
  try {
    const result = await prepareOfflineSubjectPack(subject.id, {
      expectedOwnerId: scope.ownerId,
      signal: controller.signal,
    });
    expect(result.omitted).toBe(3);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [, init] of vi.mocked(fetch).mock.calls) {
      expect(init?.signal).toBe(controller.signal);
      expect(init?.headers).toEqual({ Authorization: "Bearer TEST_ONLY" });
    }
  } finally {
    vi.mocked(Math.random).mockRestore();
  }
});
it("cancelling a retry wait prevents another manifest request", async () => {
  const subject = await prepared();
  const controller = new AbortController();
  let requested!: () => void;
  const first = new Promise<void>((resolve) => {
    requested = resolve;
  });
  vi.mocked(fetch).mockImplementation(async () => {
    requested();
    return new Response("busy", { status: 503, headers: { "retry-after": "30" } });
  });
  const pending = prepareOfflineSubjectPack(subject.id, {
    expectedOwnerId: scope.ownerId,
    signal: controller.signal,
  });
  const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
  await first;
  controller.abort();
  await rejected;
  expect(fetch).toHaveBeenCalledTimes(1);
});
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
