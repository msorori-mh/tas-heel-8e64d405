import { expect, it, vi } from "vitest";
import { isOfflineInteractiveResource } from "../../src/lib/offline/offline-inline-resource";
import { fingerprintOfflineText } from "../../src/lib/offline/offline-text-metadata";
const mocks = vi.hoisted(() => ({ caller: vi.fn() }));
vi.mock("@/lib/offline/offline-api.server", async (original) => ({
  ...(await original<object>()),
  createOfflineCaller: mocks.caller,
}));
import { Route } from "../../src/routes/api/offline-pack.artifact.$resourceId";
const id = "00000000-0000-4000-8000-000000000001";
const handlers = (Route.options as any).server.handlers;
const row = (kind = "mindmap") => ({
  lesson_id: id,
  description: "<html>محتوى تفاعلي</html>",
  title: kind,
  resource_type: kind,
  html_resource_type: kind,
  url: `lesson-internal://html/${kind}`,
  created_at: "2026-09-01T00:00:00Z",
  metadata: { cf11_render_mode: "INTERACTIVE", cf11_body_sha256: "" },
});
async function deliver(
  resource: ReturnType<typeof row>,
  allowed = true,
  ready = true,
  method = "GET",
) {
  const from = () => {
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: resource, error: null }),
    };
    return chain;
  };
  mocks.caller.mockResolvedValue({
    supabase: {
      from,
      rpc: async (name: string) => ({
        error: null,
        data:
          name === "can_access_lesson"
            ? allowed
            : {
                visible: true,
                managed: true,
                ready_capabilities: ready ? ["mindMap", "simulation"] : [],
              },
      }),
    },
  });
  return handlers[method]({
    request: new Request("https://test.invalid/artifact", { method }),
    params: {
      resourceId: `${resource.resource_type === "mindmap" ? "mind-map" : "lab-experiment"}:${id}`,
    },
  });
}
it.each(["mindmap", "experiment"])("delivers exact verified %s bytes and HEAD", async (kind) => {
  const resource = row(kind);
  resource.metadata.cf11_body_sha256 = (await fingerprintOfflineText(resource.description)).sha256;
  const response = await deliver(resource);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(resource.description);
  const head = await deliver(resource, true, true, "HEAD");
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
});
it("preserves access, ready-state and body-hash rejection", async () => {
  const resource = row();
  expect((await deliver(resource, false)).status).toBe(403);
  expect((await deliver(resource, true, false)).status).toBe(404);
  expect((await deliver(resource)).status).toBe(409);
});
it("continues rejecting network-dependent content", async () => {
  const resource = row("experiment");
  resource.description = '<iframe src="https://phet.colorado.edu/test"></iframe>';
  resource.metadata.cf11_body_sha256 = (await fingerprintOfflineText(resource.description)).sha256;
  const response = await deliver(resource);
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: "OFFLINE_REMOTE_DEPENDENCY" });
});
it("rejects missing publication mode, mismatched kinds and remote files", () => {
  expect(isOfflineInteractiveResource({ ...row(), metadata: {} })).toBe(false);
  expect(isOfflineInteractiveResource({ ...row(), html_resource_type: "experiment" })).toBe(false);
  expect(isOfflineInteractiveResource({ ...row(), url: "https://example.com/file.html" })).toBe(
    false,
  );
  expect(isOfflineInteractiveResource({ ...row(), resource_type: "link" })).toBe(false);
  expect(isOfflineInteractiveResource({ ...row(), html_resource_type: "INTERACTIVE" })).toBe(true);
});

// Synthetic payloads reproduce the measured production metadata contract.
const ironResources = await Promise.all(
  ["mindmap", "experiment"].map(async (kind) => {
    const description = `<html dir="rtl"><body>${kind}<button>اختبار</button></body></html>`;
    return {
      resource_type: kind,
      html_resource_type: kind,
      url: `lesson-internal://html/${kind}`,
      description,
      render_mode: "INTERACTIVE",
      body_sha256: (await fingerprintOfflineText(description)).sha256,
    };
  }),
);
it.each(ironResources)("delivers the published Iron $resource_type unchanged", async (source) => {
  const resource = {
    ...row(source.resource_type),
    ...source,
    metadata: { cf11_render_mode: source.render_mode, cf11_body_sha256: source.body_sha256 },
  };
  const metadata = await fingerprintOfflineText(source.description);
  expect(metadata.sha256).toBe(source.body_sha256);
  expect(metadata.remote).toBe(false);
  const response = await deliver(resource);
  expect(response.status).toBe(200);
  expect(await response.text()).toBe(source.description);
});

import { buildOfflineSubjectPack } from "../../src/lib/offline/offline-pack-manifest";
import { readOfflineLessonContent } from "../../src/lib/offline/offline-lesson-content";
import {
  registerOfflinePack,
  recordVerifiedOfflineArtifact,
} from "../../src/lib/offline/offline-pack-state";
import {
  MemoryOfflineStateAdapter,
  OfflineStateRepository,
} from "../../src/lib/offline/offline-state-store";
it("reopens both published Iron components from verified local bytes after repository recreation", async () => {
  const now = "2026-09-22T00:00:00Z";
  const { manifest, omissions } = await buildOfflineSubjectPack({
    subjectTitle: "الكيمياء",
    scope: { subjectId: id, gradeId: "grade-12", curriculumTrackId: null, semester: 1 },
    lessons: [
      {
        id,
        title: "خواص الحديد ومركباته",
        sortOrder: 4,
        updatedAt: now,
        managed: false,
        visible: true,
        readyCapabilities: {},
      },
    ],
    textSources: ironResources.map((s, index) => ({
      sourceType: s.resource_type === "mindmap" ? "mind-map" : "lab-experiment",
      sourceId: String(index),
      lessonId: id,
      title: s.resource_type,
      body: s.description,
      bodySha256: s.body_sha256,
      attestation: "body",
      updatedAt: now,
      sortOrder: index,
    })),
    textbooks: [],
  });
  expect(omissions).toEqual([]);
  const adapter = new MemoryOfflineStateAdapter();
  const repository = new OfflineStateRepository(adapter);
  const registered = await registerOfflinePack(repository, "student-test", manifest, now);
  const bytes = new Map<string, Uint8Array>();
  for (const artifact of manifest.artifacts) {
    const source = ironResources[Number(artifact.resourceId.split(":")[1])];
    const resource = {
      ...row(source.resource_type),
      ...source,
      metadata: { cf11_render_mode: source.render_mode, cf11_body_sha256: source.body_sha256 },
    };
    const response = await deliver(resource);
    expect(response.status).toBe(200);
    bytes.set(artifact.artifactId, new Uint8Array(await response.arrayBuffer()));
    await recordVerifiedOfflineArtifact(
      repository,
      {
        ownerId: "student-test",
        packId: manifest.packId,
        manifestSha256: registered.manifestSha256,
        artifactId: artifact.artifactId,
        observedSha256: artifact.sha256,
        observedBytes: artifact.byteSize,
      },
      now,
    );
  }
  const reopened = new OfflineStateRepository(adapter);
  const read = async (_owner: string, artifact: { artifactId: string }) =>
    bytes.get(artifact.artifactId) ?? null;
  const local = await readOfflineLessonContent("student-test", id, reopened, read);
  expect(local.mindMaps[0].body).toBe(
    ironResources.find((s) => s.resource_type === "mindmap")!.description,
  );
  expect(local.experiments[0].body).toBe(
    ironResources.find((s) => s.resource_type === "experiment")!.description,
  );
  const other = await readOfflineLessonContent("different-student", id, reopened, read);
  expect(other.mindMaps).toEqual([]);
  expect(other.experiments).toEqual([]);
});
