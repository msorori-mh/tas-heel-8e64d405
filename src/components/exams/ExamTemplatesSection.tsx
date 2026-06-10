import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ClipboardList, GraduationCap, Sparkles, Lock, Loader2, Play, Timer } from "lucide-react";

type Scope =
  | { kind: "lesson"; lessonId: string }
  | { kind: "unit"; unitId: string }
  | { kind: "subject"; subjectId: string };

type TemplateRow = {
  id: string;
  title: string;
  description: string | null;
  mode: "training" | "strict" | "ministry" | string;
  duration_seconds: number | null;
  questions_count: number;
};

const MODE_META: Record<
  string,
  { label: string; icon: React.ReactNode; cls: string }
> = {
  training: {
    label: "تدريب",
    icon: <Sparkles className="h-3 w-3" />,
    cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  },
  strict: {
    label: "محاكي",
    icon: <ClipboardList className="h-3 w-3" />,
    cls: "bg-primary/15 text-primary",
  },
  ministry: {
    label: "وزاري",
    icon: <GraduationCap className="h-3 w-3" />,
    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  },
};

export function ExamTemplatesSection({
  scope,
  canAccess,
  title = "اختبارات",
  emptyMessage = "لا توجد اختبارات متاحة حاليًا.",
  lockedMessage = "تتطلب الاختبارات اشتراكًا.",
}: {
  scope: Scope;
  canAccess: boolean;
  title?: string;
  emptyMessage?: string;
  lockedMessage?: string;
}) {
  const queryKey =
    scope.kind === "lesson"
      ? ["exam-templates", "lesson", scope.lessonId]
      : scope.kind === "unit"
        ? ["exam-templates", "unit", scope.unitId]
        : ["exam-templates", "subject", scope.subjectId];

  const { data, isLoading, error } = useQuery({
    queryKey,
    queryFn: async () => {
      let q = supabase
        .from("exam_templates")
        .select(
          "id,title,description,mode,duration_seconds,questions:exam_template_questions(count)",
        )
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (scope.kind === "lesson") {
        q = q.eq("lesson_id", scope.lessonId);
      } else if (scope.kind === "unit") {
        q = q.eq("unit_id", scope.unitId).is("lesson_id", null);
      } else {
        q = q.eq("subject_id", scope.subjectId).is("unit_id", null).is("lesson_id", null);
      }

      const { data, error } = await q;
      if (error) throw error;
      const rows: TemplateRow[] = ((data ?? []) as any[])
        .map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          mode: r.mode,
          duration_seconds: r.duration_seconds,
          questions_count: r.questions?.[0]?.count ?? 0,
        }))
        .filter((r) => r.questions_count > 0);
      return rows;
    },
  });

  const headingIcon =
    scope.kind === "lesson" ? (
      <ClipboardList className="h-4 w-4 text-primary" />
    ) : scope.kind === "unit" ? (
      <ClipboardList className="h-4 w-4 text-primary" />
    ) : (
      <GraduationCap className="h-4 w-4 text-primary" />
    );

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        {headingIcon}
        <h2 className="text-base font-bold text-foreground">{title}</h2>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          جارٍ التحميل…
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">تعذر تحميل الاختبارات.</p>
      ) : !data || data.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          {emptyMessage}
        </p>
      ) : !canAccess ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <Lock className="h-4 w-4" />
            <span>{lockedMessage}</span>
          </div>
          <ul className="space-y-2 opacity-70">
            {data.map((t) => (
              <li key={t.id}>
                <TemplateCard tpl={t} disabled />
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((t) => (
            <li key={t.id}>
              <TemplateCard tpl={t} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TemplateCard({ tpl, disabled }: { tpl: TemplateRow; disabled?: boolean }) {
  const meta = MODE_META[tpl.mode] ?? MODE_META.strict;
  const minutes =
    tpl.duration_seconds && tpl.duration_seconds > 0
      ? Math.round(tpl.duration_seconds / 60)
      : null;

  const startButton = disabled ? (
    <Button size="sm" variant="outline" disabled className="gap-1">
      <Lock className="h-4 w-4" />
      مقفل
    </Button>
  ) : tpl.mode === "training" ? (
    <Button asChild size="sm" className="gap-1">
      <Link to="/exams/training/$templateId" params={{ templateId: tpl.id }}>
        <Play className="h-4 w-4" />
        ابدأ
      </Link>
    </Button>
  ) : (
    <Button asChild size="sm" className="gap-1">
      <Link to="/exams/strict/$templateId" params={{ templateId: tpl.id }}>
        <Play className="h-4 w-4" />
        ابدأ
      </Link>
    </Button>
  );

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-semibold text-foreground">{tpl.title}</h3>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.cls}`}
            >
              {meta.icon}
              {meta.label}
            </span>
          </div>
          {tpl.description && (
            <p className="text-xs text-muted-foreground line-clamp-2">{tpl.description}</p>
          )}
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            <span>الأسئلة: {tpl.questions_count}</span>
            {minutes != null && (
              <span className="inline-flex items-center gap-1">
                <Timer className="h-3 w-3" />
                {minutes} دقيقة
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0">{startButton}</div>
      </div>
    </div>
  );
}
