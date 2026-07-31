import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  FileQuestion,
  GraduationCap,
  Lightbulb,
  Loader2,
  RefreshCw,
  Users,
} from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import {
  averageExamPercentage,
  mostActiveSubjects,
  scorePercentage,
  type SafeExamSession,
} from "@/lib/admin-reporting";

export const Route = createFileRoute("/_authenticated/admin/reports")({
  component: AdminReportsPage,
});

const SESSION_SAMPLE_LIMIT = 250;

async function exactCount(
  table: "profiles" | "subjects" | "lessons" | "questions" | "exam_sessions",
) {
  const { count, error } = await supabase.from(table).select("id", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

async function loadAdminReport() {
  const [students, subjects, lessons, questions, examSessions, sessionsResult, progressResult] =
    await Promise.all([
      exactCount("profiles"),
      exactCount("subjects"),
      exactCount("lessons"),
      exactCount("questions"),
      exactCount("exam_sessions"),
      supabase
        .from("exam_sessions")
        .select(
          "id, score, total_points, submitted_at, started_at, template:exam_templates!exam_sessions_template_id_fkey(title, subject:subjects!exam_templates_subject_id_fkey(name))",
        )
        .eq("status", "submitted")
        .order("submitted_at", { ascending: false })
        .limit(SESSION_SAMPLE_LIMIT),
      supabase
        .from("user_progress")
        .select("updated_at", { count: "exact" })
        .eq("completed", true)
        .order("updated_at", { ascending: false })
        .limit(1),
    ]);

  if (sessionsResult.error) throw sessionsResult.error;
  if (progressResult.error) throw progressResult.error;

  const sessions = (sessionsResult.data ?? []) as unknown as SafeExamSession[];
  const recentSessions = sessions.slice(0, 5);

  return {
    counts: {
      students,
      subjects,
      lessons,
      questions,
      examSessions,
      completedLessons: progressResult.count ?? 0,
    },
    averageScore: averageExamPercentage(sessions),
    activeSubjects: mostActiveSubjects(sessions),
    recentSessions,
    lastLearningActivity: progressResult.data?.[0]?.updated_at ?? sessions[0]?.submitted_at ?? null,
    sampleSize: sessions.length,
  };
}

function AdminReportsPage() {
  const { loading, enabled } = useRequireAdminSection("full");
  const reportQ = useQuery({
    enabled,
    queryKey: ["admin-reporting-foundation"],
    queryFn: loadAdminReport,
    staleTime: 60_000,
  });

  if (loading) {
    return (
      <AdminLayout>
        <PageState
          icon={<Loader2 className="h-6 w-6 animate-spin" />}
          text="جارٍ التحقق من الصلاحيات…"
        />
      </AdminLayout>
    );
  }

  if (!enabled) {
    return (
      <AdminLayout>
        <PageState text="هذه التقارير متاحة للإدارة الكاملة فقط." />
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6" dir="rtl">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
              <BarChart3 className="h-6 w-6 text-primary" />
              التقارير والإشعارات التعليمية
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              مؤشرات مجمعة وآمنة لدعم قرارات المحتوى والتعلّم دون عرض بيانات شخصية.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => reportQ.refetch()}
            disabled={reportQ.isFetching}
            className="min-h-11 gap-2 self-start"
          >
            <RefreshCw className={`h-4 w-4 ${reportQ.isFetching ? "animate-spin" : ""}`} />
            تحديث المؤشرات
          </Button>
        </header>

        {reportQ.isLoading ? (
          <PageState
            icon={<Loader2 className="h-6 w-6 animate-spin" />}
            text="جارٍ تحميل المؤشرات…"
          />
        ) : reportQ.isError ? (
          <div
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 p-5 text-sm text-destructive"
          >
            تعذر تحميل التقارير ضمن الصلاحيات الحالية. لم تتم محاولة تجاوز RLS.
          </div>
        ) : reportQ.data ? (
          <>
            <section aria-labelledby="overview-title" className="space-y-3">
              <SectionHeading
                id="overview-title"
                title="نظرة عامة"
                description="أعداد إجمالية دون أسماء أو وسائل اتصال."
              />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                  icon={Users}
                  label="الطلاب المسجلون"
                  value={reportQ.data.counts.students}
                />
                <StatCard icon={BookOpen} label="المواد" value={reportQ.data.counts.subjects} />
                <StatCard icon={GraduationCap} label="الدروس" value={reportQ.data.counts.lessons} />
                <StatCard
                  icon={FileQuestion}
                  label="الأسئلة"
                  value={reportQ.data.counts.questions}
                />
                <StatCard
                  icon={ClipboardCheck}
                  label="جلسات الاختبار"
                  value={reportQ.data.counts.examSessions}
                />
                <StatCard
                  icon={BrainCircuit}
                  label="متوسط نتائج الاختبارات"
                  value={
                    reportQ.data.averageScore === null
                      ? "غير متاح"
                      : `${reportQ.data.averageScore}%`
                  }
                  hint={`آخر ${reportQ.data.sampleSize} جلسة مكتملة كحد أقصى`}
                />
                <StatCard
                  icon={CheckCircle2}
                  label="دروس مكتملة"
                  value={reportQ.data.counts.completedLessons}
                />
                <StatCard
                  icon={BarChart3}
                  label="آخر نشاط تعليمي"
                  value={formatDate(reportQ.data.lastLearningActivity)}
                />
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-2" aria-label="تقارير التقدم العامة">
              <ReportPanel
                title="أكثر المواد نشاطاً"
                description="بحسب جلسات الاختبار المكتملة في العينة الأخيرة."
              >
                {reportQ.data.activeSubjects.length === 0 ? (
                  <EmptyState text="لا توجد جلسات مرتبطة بمواد لعرضها بعد." />
                ) : (
                  <ol className="space-y-3">
                    {reportQ.data.activeSubjects.map((subject, index) => (
                      <li
                        key={subject.name}
                        className="flex items-center gap-3 rounded-lg bg-muted/50 px-3 py-3"
                      >
                        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                          {index + 1}
                        </span>
                        <span className="flex-1 font-medium text-foreground">{subject.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {subject.sessions} جلسة
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </ReportPanel>

              <ReportPanel
                title="آخر الاختبارات المنفذة"
                description="لا تُعرض هوية الطالب أو إجاباته أو تفاصيل النتيجة."
              >
                {reportQ.data.recentSessions.length === 0 ? (
                  <EmptyState text="لا توجد اختبارات مكتملة حتى الآن." />
                ) : (
                  <ul className="space-y-3">
                    {reportQ.data.recentSessions.map((session) => {
                      const percentage = scorePercentage(session.score, session.total_points);
                      return (
                        <li key={session.id} className="rounded-lg border border-border px-3 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-foreground">
                                {session.template?.title ?? "اختبار تعليمي"}
                              </p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {session.template?.subject?.name ?? "مادة غير محددة"} ·{" "}
                                {formatDate(session.submitted_at)}
                              </p>
                            </div>
                            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-sm font-bold text-primary">
                              {percentage === null ? "—" : `${percentage}%`}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ReportPanel>
            </section>

            <section aria-labelledby="notifications-title" className="space-y-3">
              <SectionHeading
                id="notifications-title"
                title="الإشعارات التعليمية"
                description="تخطيط فقط؛ لا يتم إرسال أي إشعار من هذه الصفحة."
              />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <NotificationCard
                  icon={BookOpen}
                  title="درس جديد"
                  description="تنبيه الطلاب عند نشر درس مناسب لصفهم ومسارهم."
                />
                <NotificationCard
                  icon={ClipboardCheck}
                  title="اختبار جديد"
                  description="تعريف الطلاب بالاختبارات والتدريبات المتاحة."
                />
                <NotificationCard
                  icon={BarChart3}
                  title="تقدم الطالب"
                  description="رسائل تشجيعية مبنية على التقدم بعد اعتماد قواعد الخصوصية."
                />
                <NotificationCard
                  icon={Lightbulb}
                  title="نصائح تعليمية"
                  description="نصائح دورية اختيارية، دون إرسال أو جدولة في هذه المرحلة."
                />
              </div>
            </section>
          </>
        ) : (
          <PageState text="لا توجد بيانات متاحة للتقرير." />
        )}
      </div>
    </AdminLayout>
  );
}

function SectionHeading({
  id,
  title,
  description,
}: {
  id: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 id={id} className="text-lg font-bold text-foreground">
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
  hint?: string;
}) {
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <strong className="text-xl text-foreground">{value}</strong>
      </div>
      <p className="mt-3 text-sm font-medium text-muted-foreground">{label}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </article>
  );
}

function ReportPanel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="font-bold text-foreground">{title}</h2>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function NotificationCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Bell;
  title: string;
  description: string;
}) {
  return (
    <article className="rounded-xl border border-dashed border-border bg-card/60 p-4">
      <div className="flex items-center justify-between gap-2">
        <Icon className="h-5 w-5 text-primary" />
        <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
          مخطط لاحقاً
        </span>
      </div>
      <h3 className="mt-3 font-bold text-foreground">{title}</h3>
      <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
    </article>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function PageState({ icon, text }: { icon?: React.ReactNode; text: string }) {
  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-center text-muted-foreground"
      dir="rtl"
    >
      {icon}
      <p>{text}</p>
    </div>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "غير متاح";
  return new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}
