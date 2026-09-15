import { isAuthRetryableFetchError, type UserResponse } from "@supabase/supabase-js";

/** A transport outage is not evidence that the saved account has signed out. */
export async function getRestoredUser(auth: { getUser(): Promise<UserResponse> }) {
  const { data, error } = await auth.getUser();
  if (error && isAuthRetryableFetchError(error))
    throw new Error("تعذر التحقق من جلستك بسبب الاتصال. أعد المحاولة دون تسجيل دخول جديد.");
  return error ? null : data.user;
}
