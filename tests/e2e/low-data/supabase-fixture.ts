// TEST_ONLY: isolated reader fixture has no production service connection.
export const supabase = {
  auth: { getSession: async () => ({ data: { session: { access_token: "TEST_ONLY" } } }) },
};
