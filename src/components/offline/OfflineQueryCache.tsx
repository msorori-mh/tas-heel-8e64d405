import { useEffect } from "react";
import { dehydrate, hydrate, useQueryClient, type DehydratedState } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { readOfflineView, saveOfflineView } from "@/lib/offline/offline-view-cache";

// Display-only data used by the ORIGINAL dashboard and subjects navigation.
// Never persist role/subscription checks, answer keys or admin queries.
const allowed = new Set([
  "home-stats",
  "home-continue",
  "home-badges",
  "semester-subjects",
  "subject-meta",
  "subject-index",
  "subject-progress",
]);
export function OfflineQueryCache() {
  const { user, isContentStaff, loading } = useAuth();
  const client = useQueryClient();
  useEffect(() => {
    if (!user || loading || isContentStaff) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    void readOfflineView<DehydratedState>(user.id, "student-queries")
      .then((saved) => {
        if (!active) return;
        if (saved) hydrate(client, saved);
        unsubscribe = client.getQueryCache().subscribe((event) => {
          if (event.type !== "updated" || event.action.type !== "success" || !navigator.onLine)
            return;
          clearTimeout(timer);
          timer = setTimeout(() => {
            const snapshot = dehydrate(client, {
              shouldDehydrateMutation: () => false,
              shouldDehydrateQuery: (query) =>
                query.state.status === "success" && allowed.has(String(query.queryKey[0])),
            });
            if (active)
              void saveOfflineView(user.id, "student-queries", snapshot).catch(() => undefined);
          }, 250);
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, [client, user?.id, isContentStaff, loading]);
  return null;
}
