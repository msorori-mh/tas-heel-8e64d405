import { expect, it } from "vitest";
import { readSubjectDownloads } from "../../src/lib/subjects/subject-downloads";
import { digestOfflinePackManifest } from "../../src/lib/offline/offline-pack-contract";
import {
  emptyOfflineState,
  type OfflineStateRepository,
} from "../../src/lib/offline/offline-state-store";
import { prepared, savedSubject, scope } from "../offline/settings-fixtures";

async function fixture() {
  const state = emptyOfflineState();
  state.activeOwnerId = scope.ownerId;
  state.packs = [savedSubject(await prepared()).local.record!];
  const repository = { read: async () => state } as OfflineStateRepository;
  return { state, repository, pack: state.packs[0] };
}

it("only reports the active owner's verified, semester-matching subject download", async () => {
  const { repository } = await fixture();
  expect(await readSubjectDownloads(scope.ownerId, 1, repository)).toEqual({ one: "downloaded" });
  expect(await readSubjectDownloads("another-student", 1, repository)).toEqual({});
  expect(await readSubjectDownloads(scope.ownerId, 2, repository)).toEqual({});
});

it.each(["corrupt", "stale"] as const)("never reports a %s pack as downloaded", async (status) => {
  const { repository, pack } = await fixture();
  pack.status = status;
  expect(await readSubjectDownloads(scope.ownerId, 1, repository)).toEqual({});
});

it("does not trust the ready status when some artifacts are unverified", async () => {
  const { repository, pack } = await fixture();
  pack.manifest.artifacts.push({
    ...pack.manifest.artifacts[0],
    artifactId: "another",
    relativePath: "packs/another.html",
  });
  pack.manifestSha256 = await digestOfflinePackManifest(pack.manifest);
  expect(await readSubjectDownloads(scope.ownerId, 1, repository)).toEqual({ one: "partial" });
  pack.verifiedArtifactIds = [];
  expect(await readSubjectDownloads(scope.ownerId, 1, repository)).toEqual({});
});

it("rejects a changed manifest and records belonging to another owner", async () => {
  const { repository, pack } = await fixture();
  pack.ownerId = "another-student";
  expect(await readSubjectDownloads(scope.ownerId, 1, repository)).toEqual({});
  pack.ownerId = scope.ownerId;
  pack.manifest.revision += 1;
  expect(await readSubjectDownloads(scope.ownerId, 1, repository)).toEqual({});
});

it("drops results if the active account changes during the read", async () => {
  const { state } = await fixture();
  let reads = 0;
  const repository = {
    read: async () => (++reads === 1 ? state : { ...state, activeOwnerId: "another-student" }),
  } as OfflineStateRepository;
  expect(await readSubjectDownloads(scope.ownerId, 1, repository)).toEqual({});
});
