import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getLessonFileUrl } from "@/lib/api/lesson-file.functions";

export function useLessonFileUrl(lessonId: string | null, url: string | null) {
  const fn = useServerFn(getLessonFileUrl);
  const [resolved, setResolved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    if (!lessonId || !url) {
      setResolved(null);
      return;
    }
    setLoading(true);
    setError(null);
    fn({ data: { lessonId, url } })
      .then((r) => {
        if (active) setResolved(r.url);
      })
      .catch((e) => {
        if (active) setError(e?.message ?? "failed");
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [lessonId, url, fn]);

  return { url: resolved, loading, error };
}
