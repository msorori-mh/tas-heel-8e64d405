export type CurriculumTrack = "sanaa" | "aden";
export type SemesterScope = "s1" | "s2" | "full_year";

export type OfflinePackageScope = {
  gradeId: string;
  curriculumTrack?: CurriculumTrack | null;
  semester?: SemesterScope | null;
  subjectId?: string | null;
};

export type OfflineContentKind =
  | "catalog"
  | "subject"
  | "unit"
  | "lesson"
  | "lesson_component"
  | "book_question"
  | "self_test"
  | "ministerial_exam"
  | "review_index";

export type OfflinePackageEntry = {
  contentKey: string;
  kind: OfflineContentKind;
  version: string;
  checksum?: string | null;
  payload: Record<string, string | number | boolean | null | unknown[]>;
};

export type OfflineFileAsset = {
  assetId: string;
  ownerContentKey: string;
  fileKind: "pdf" | "html" | "image" | "mind_map" | "other";
  version: string;
  byteSize: number | null;
  checksum?: string | null;
};

export type OfflineContentPackage = {
  packageId: string;
  schemaVersion: 1;
  revision: string;
  generatedAt: string;
  scope: OfflinePackageScope;
  entries: OfflinePackageEntry[];
  assets: OfflineFileAsset[];
};

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,239}$/;
const REVISION_RE = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/;

function assertId(value: string, field: string): void {
  if (!ID_RE.test(value)) throw new Error(`offline_package_invalid_${field}`);
}

function assertRevision(value: string): void {
  if (!REVISION_RE.test(value)) throw new Error("offline_package_invalid_revision");
}

export function buildOfflineScopeKey(scope: OfflinePackageScope): string {
  assertId(scope.gradeId, "grade");
  if (scope.subjectId) assertId(scope.subjectId, "subject");
  const track = scope.curriculumTrack ?? "shared";
  const semester = scope.semester ?? "full_year";
  return ["grade", scope.gradeId, "track", track, "semester", semester, "subject", scope.subjectId ?? "all"].join(
    ":",
  );
}

export function validateOfflineContentPackage(pkg: OfflineContentPackage): OfflineContentPackage {
  assertId(pkg.packageId, "id");
  assertRevision(pkg.revision);
  if (pkg.schemaVersion !== 1) throw new Error("offline_package_schema_unsupported");
  buildOfflineScopeKey(pkg.scope);

  const contentKeys = new Set<string>();
  for (const entry of pkg.entries) {
    assertId(entry.contentKey, "content_key");
    assertRevision(entry.version);
    if (contentKeys.has(entry.contentKey)) throw new Error("offline_package_duplicate_content_key");
    contentKeys.add(entry.contentKey);
  }

  const assetIds = new Set<string>();
  for (const asset of pkg.assets) {
    assertId(asset.assetId, "asset_id");
    assertId(asset.ownerContentKey, "asset_owner");
    assertRevision(asset.version);
    if (!contentKeys.has(asset.ownerContentKey)) {
      throw new Error("offline_package_asset_owner_missing");
    }
    if (asset.byteSize !== null && (!Number.isSafeInteger(asset.byteSize) || asset.byteSize < 0)) {
      throw new Error("offline_package_invalid_asset_size");
    }
    if (assetIds.has(asset.assetId)) throw new Error("offline_package_duplicate_asset_id");
    assetIds.add(asset.assetId);
  }

  return pkg;
}

export function estimateOfflinePackageBytes(pkg: OfflineContentPackage): {
  knownBytes: number;
  unknownAssets: number;
} {
  let knownBytes = 0;
  let unknownAssets = 0;
  for (const asset of pkg.assets) {
    if (asset.byteSize === null) unknownAssets += 1;
    else knownBytes += asset.byteSize;
  }
  return { knownBytes, unknownAssets };
}

export function isOfflinePackageForSubject(
  pkg: OfflineContentPackage,
  subjectId: string,
): boolean {
  return pkg.scope.subjectId === subjectId;
}
