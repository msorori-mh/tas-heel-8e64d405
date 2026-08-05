export interface PublishOptions {
  resourceCode: string;
  versionNumber: number;
  contentSha256: string;
  stagingPath: string;
}

export interface PublishedStorageResult {
  publishedPath: string;
  bucket: string;
  contentSha256: string;
}

/**
 * Server publish service. Calculates published path:
 * published/{resource_code}/{version_number}/{content_sha256}/index.html
 */
export function buildPublishedStoragePath(options: PublishOptions): PublishedStorageResult {
  const { resourceCode, versionNumber, contentSha256 } = options;

  const cleanCode = resourceCode.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
  if (!cleanCode || versionNumber < 1 || !contentSha256) {
    throw new Error("Invalid parameters for publishing storage path");
  }

  const publishedPath = `published/${cleanCode}/${versionNumber}/${contentSha256}`;

  return {
    publishedPath,
    bucket: "lesson-resource-published",
    contentSha256,
  };
}
