import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./use-auth";
import { useConnectivity } from "./use-connectivity";
import { readStudentView, rememberStudentView } from "@/lib/offline/student-shell-cache";

/** Only used for presentation queries explicitly approved for local persistence. */
export function useStudentView<T>(options: {
  queryKey: readonly unknown[];
  queryFn: () => Promise<T>;
  offline: () => Promise<T>;
  enabled?: boolean;
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
}) {
  const { user } = useAuth();
  const online = useConnectivity();
  return useQuery({
    ...options,
    enabled: !!user?.id && options.enabled !== false,
    queryKey: [...options.queryKey, "student-view", user?.id, online],
    networkMode: "always",
    queryFn: async () => {
      if (!online) {
        const saved = await readStudentView<T>(user!.id, options.queryKey);
        return saved ?? (await options.offline());
      }
      try {
        const data = await options.queryFn();
        await rememberStudentView(user!.id, options.queryKey, data).catch(() => undefined);
        return data;
      } catch (error) {
        const saved = await readStudentView<T>(user!.id, options.queryKey);
        if (saved !== undefined) return saved;
        const offline = await options.offline();
        if (offline !== undefined) return offline;
        throw error;
      }
    },
  });
}
