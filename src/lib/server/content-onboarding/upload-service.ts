export interface IssueUploadOptions {
  actorId: string;
  batchId: string;
  resourceCode: string;
  filename: string;
}

export interface IssuedUploadSession {
  uploadSessionId: string;
  stagingPath: string;
  bucket: string;
  expiresInSeconds: number;
}

/**
 * Server upload service. Issues staging path and upload session info.
 * Enforces ownership prefix: staging/{actor_id}/{batch_id}/{upload_session_id}/{filename}
 */
export function issueServerUploadSession(options: IssueUploadOptions): IssuedUploadSession {
  const { actorId, batchId, resourceCode, filename } = options;

  if (!actorId || !batchId) {
    throw new Error("Actor ID and Batch ID are required for issuing upload");
  }

  // Normalize & sanitize resourceCode and filename
  const cleanCode = resourceCode.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase();
  const cleanFilename = filename.replace(/[/\\]|\.\./g, "");

  if (!cleanCode || cleanCode.length < 3) {
    throw new Error("Invalid resource code format");
  }

  if (!cleanFilename || cleanFilename.length === 0) {
    throw new Error("Invalid filename format");
  }

  const uploadSessionId = crypto.randomUUID();
  const stagingPath = `staging/${actorId}/${batchId}/${uploadSessionId}/${cleanFilename}`;

  return {
    uploadSessionId,
    stagingPath,
    bucket: "lesson-resource-drafts",
    expiresInSeconds: 3600, // 1 hour token
  };
}
