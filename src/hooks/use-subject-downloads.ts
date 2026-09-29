import { useQuery } from "@tanstack/react-query";
import { readSubjectDownloads } from "@/lib/subjects/subject-downloads";

/** Device state stays outside the persisted server view and is isolated by account. */
export function useSubjectDownloads(ownerId: string | undefined, semester: number) {
  return (
    useQuery({
      queryKey: ["subject-downloads", ownerId, semester],
      enabled: Boolean(ownerId),
      networkMode: "always",
      staleTime: 0,
      queryFn: () => readSubjectDownloads(ownerId!, semester),
    }).data ?? {}
  );
}
