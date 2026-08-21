import JSZip from "jszip";

const TEST_PATH = "test-only/final-lesson-import.zip";

export async function createGoldenLessonBundleUpload() {
  return {
    bucket: "test-only-lesson-intake",
    path: TEST_PATH,
    token: "TEST_ONLY_SIGNED_TOKEN",
  };
}

export async function verifyAndStageGoldenLessonBundle({ data }: { data: { path: string } }) {
  const uploaded = globalThis.__TAMKEEN_TEST_ONLY_UPLOADED_BUNDLE__;
  if (!uploaded || uploaded.path !== data.path || data.path !== TEST_PATH) {
    throw new Error("TEST_ONLY_BUNDLE_NOT_UPLOADED");
  }
  if (uploaded.uploadCount !== 1) throw new Error("TEST_ONLY_UPLOAD_MUST_BE_EXACTLY_ONCE");

  const zip = await JSZip.loadAsync(await uploaded.blob.arrayBuffer());
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);
  const manifestEntry = zip.file("manifest.json");
  if (!manifestEntry) throw new Error("TEST_ONLY_MANIFEST_MISSING");
  const manifest = JSON.parse(await manifestEntry.async("string"));
  if (manifest.schema !== "tamkeen.golden-lesson-package.v1") {
    throw new Error("TEST_ONLY_SCHEMA_MISMATCH");
  }
  if (manifest.lifecycle?.initialStatus !== "DRAFT" || manifest.lifecycle?.allowDirectReady !== false) {
    throw new Error("TEST_ONLY_DRAFT_FAIL_CLOSED_REQUIRED");
  }
  if (manifest.security?.productionApply !== false || manifest.security?.publicPayloadContainsAnswers !== false) {
    throw new Error("TEST_ONLY_SECURITY_CONTRACT_MISMATCH");
  }

  const declaredPaths = [
    ...manifest.artifacts.flatMap((artifact: { sourcePath?: string | null; provenancePath?: string | null }) =>
      [artifact.sourcePath, artifact.provenancePath].filter(Boolean)),
    manifest.security.answersCompanionPath,
    ...(manifest.assets ?? []).map((asset: { path: string }) => asset.path),
  ].filter(Boolean);
  for (const declaredPath of declaredPaths) {
    if (!zip.file(declaredPath)) throw new Error(`TEST_ONLY_DECLARED_FILE_MISSING:${declaredPath}`);
  }

  return {
    version: 1,
    status: "DRAFT" as const,
    idempotent: false,
    verifiedFileCount: entries.length,
    domainWritesPerformed: 0,
  };
}
