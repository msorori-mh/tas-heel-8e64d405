import { StorageClientAdapter, defaultSupabaseStorageAdapter } from "./upload-service";

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
  promoted: boolean;
  status: "promoted" | "cleanup_pending" | "failed";
  errorDetails?: string;
}

/**
 * Server publish service. Calculates published path:
 * published/{resource_code}/{version_number}/{content_sha256}
 */
export function buildPublishedStoragePath(options: PublishOptions): { publishedPath: string; bucket: string; contentSha256: string } {
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

export async function promoteStagingToPublished(
  options: PublishOptions,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter
): Promise<PublishedStorageResult> {
  const { publishedPath, bucket, contentSha256 } = buildPublishedStoragePath(options);
  const stagingBucket = "lesson-resource-drafts";

  if (!options.stagingPath || !options.stagingPath.startsWith("staging/")) {
    return {
      publishedPath,
      bucket,
      contentSha256,
      promoted: false,
      status: "failed",
      errorDetails: "Invalid staging path",
    };
  }

  try {
    // Download staging content
    const { data: stagingBytes, error: downErr } = await storageAdapter.download(stagingBucket, options.stagingPath);
    if (downErr || !stagingBytes) {
      return {
        publishedPath,
        bucket,
        contentSha256,
        promoted: false,
        status: "cleanup_pending",
        errorDetails: `Staging download failed: ${downErr?.message}`,
      };
    }

    // Upload to hash-pinned published path (no overwrite!)
    const { error: upErr } = await storageAdapter.upload(bucket, publishedPath, stagingBytes, "application/octet-stream");
    if (upErr) {
      return {
        publishedPath,
        bucket,
        contentSha256,
        promoted: false,
        status: "failed",
        errorDetails: `Published upload failed: ${upErr.message}`,
      };
    }

    return {
      publishedPath,
      bucket,
      contentSha256,
      promoted: true,
      status: "promoted",
    };
  } catch (err: any) {
    return {
      publishedPath,
      bucket,
      contentSha256,
      promoted: false,
      status: "failed",
      errorDetails: err.message,
    };
  }
}
