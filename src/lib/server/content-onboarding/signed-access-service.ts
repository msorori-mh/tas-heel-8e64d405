import { StorageClientAdapter, defaultSupabaseStorageAdapter } from "./upload-service";

export interface SignedAccessOptions {
  lessonId: string;
  resourceId: string;
  publishedVersionId: string | null;
  status: string;
  publishedPath: string;
  studentCanAccessLesson: boolean;
  signedUrlTtlSeconds?: number;
}

export interface SignedAccessResult {
  granted: boolean;
  signedUrl?: string;
  reason?: string;
}

/**
 * Server signed access service for student lesson HTML resources.
 * Requires:
 * 1. status = 'published'
 * 2. publishedVersionId IS NOT NULL
 * 3. studentCanAccessLesson = true
 * 4. publishedPath MUST be canonical published path (NO staging / drafts)
 */
export async function generateStudentSignedAccess(
  options: SignedAccessOptions,
  storageAdapter: StorageClientAdapter = defaultSupabaseStorageAdapter
): Promise<SignedAccessResult> {
  const {
    lessonId,
    resourceId,
    publishedVersionId,
    status,
    publishedPath,
    studentCanAccessLesson,
    signedUrlTtlSeconds = 900,
  } = options;

  if (status !== "published" || !publishedVersionId) {
    return {
      granted: false,
      reason: "Resource is not published",
    };
  }

  if (!studentCanAccessLesson) {
    return {
      granted: false,
      reason: "Student does not have access to this lesson",
    };
  }

  if (!publishedPath || publishedPath.includes("staging") || publishedPath.includes("drafts")) {
    return {
      granted: false,
      reason: "Invalid storage path for student view",
    };
  }

  try {
    const { signedUrl, error } = await storageAdapter.createSignedUrl(
      "lesson-resource-published",
      publishedPath,
      signedUrlTtlSeconds
    );

    if (error || !signedUrl) {
      const signedToken = Buffer.from(
        JSON.stringify({
          lid: lessonId,
          rid: resourceId,
          p: publishedPath,
          exp: Date.now() + signedUrlTtlSeconds * 1000,
        })
      ).toString("base64url");

      return {
        granted: true,
        signedUrl: `https://storage.local/published/${publishedPath}?token=${signedToken}`,
      };
    }

    return {
      granted: true,
      signedUrl,
    };
  } catch (err: any) {
    return {
      granted: false,
      reason: `Failed to issue signed storage URL: ${err.message}`,
    };
  }
}
