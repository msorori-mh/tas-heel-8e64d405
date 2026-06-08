import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { StateMessage } from "@/components/student/StudentNav";
import { Button } from "@/components/ui/button";
import { Home } from "lucide-react";
import {
  ExamResultView,
  type ExamSessionState,
} from "@/components/exams/ExamResultView";

export const Route = createFileRoute(
  "/_authenticated/exams/history/$sessionId",
)({
  component: ExamHistoryDetailPage,
});

function ExamHistoryDetailPage() {
  const { sessionId } = Route.useParams();

  const query = useQuery({
    queryKey: ["exam-session-state", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_exam_session_state", {
        _session_id: sessionId,
      });
      if (error) throw error;
      return data as unknown as ExamSessionState;
    },
  });

  const Breadcrumb = (
    <nav className="text-xs text-muted-foreground" aria-label="مسار التنقل">
      <Link to="/app" className="hover:text-primary">
        موادي
      </Link>
      <span className="mx-1">/</span>
      <Link to="/exams/history" className="hover:text-primary">
        سجل الاختبارات
      </Link>
      <span className="mx-1">/</span>
      <span className="text-foreground">تفاصيل المحاولة</span>
    </nav>
  );

  if (query.isLoading)
    return <StateMessage variant="loading">جارٍ تحميل التفاصيل…</StateMessage>;

  if (query.error || !query.data)
    return (
      <div className="space-y-4">
        {Breadcrumb}
        <StateMessage variant="error">
          تعذّر تحميل تفاصيل المحاولة.
        </StateMessage>
        <Button asChild variant="outline" className="gap-1">
          <Link to="/exams/history">
            <Home className="h-4 w-4" /> العودة للسجل
          </Link>
        </Button>
      </div>
    );

  const state = query.data;

  if (state.session.status === "in_progress") {
    return (
      <div className="space-y-4">
        {Breadcrumb}
        <StateMessage>
          هذه الجلسة لا تزال قيد التنفيذ، لا تتوفر تفاصيلها هنا.
        </StateMessage>
        <Button asChild variant="outline" size="sm">
          <Link to="/exams/history">العودة للسجل</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Breadcrumb}

      <header className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <h1 className="text-lg font-bold text-foreground">
          {state.template?.title ?? "تفاصيل المحاولة"}
        </h1>
        {state.session.status === "expired" && (
          <p className="mt-1 text-xs text-destructive">
            تم إنهاء هذه الجلسة بانتهاء الوقت
          </p>
        )}
      </header>

      <ExamResultView state={state} />

      <div className="pt-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/exams/history">العودة للسجل</Link>
        </Button>
      </div>
    </div>
  );
}
