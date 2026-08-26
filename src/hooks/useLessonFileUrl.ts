"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type LessonFileKind = "video" | "pdf" | "resource";

interface Options {
  lessonId: string | null | undefined;
  kind: LessonFileKind;
  resourceId?: string | null;
  /** Whether to fetch immediately. Defaults to true. */
  enabled?: boolean;
}

interface State {
  url: string | null;
  isExternal: boolean;
  loading: boolean;
  error: string | null;
}

interface LessonFileUrlResponse {
  signed_url?: string;
  external_url?: string;
  expires_in?: number;
  error?: string;
}

/**
 * Fetches a short-lived signed URL for a lesson file from the
 * `get-lesson-file-url` edge function, and auto-refreshes before expiry.
 *
 * NOTE: This is the legacy (old-project) version that calls the Edge Function.
 * The current project prefers `use-lesson-file-url.ts` which uses
 * `createServerFn` via TanStack Start. Keep this file for reference/reuse
 * audits only; do not import it in new code.
 */
export function useLessonFileUrl({ lessonId, kind, resourceId, enabled = true }: Options) {
  const [state, setState] = useState<State>({
    url: null,
    isExternal: false,
    loading: !!enabled && !!lessonId,
    error: null,
  });
  const timerRef = useRef<number | null>(null);

  const fetchUrl = useCallback(async () => {
    if (!lessonId || !enabled) return;
    setState((s) => ({ ...s, loading: true, error: null }));
    const { data, error } = await supabase.functions.invoke("get-lesson-file-url", {
      body: { lesson_id: lessonId, kind, resource_id: resourceId ?? null },
    });
    if (error) {
      setState({
        url: null,
        isExternal: false,
        loading: false,
        error: error.message || "fetch_failed",
      });
      return;
    }
    const response = data as LessonFileUrlResponse | null;
    const signed = response?.signed_url;
    const external = response?.external_url;
    const ttl = response?.expires_in ?? 0;

    if (external) {
      setState({ url: external, isExternal: true, loading: false, error: null });
      return;
    }
    if (signed) {
      setState({ url: signed, isExternal: false, loading: false, error: null });
      // Refresh ~60s before expiry, minimum 30s.
      if (timerRef.current) window.clearTimeout(timerRef.current);
      const refreshIn = Math.max((ttl - 60) * 1000, 30_000);
      timerRef.current = window.setTimeout(() => void fetchUrl(), refreshIn);
      return;
    }
    setState({
      url: null,
      isExternal: false,
      loading: false,
      error: response?.error || "no_url",
    });
  }, [lessonId, kind, resourceId, enabled]);

  useEffect(() => {
    void fetchUrl();
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [fetchUrl]);

  return { ...state, refresh: fetchUrl };
}
