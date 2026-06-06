import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StateMessage } from "@/components/student/StudentNav";
import { useLessonFileUrl } from "@/hooks/use-lesson-file-url";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Video, FlaskConical, Link as LinkIcon } from "lucide-react";

export const Route = createFileRoute("/_authenticated/lessons/$lessonId")({
  component: LessonPage,
});

type Resource = {
  id: string;
  resource_type: string;
  title: string;
  url: string;
  description: string | null;
  sort_order: number;
};
type LessonPayload = {
  error?: "forbidden" | "not_found";
  lesson?: {
    id: string;
    title: string;
    subject_id: string;
    content_text: string | null;
    content_pdf_url: string | null;
    video_url: string | null;
  };
  book?: { content: string | null; pdf_url: string | null } | null;
  summary?: { summary: string | null; key_points: string[] | null; study_tip: string | null } | null;
  explanations?: { id: string; title: string; content: string }[];
  resources?: Resource[];
};

function LessonPage() {
  const { lessonId } = Route.useParams();
  const router = useRouter();

  const { data, isLoading, error } = useQuery({
    queryKey: ["lesson-full", lessonId],
    queryFn: async (): Promise<LessonPayload> => {
      const { data, error } = await supabase.rpc("get_lesson_full_content", {
        _lesson_id: lessonId,
      });
      if (error) throw error;
      return (data ?? {}) as LessonPayload;
    },
  });

  if (isLoading) return <StateMessage variant="loading">جارٍ تحميل الدرس…</StateMessage>;
  if (error)
    return <StateMessage variant="error">تعذّر تحميل الدرس. حاول مجدداً.</StateMessage>;

  if (data?.error === "forbidden") {
    return (
      <div className="space-y-4">
        <StateMessage variant="error">
          هذا الدرس غير متاح ضمن اشتراكك أو مسارك الحالي.
        </StateMessage>
        <Button variant="outline" onClick={() => router.history.back()}>
          <ArrowRight className="ml-2 h-4 w-4" /> رجوع
        </Button>
      </div>
    );
  }
  if (data?.error === "not_found" || !data?.lesson) {
    return (
      <div className="space-y-4">
        <StateMessage>الدرس غير موجود.</StateMessage>
        <Button variant="outline" onClick={() => router.history.back()}>
          <ArrowRight className="ml-2 h-4 w-4" /> رجوع
        </Button>
      </div>
    );
  }

  const lesson = data.lesson;
  const bookPdf = data.book?.pdf_url ?? lesson.content_pdf_url ?? null;
  const bookContent = data.book?.content ?? lesson.content_text ?? null;
  const resources = data.resources ?? [];

  return (
    <article className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold text-foreground">{lesson.title}</h1>
      </header>

      {bookContent && (
        <section className="rounded-xl border border-border bg-card p-4 shadow-card">
          <h2 className="mb-2 text-base font-bold">المحتوى</h2>
          <div className="whitespace-pre-wrap text-sm leading-relaxed text-card-foreground">
            {bookContent}
          </div>
        </section>
      )}

      {bookPdf && <SecureFileBlock lessonId={lessonId} url={bookPdf} kind="pdf" title="كتاب الدرس (PDF)" />}

      {lesson.video_url && (
        <SecureFileBlock lessonId={lessonId} url={lesson.video_url} kind="video" title="فيديو الدرس" />
      )}

      {data.summary?.summary && (
        <section className="rounded-xl border border-border bg-card p-4 shadow-card">
          <h2 className="mb-2 text-base font-bold">ملخص الدرس</h2>
          <p className="text-sm leading-relaxed">{data.summary.summary}</p>
          {data.summary.key_points && data.summary.key_points.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pr-5 text-sm">
              {data.summary.key_points.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          )}
          {data.summary.study_tip && (
            <p className="mt-3 rounded-md bg-accent/10 p-2 text-xs text-accent-foreground">
              💡 {data.summary.study_tip}
            </p>
          )}
        </section>
      )}

      {data.explanations && data.explanations.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold">شروحات الدرس</h2>
          {data.explanations.map((e) => (
            <div key={e.id} className="rounded-xl border border-border bg-card p-4 shadow-card">
              <h3 className="mb-1 font-semibold">{e.title}</h3>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{e.content}</div>
            </div>
          ))}
        </section>
      )}

      {resources.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-bold">موارد الدرس</h2>
          <ul className="space-y-2">
            {resources.map((r) => (
              <ResourceItem key={r.id} lessonId={lessonId} resource={r} />
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function ResourceIcon({ type }: { type: string }) {
  if (type === "pdf") return <FileText className="h-5 w-5 text-primary" />;
  if (type === "video") return <Video className="h-5 w-5 text-primary" />;
  if (type === "experiment") return <FlaskConical className="h-5 w-5 text-primary" />;
  return <LinkIcon className="h-5 w-5 text-primary" />;
}

function ResourceItem({ lessonId, resource }: { lessonId: string; resource: Resource }) {
  const { url, loading, error } = useLessonFileUrl(lessonId, resource.url);
  const href = url ?? "#";
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (!url) e.preventDefault();
        }}
        className="flex items-center justify-between rounded-lg border border-border bg-card p-3 shadow-card hover:bg-secondary/40"
      >
        <div className="flex items-center gap-3">
          <ResourceIcon type={resource.resource_type} />
          <div>
            <div className="text-sm font-semibold">{resource.title}</div>
            {resource.description && (
              <div className="text-xs text-muted-foreground">{resource.description}</div>
            )}
            {loading && <div className="text-xs text-muted-foreground">جارٍ التجهيز…</div>}
            {error && <div className="text-xs text-destructive">تعذّر فتح الملف</div>}
          </div>
        </div>
      </a>
    </li>
  );
}

function SecureFileBlock({
  lessonId,
  url,
  kind,
  title,
}: {
  lessonId: string;
  url: string;
  kind: "pdf" | "video";
  title: string;
}) {
  const { url: resolved, loading, error } = useLessonFileUrl(lessonId, url);

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-card">
      <h2 className="mb-2 text-base font-bold">{title}</h2>
      {loading && <StateMessage variant="loading">جارٍ تجهيز الملف…</StateMessage>}
      {error && <StateMessage variant="error">تعذّر فتح الملف.</StateMessage>}
      {resolved && kind === "video" && (
        <video src={resolved} controls className="w-full rounded-lg" />
      )}
      {resolved && kind === "pdf" && (
        <div className="space-y-2">
          <iframe
            src={resolved}
            title={title}
            className="h-[60vh] w-full rounded-lg border border-border"
          />
          <a
            href={resolved}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-primary hover:underline"
          >
            فتح في تبويب جديد
          </a>
        </div>
      )}
    </section>
  );
}
