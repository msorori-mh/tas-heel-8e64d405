import {
  isAuthRetryableFetchError,
  type Session,
  type UserResponse,
} from "@supabase/supabase-js";

type RestorableAuth = {
  getUser(): Promise<UserResponse>;
  getSession?: () => Promise<{ data: { session: Session | null }; error: Error | null }>;
};

/**
 * Restore the persisted account without turning a temporary network/backend
 * outage into a fresh Google-login requirement.
 *
 * The persisted Supabase session is only a navigation/bootstrap hint. Remote
 * data still remains protected by Supabase/RLS and the SDK refresh lifecycle.
 */
export async function getRestoredUser(auth: RestorableAuth) {
  let persistedUser = null as Session["user"] | null;

  if (auth.getSession) {
    try {
      const { data } = await auth.getSession();
      persistedUser = data.session?.user ?? null;
    } catch {
      // Validation below remains authoritative when storage bootstrap itself fails.
    }
  }

  const { data, error } = await auth.getUser();
  if (error && isAuthRetryableFetchError(error)) {
    if (persistedUser) return persistedUser;
    throw new Error("تعذر التحقق من جلستك بسبب الاتصال. أعد المحاولة دون تسجيل دخول جديد.");
  }
  return error ? null : data.user;
}
