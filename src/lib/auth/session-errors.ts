import { isAuthRetryableFetchError, isAuthSessionMissingError } from "@supabase/supabase-js";

/** Only a definite authentication rejection revokes the local identity. */
export function isTerminalSessionError(error: unknown): boolean {
  if (!error || isAuthRetryableFetchError(error)) return false;
  if (isAuthSessionMissingError(error)) return true;
  if (typeof error !== "object") return false;
  const status = "status" in error ? Number(error.status) : 0;
  const code = "code" in error ? String(error.code) : "";
  return (
    status === 401 ||
    status === 403 ||
    [
      "refresh_token_not_found",
      "refresh_token_already_used",
      "session_not_found",
      "session_expired",
      "user_banned",
      "user_not_found",
      "bad_jwt",
    ].includes(code)
  );
}
