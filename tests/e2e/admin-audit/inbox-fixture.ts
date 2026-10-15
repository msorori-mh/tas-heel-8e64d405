// TEST_ONLY local fixture. Never sends a network request or touches real messages.
let read = false;
export const supabase = {
  from: () => {
    const query = {
      select: () => query,
      order: () => query,
      range: () => query,
      eq: () => query,
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({
          data: [
            {
              id: "TEST_ONLY-message",
              full_name: "طالب تجريبي",
              email: "test@example.invalid",
              subject: "استفسار تجريبي عن المحتوى",
              message: "هذه رسالة اختبار محلية للتحقق من عرض العربية وتجربة الجوال.",
              created_at: "2026-10-15T00:00:00Z",
              is_read: read,
            },
          ],
          count: 1,
          error: null,
        }).then(resolve),
      update: () => ({
        eq: () => ({
          select: () => ({
            single: async () => {
              read = true;
              return { data: { id: "TEST_ONLY-message" }, error: null };
            },
          }),
        }),
      }),
    };
    return query;
  },
};
