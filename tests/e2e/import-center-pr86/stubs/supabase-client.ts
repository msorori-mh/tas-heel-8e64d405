export interface TestOnlyUploadedBundle {
  bucket: string;
  path: string;
  token: string;
  blob: Blob;
  uploadCount: number;
}

declare global {
  // Shared only by the isolated browser preview stubs.
  // eslint-disable-next-line no-var
  var __TAMKEEN_TEST_ONLY_UPLOADED_BUNDLE__: TestOnlyUploadedBundle | undefined;
}

export const supabase = {
  storage: {
    from: (bucket: string) => ({
      uploadToSignedUrl: async (
        path: string,
        token: string,
        blob: Blob,
        options?: { contentType?: string },
      ) => {
        if (bucket !== "test-only-lesson-intake") {
          return { data: null, error: new Error("TEST_ONLY_UNEXPECTED_BUCKET") };
        }
        if (path !== "test-only/final-lesson-import.zip" || token !== "TEST_ONLY_SIGNED_TOKEN") {
          return { data: null, error: new Error("TEST_ONLY_INVALID_SIGNED_UPLOAD") };
        }
        if (!(blob instanceof Blob) || blob.size === 0 || options?.contentType !== "application/zip") {
          return { data: null, error: new Error("TEST_ONLY_INVALID_UPLOAD_BODY") };
        }
        const previous = globalThis.__TAMKEEN_TEST_ONLY_UPLOADED_BUNDLE__;
        globalThis.__TAMKEEN_TEST_ONLY_UPLOADED_BUNDLE__ = {
          bucket,
          path,
          token,
          blob,
          uploadCount: (previous?.uploadCount ?? 0) + 1,
        };
        return { data: { path }, error: null };
      },
    }),
  },
};
