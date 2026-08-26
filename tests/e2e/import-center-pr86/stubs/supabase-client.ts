export interface TestOnlyDirectFile {
  storagePath: string;
  contentType: string;
  file: Blob;
}

declare global {
  // Shared only by the isolated browser preview stubs.
  // eslint-disable-next-line no-var
  var __TAMKEEN_TEST_ONLY_DIRECT_FILES__: Map<string, TestOnlyDirectFile> | undefined;
  // eslint-disable-next-line no-var
  var __TAMKEEN_TEST_ONLY_DIRECT_STAGE__:
    | {
        intakeId: string;
        fileCount: number;
        totalBytes: number;
        lessonZipCreatedOrUploaded: false;
      }
    | undefined;
}

export const supabase = {
  storage: {
    from: (bucket: string) => ({
      uploadToSignedUrl: async (
        storagePath: string,
        token: string,
        file: Blob,
        options?: { contentType?: string },
      ) => {
        if (bucket !== "test-only-direct-intake") {
          return { data: null, error: new Error("TEST_ONLY_UNEXPECTED_BUCKET") };
        }
        const prefix = "test-only/00000000-0000-4000-8000-000000000086/";
        if (
          !storagePath.startsWith(prefix) ||
          token !== `TEST_ONLY:${storagePath.slice(prefix.length)}`
        ) {
          return { data: null, error: new Error("TEST_ONLY_INVALID_SIGNED_UPLOAD") };
        }
        if (!(file instanceof Blob) || file.size === 0 || !options?.contentType) {
          return { data: null, error: new Error("TEST_ONLY_INVALID_UPLOAD_BODY") };
        }
        if (storagePath.endsWith(".zip") || options.contentType === "application/zip") {
          return { data: null, error: new Error("TEST_ONLY_LESSON_ZIP_FORBIDDEN") };
        }
        const logicalPath = storagePath.slice(prefix.length);
        const files = globalThis.__TAMKEEN_TEST_ONLY_DIRECT_FILES__ ?? new Map();
        if (files.has(logicalPath))
          return { data: null, error: new Error("TEST_ONLY_DUPLICATE_UPLOAD") };
        files.set(logicalPath, { storagePath, contentType: options.contentType, file });
        globalThis.__TAMKEEN_TEST_ONLY_DIRECT_FILES__ = files;
        return { data: { path: storagePath }, error: null };
      },
    }),
  },
};
