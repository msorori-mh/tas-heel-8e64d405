export const supabaseUrl = "https://academy.test";
export const supabaseKey = "public-test-key";
export const academySupabase = {
  auth: {
    getSession: async () => ({
      data: { session: { user: { id: "teacher-a" }, access_token: "bound-teacher-token" } },
    }),
    getUser: async () => ({ data: { user: { id: "teacher-a" } } }),
  },
};
