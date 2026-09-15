import { AuthApiError, AuthRetryableFetchError, type User } from "@supabase/supabase-js";
import { expect, test } from "vitest";
import { getRestoredUser } from "@/lib/auth/restored-user";
test("a transport failure keeps the caller on retry instead of requesting Google again", async () => {
  await expect(
    getRestoredUser({
      getUser: async () => ({
        data: { user: null },
        error: new AuthRetryableFetchError("unavailable", 503),
      }),
    }),
  ).rejects.toThrow("أعد المحاولة");
});
test("a genuinely rejected or signed-out session cannot enter the protected route", async () => {
  expect(
    await getRestoredUser({
      getUser: async () => ({
        data: { user: null },
        error: new AuthApiError("invalid session", 401),
      }),
    }),
  ).toBeNull();
});
test("a server-verified user can enter the protected route", async () => {
  const user = { id: "fixture-owner" } as User;
  expect(await getRestoredUser({ getUser: async () => ({ data: { user }, error: null }) })).toBe(
    user,
  );
});
