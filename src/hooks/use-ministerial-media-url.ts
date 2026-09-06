import { useEffect, useState } from "react";

import {
  acquireMinisterialMediaUrl,
  describeMinisterialMediaError,
} from "@/lib/ministerial/ministerial-media-client";

export type MinisterialMediaUrlState =
  | { status: "loading"; url: null; error: null }
  | { status: "ready"; url: string; error: null }
  | { status: "error"; url: null; error: string };

/**
 * Resolves a ministerial question image to a short-lived object URL through
 * the authenticated media endpoint. Re-runs when `retryKey` changes.
 */
export function useMinisterialMediaUrl(
  mediaId: string | null | undefined,
  sessionId: string | null | undefined,
  retryKey = 0,
): MinisterialMediaUrlState {
  const [state, setState] = useState<MinisterialMediaUrlState>({
    status: "loading",
    url: null,
    error: null,
  });

  useEffect(() => {
    if (!mediaId) {
      setState({ status: "error", url: null, error: "لا توجد صورة." });
      return;
    }
    let cancelled = false;
    let release: (() => void) | null = null;
    setState({ status: "loading", url: null, error: null });
    acquireMinisterialMediaUrl(mediaId, sessionId ?? null)
      .then((handle) => {
        if (cancelled) {
          handle.release();
          return;
        }
        release = handle.release;
        setState({ status: "ready", url: handle.url, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({ status: "error", url: null, error: describeMinisterialMediaError(error) });
      });
    return () => {
      cancelled = true;
      release?.();
    };
  }, [mediaId, sessionId, retryKey]);

  return state;
}
