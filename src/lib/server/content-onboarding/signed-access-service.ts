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
 * Rejects Draft/Staging/In-review/Approved/Rejected/Archived.
 */
export function generateStudentSignedAccess(options: SignedAccessOptions): SignedAccessResult {
  const {
    lessonId,
    resourceId,
    publishedVersionId,
    status,
    publishedPath,
    studentCanAccessLesson,
    signedUrlTtlSeconds = 900, // 15 min TTL
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

  if (!publishedPath || publishedPath.includes("staging")) {
    return {
      granted: false,
      reason: "Invalid storage path for student view",
    };
  }

  // Issue short-lived access URL/token
  const mockToken = Buffer.from(
    JSON.stringify({
      lid: lessonId,
      rid: resourceId,
      p: publishedPath,
      exp: Date.now() + signedUrlTtlSeconds * 1000,
    })
  ).toString("base64url");

  return {
    granted: true,
    signedUrl: `/api/signed-resource/${mockToken}`,
  };
}
