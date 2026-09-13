import { withForegroundTransfer } from "@/lib/offline/download-priority";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { InlineHtmlResourceViewer } from "./InlineHtmlResourceViewer";
import { Button } from "@/components/ui/button";

export type ExplanationRow = {
  id: string;
  title: string | null;
  content: string;
  sort_order: number;
};

/** Discover the tab without transferring the (potentially multi-MB) bodies. */
export function useLessonExplanationIndex(
  lessonId: string,
  userId: string | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["lesson-explanations-index", lessonId, userId],
    enabled: enabled && !!userId,
    queryFn: async ({ signal }) => {
      const { data, error } = await supabase
        .from("lesson_explanations")
        .select("id")
        .eq("lesson_id", lessonId)
        .not("content", "match", "^[[:space:]]*$")
        .abortSignal(signal);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Mounted by the visited tab only; returning to another tab keeps it alive. */
export function LessonExplanations({
  lessonId,
  userId,
  offlineExplanations,
}: {
  lessonId: string;
  userId: string | undefined;
  offlineExplanations: ExplanationRow[];
}) {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: ["lesson-explanations", lessonId, userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      withForegroundTransfer(async () => {
        const { data, error } = await supabase
          .from("lesson_explanations")
          .select("id,title,content,sort_order")
          .eq("lesson_id", lessonId)
          .order("sort_order")
          .abortSignal(signal);
        if (error) throw error;
        return ((data ?? []) as ExplanationRow[]).filter(
          (row) => (row.content ?? "").trim().length > 0,
        );
      }),
  });
  const explanations = data ?? offlineExplanations;
  if (explanations.length === 0) {
    if (error)
      return (
        <div role="alert" className="space-y-2 text-sm">
          <p>تعذّر تحميل الشرح. حاول مرة أخرى.</p>
          <Button variant="outline" onClick={() => void refetch()}>
            إعادة المحاولة
          </Button>
        </div>
      );
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {isPending ? "جارٍ تحميل الشرح…" : "الشرح غير متاح حالياً."}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {explanations.map((explanation) => (
        <article key={explanation.id} className="rounded-xl border border-border bg-background p-3">
          {explanation.title && (
            <h3 className="mb-1 text-sm font-semibold text-foreground">{explanation.title}</h3>
          )}
          {/<html[\s>]|<!doctype/i.test(explanation.content) ? (
            <InlineHtmlResourceViewer
              title={explanation.title || "شرح تمكين"}
              html={explanation.content}
              htmlResourceType="STATIC"
              resourceType="explanation"
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-card-foreground">
              {explanation.content}
            </p>
          )}
        </article>
      ))}
    </div>
  );
}
