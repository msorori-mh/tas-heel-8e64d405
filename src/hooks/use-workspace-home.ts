import { useEffect, useState } from "react";
import { resolveWorkspaceHome } from "@/lib/auth/workspace";

export function useWorkspaceHome(userId: string | undefined, complete: boolean, enabled: boolean) {
  const [destination, setDestination] = useState<"/app" | "/academy" | "/complete-profile" | null>(
    null,
  );
  const [error, setError] = useState(false);
  useEffect(() => {
    setDestination(null);
    setError(false);
    if (!enabled || !userId) return;
    let active = true;
    resolveWorkspaceHome(userId, complete)
      .then((next) => {
        if (active) setDestination(next);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [userId, complete, enabled]);
  return { destination, error };
}
