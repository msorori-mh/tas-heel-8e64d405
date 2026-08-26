const TEST_INTAKE_ID = "00000000-0000-4000-8000-000000000086";

function declarations(manifest: any) {
  return [
    ...manifest.artifacts.flatMap((artifact: any) => [
      artifact.sourcePath && { path: artifact.sourcePath, sha256: artifact.sha256 },
      artifact.provenancePath && {
        path: artifact.provenancePath,
        sha256: artifact.provenanceSha256,
      },
    ]),
    ...(manifest.assets ?? []).map((asset: any) => ({ path: asset.path, sha256: asset.sha256 })),
    manifest.security.answersCompanionPath && {
      path: manifest.security.answersCompanionPath,
      sha256: manifest.security.answersCompanionSha256,
    },
  ].filter(Boolean);
}

export async function createGoldenLessonDirectUpload({ data }: { data: { manifest: any } }) {
  return {
    bucket: "test-only-direct-intake",
    intakeId: TEST_INTAKE_ID,
    uploads: declarations(data.manifest).map((file: any) => ({
      logicalPath: file.path,
      sha256: file.sha256,
      storagePath: `test-only/${TEST_INTAKE_ID}/${file.path}`,
      token: `TEST_ONLY:${file.path}`,
    })),
  };
}

export async function verifyAndStageGoldenLessonDirect({
  data,
}: {
  data: { intakeId: string; manifest: any };
}) {
  if (data.intakeId !== TEST_INTAKE_ID) throw new Error("TEST_ONLY_INTAKE_ID_MISMATCH");
  const expected = declarations(data.manifest);
  const uploaded = globalThis.__TAMKEEN_TEST_ONLY_DIRECT_FILES__;
  if (!uploaded || uploaded.size !== expected.length)
    throw new Error("TEST_ONLY_DIRECT_FILE_SET_MISMATCH");
  if (data.manifest.schema !== "tamkeen.golden-lesson-package.v1")
    throw new Error("TEST_ONLY_SCHEMA_MISMATCH");
  if (
    data.manifest.lifecycle?.initialStatus !== "DRAFT" ||
    data.manifest.lifecycle?.allowDirectReady !== false
  ) {
    throw new Error("TEST_ONLY_DRAFT_FAIL_CLOSED_REQUIRED");
  }
  if (
    data.manifest.security?.productionApply !== false ||
    data.manifest.security?.publicPayloadContainsAnswers !== false
  ) {
    throw new Error("TEST_ONLY_SECURITY_CONTRACT_MISMATCH");
  }
  let totalBytes = 0;
  for (const file of expected) {
    const entry = uploaded.get(file.path);
    if (!entry) throw new Error(`TEST_ONLY_DIRECT_FILE_MISSING:${file.path}`);
    if (entry.storagePath.endsWith(".zip") || entry.contentType === "application/zip") {
      throw new Error("TEST_ONLY_LESSON_ZIP_FORBIDDEN");
    }
    totalBytes += entry.file.size;
  }
  globalThis.__TAMKEEN_TEST_ONLY_DIRECT_STAGE__ = {
    intakeId: data.intakeId,
    fileCount: expected.length,
    totalBytes,
    lessonZipCreatedOrUploaded: false,
  };
  return {
    version: 1,
    status: "DRAFT" as const,
    idempotent: false,
    verifiedFileCount: expected.length,
    domainWritesPerformed: 0,
  };
}
