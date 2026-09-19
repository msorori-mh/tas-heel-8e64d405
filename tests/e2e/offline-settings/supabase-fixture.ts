// TEST_ONLY: same-origin intercepted catalog; no Supabase project.
export const supabase = {
  auth: {
    getSession: async () => ({
      data: { session: { user: { id: "student-a" }, access_token: "TEST_ONLY" } },
    }),
  },
  from(table: string) {
    let grade = "";
    return {
      select() {
        return this;
      },
      eq(_key: string, value: string) {
        grade = value;
        return this;
      },
      order() {
        return this;
      },
      async abortSignal(signal: AbortSignal) {
        const response = await fetch(`/test-only/${table}?grade=${encodeURIComponent(grade)}`, {
          signal,
        });
        return { data: await response.json(), error: null };
      },
    };
  },
};
