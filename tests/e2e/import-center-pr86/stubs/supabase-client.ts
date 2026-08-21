export const supabase = {
  storage: {
    from: () => ({
      uploadToSignedUrl: async () => ({
        error: new Error("TEST_ONLY_PREVIEW_SERVER_WRITE_DISABLED"),
      }),
    }),
  },
};

