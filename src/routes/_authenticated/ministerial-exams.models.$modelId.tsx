import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { StateMessage } from "@/components/student/StudentNav";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import { Button } from "@/components/ui/button";
import {
  fetchMinisterialModelOverview,
  formatDuration,
  mapMinisterialError,
  roundLabel,
  startMinisterialSession,
} from "@/lib/ministerial/ministerial-student-api";
import { createSingleFlightGuard } from "@/lib/exam-client-safety";
import { Clock, ListChecks, GraduationCap, Timer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/ministerial-exams/models/$modelId")({
  head: () => ({
    meta: [
      { title: "تفاصيل النموذج الوزاري — تمكين" },
      {
        name: "description",
        content: "تفاصيل النموذج الوزاري وعدد الأسئلة والمدة قبل بدء التدريب أو المحاكاة.",
      },
      { property: "og:title", content: "تفاصيل النموذج الوزاري — تمكين" },
      { property: "og:description", content: "ابدأ التدريب أو محاكاة الاختبار الحقيقي." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MinisterialModelDetails,
});

function MinisterialModelDetails() {
  const { modelId } = Route.useParams();
  const navigate = useNavigate();
  const guard = useRef(createSingleFlightGuard());
  const [starting, setStarting] = useState<"training" | "strict" | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["ministerial-model", modelId],
    queryFn: () => fetchMinisterialModelOverview(modelId),
  });

  async function start(mode: "training" | "strict") {
    if (!guard.current.enter()) return;
    setStarting(mode);
    setStartError(null);
    try {
      const existing =
        data?.last_session_status === "in_progress" ? (data.last_session_id ?? null) : null;
      const sessionId = existing ?? (await startMinisterialSession(modelId));
      await navigate({
        to: "/ministerial-exams/sessions/$sessionId",
        params: { sessionId },
        search: { mode },
      });
    } catch (err) {
      setStartError(mapMinisterialError(err));
    } finally {
      setStarting(null);
      guard.current.leave();
    }
  }

  if (isLoading) return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;
  if (error || !data)
    return <StateMessage variant="error">{mapMinisterialError(error)}</StateMessage>;

  const duration = formatDuration(data.duration_seconds);

  return (
    <div className="space-y-4 pb-6" dir="rtl">
      <Breadcrumbs
        items={[
          { label: "النماذج الوزارية", to: "/ministerial-exams" },
          {
            label: data.subject_name,
            to: "/ministerial-exams/$subjectId",
            params: { subjectId: data.subject_id },
          },
          { label: String(data.academic_year) },
        ]}
      />

      <section className="rounded-2xl border border-primary/15 bg-card p-4 shadow-sm sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-hero-gradient">
            <GraduationCap className="h-5 w-5 text-primary-foreground" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-foreground sm:text-xl">
              {data.subject_name} — وزاري {data.track_name} {data.academic_year}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {roundLabel(data.round_code)}
              {data.model_label ? ` — ${data.model_label}` : ""}
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" aria-hidden /> عدد الأسئلة
            </dt>
            <dd className="mt-1 font-semibold text-foreground">{data.question_count}</dd>
          </div>
          <div className="rounded-xl border border-border bg-muted/40 p-3">
            <dt className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3.5 w-3.5" aria-hidden /> المدة
            </dt>
            <dd className="mt-1 font-semibold text-foreground">{duration ?? "غير محددة"}</dd>
          </div>
        </dl>

        <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 text-xs leading-6 text-muted-foreground">
          <p className="font-semibold text-foreground">تعليمات الاختبار</p>
          <ul className="mt-1 list-disc pr-4">
            <li>وضع التدريب: بدون مؤقت، يمكنك التنقل بين الأسئلة بحرية.</li>
            <li>وضع المحاكاة: مؤقت زمني وشاشة أسئلة كاملة كما في الاختبار الحقيقي.</li>
            <li>تُحفظ إجاباتك على الخادم فور اختيارها؛ تأكد من استقرار الاتصال.</li>
          </ul>
        </div>

        {data.last_session_status === "in_progress" && (
          <p className="mt-3 text-xs text-primary">لديك محاولة جارية على هذا النموذج وسيتم متابعتها.</p>
        )}

        {startError && (
          <p className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {startError}
          </p>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Button onClick={() => start("training")} disabled={starting !== null}>
            {starting === "training" ? "جارٍ التحضير…" : "التدريب على النموذج"}
          </Button>
          <Button
            variant="outline"
            onClick={() => start("strict")}
            disabled={starting !== null}
            className="gap-1"
          >
            <Timer className="h-4 w-4" aria-hidden />
            {starting === "strict" ? "جارٍ التحضير…" : "محاكاة الاختبار الحقيقي"}
          </Button>
        </div>
      </section>

      <Link
        to="/ministerial-exams/$subjectId"
        params={{ subjectId: data.subject_id }}
        className="inline-block text-sm text-muted-foreground underline underline-offset-4"
      >
        العودة إلى نماذج المادة
      </Link>
    </div>
  );
}
