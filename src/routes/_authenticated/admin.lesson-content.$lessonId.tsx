import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { LessonBookContentDialog } from "@/components/admin/LessonBookContentDialog";
import { LessonSummaryDialog } from "@/components/admin/LessonSummaryDialog";
import { LessonExplanationsDialog } from "@/components/admin/LessonExplanationsDialog";
import { LessonResourcesDialog } from "@/components/admin/LessonResourcesDialog";
import { LessonPrimaryPdfCard } from "@/components/admin/LessonPrimaryPdfCard";
import { LessonContentWorkspace } from "@/components/admin/LessonContentWorkspace";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  buildLessonCapabilityContract,
  applyLifecycleOverlay,
  type LessonContentCapabilityKey,
} from "@/lib/lessons/lesson-content-contract";
import {
  fetchLessonLifecycleRows,
  rowsToLifecycleMap,
  transitionCapability,
  type LessonCapabilityLifecycleStatus,
} from "@/lib/lessons/lesson-lifecycle";
import { Loader2, ArrowRight, Check, Minus, BookOpen, Pencil, FileText, FolderOpen } from "lucide-react";


export const Route = createFileRoute("/_authenticated/admin/lesson-content/$lessonId")({
  component: AdminLessonDetailPage,
});

function YesNo({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex items-center gap-1 text-emerald-600">
      <Check className="h-3.5 w-3.5" /> موجود
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-muted-foreground">
      <Minus className="h-3.5 w-3.5" /> غير موجود
    </span>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm font-medium text-foreground">{value}</div>
    </div>
  );
}

function AdminLessonDetailPage() {
  const { loading, enabled } = useRequireAdminSection("content");
  const { lessonId } = Route.useParams();

  const [openBookDialog, setOpenBookDialog] = useState(false);
  const [openSummaryDialog, setOpenSummaryDialog] = useState(false);
  const [openExplanationsDialog, setOpenExplanationsDialog] = useState(false);
  const [openResourcesDialog, setOpenResourcesDialog] = useState(false);
  const [pendingCapability, setPendingCapability] =
    useState<LessonContentCapabilityKey | null>(null);

  // 20C-B — editorial lifecycle rows (staff read every status).
  const lifecycleQ = useQuery({
    enabled,
    queryKey: ["admin-lesson-lifecycle", lessonId],
    queryFn: () => fetchLessonLifecycleRows(lessonId),
  });

  const runTransition = async (
    capability: LessonContentCapabilityKey,
    to: LessonCapabilityLifecycleStatus,
  ) => {
    setPendingCapability(capability);
    try {
      await transitionCapability({ lessonId, capability, to });
      await lifecycleQ.refetch();
      toast.success(
        to === "READY"
          ? "تم اعتماد القدرة ونشرها للطالب."
          : to === "REVIEW"
            ? "تم إرسال القدرة للمراجعة."
            : "تم فتح نسخة تعديل جديدة (مسودة).",
      );
    } catch (err) {
      toast.error((err as Error).message || "تعذّر تنفيذ الانتقال.");
    } finally {
      setPendingCapability(null);
    }
  };


  const lessonQ = useQuery({
    enabled,
    queryKey: ["admin-lesson-detail", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select(
          "id, title, sort_order, duration, unit_id, subject_id, unit:units!lessons_unit_id_fkey(id, title), subject:subjects!lessons_subject_id_fkey(id, name, grade_id)"
        )
        .eq("id", lessonId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const bookQ = useQuery({
    enabled: enabled && !!lessonQ.data,
    queryKey: ["admin-lesson-detail", "book", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_book_contents")
        .select("id, content, pdf_url, updated_at")
        .eq("lesson_id", lessonId);
      if (error) throw error;
      const rows = data ?? [];
      return {
        raw: rows,
        items: rows.map((r) => ({
          id: r.id,
          content: r.content,
        })),
        display: rows.map((r) => ({
          id: r.id,
          hasPdf: !!r.pdf_url,
          preview: r.content ? r.content.slice(0, 200) : "",
        })),
      };
    },
  });

  const summaryQ = useQuery({
    enabled: enabled && !!lessonQ.data,
    queryKey: ["admin-lesson-detail", "summary", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_summaries")
        .select("id, summary, key_points, study_tip, updated_at")
        .eq("lesson_id", lessonId);
      if (error) throw error;
      const rows = data ?? [];
      const first = rows[0];
      const kp = first && Array.isArray(first.key_points) ? first.key_points : [];
      return {
        items: rows.map((r) => ({
          id: r.id,
          summary: r.summary,
          key_points: r.key_points,
          study_tip: r.study_tip,
        })),
        raw: rows,
        count: rows.length,
        keyPointsCount: kp.length,
        preview: first?.summary ? first.summary.slice(0, 200) : "",
      };
    },
  });

  const explanationsQ = useQuery({
    enabled: enabled && !!lessonQ.data,
    queryKey: ["admin-lesson-detail", "explanations", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_explanations")
        .select("id, lesson_id, title, content, sort_order, updated_at")
        .eq("lesson_id", lessonId)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return { items: data ?? [], count: (data ?? []).length };
    },
  });

  const questionsQ = useQuery({
    enabled: enabled && !!lessonQ.data,
    queryKey: ["admin-lesson-detail", "questions", lessonId],
    queryFn: async () => {
      // Explicitly DO NOT select correct_index, options, explanation, question_text.
      const { data, error, count } = await supabase
        .from("questions")
        .select("id, question_type", { count: "exact" })
        .eq("lesson_id", lessonId);
      if (error) throw error;
      const types: Record<string, number> = {};
      for (const r of data ?? []) {
        const t = (r.question_type as string | null) ?? "—";
        types[t] = (types[t] ?? 0) + 1;
      }
      return { count: count ?? 0, types };
    },
  });

  const resourcesQ = useQuery({
    enabled: enabled && !!lessonQ.data,
    queryKey: ["admin-lesson-detail", "resources", lessonId],
    queryFn: async () => {
      // Select full fields for the admin editor dialog; admin-only route.
      // is_primary (13F) is optional until its migration is applied.
      const run = (cols: string) =>
        supabase
          .from("lesson_resources")
          .select(cols, { count: "exact" })
          .eq("lesson_id", lessonId)
          .order("sort_order", { ascending: true });

      const base =
        "id, lesson_id, resource_type, title, url, description, sort_order, created_at";
      let { data, error, count } = (await run(
        `${base}, is_primary, html_resource_type, lifecycle_status, resource_code`,
      )) as any;
      if (error) {
        ({ data, error, count } = (await run(`${base}, is_primary`)) as any);
      }
      if (error) {
        ({ data, error, count } = (await run(base)) as any);
      }
      if (error) throw error;
      const types: Record<string, number> = {};
      for (const r of data ?? []) {
        const t = (r.resource_type as string | null) ?? "—";
        types[t] = (types[t] ?? 0) + 1;
      }
      return { count: count ?? 0, types, items: data ?? [] };
    },
  });

  const simulationsQ = useQuery({
    enabled: enabled && !!lessonQ.data,
    queryKey: ["admin-lesson-detail", "simulations", lessonId],
    queryFn: async () => {
      // Do NOT select phet_url or thumbnail_url.
      const { data, error, count } = await supabase
        .from("lesson_simulations")
        .select("id, title", { count: "exact" })
        .eq("lesson_id", lessonId);
      if (error) throw error;
      return { count: count ?? 0, items: data ?? [] };
    },
  });

  const assessmentsQ = useQuery({
    enabled: enabled && !!lessonQ.data,
    queryKey: ["admin-lesson-detail", "assessments", lessonId],
    queryFn: async () => {
      const assess = await supabase
        .from("lesson_assessments")
        .select("id", { count: "exact", head: true })
        .eq("lesson_id", lessonId);
      const exams = await supabase
        .from("exam_templates")
        .select("id", { count: "exact", head: true })
        .eq("lesson_id", lessonId);
      return {
        assessmentsCount: assess.error ? 0 : assess.count ?? 0,
        lessonExamCount: exams.error ? 0 : exams.count ?? 0,
      };
    },
  });

  const gradeId =
    (lessonQ.data as any)?.subject?.grade_id ?? null;
  const gradeQ = useQuery({
    enabled: enabled && !!gradeId,
    queryKey: ["admin-lesson-detail", "grade", gradeId],
    queryFn: async () => {
      if (!gradeId) return null;
      const { data, error } = await supabase
        .from("grades")
        .select("name")
        .eq("id", gradeId)
        .maybeSingle();
      if (error) throw error;
      return data?.name ?? null;
    },
  });

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          جارٍ التحقق من الصلاحيات…
        </div>
      </AdminLayout>
    );
  }

  if (!enabled) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          ليست لديك صلاحية الوصول لهذه الصفحة.
        </div>
      </AdminLayout>
    );
  }

  if (lessonQ.isLoading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (lessonQ.isError) {
    return (
      <AdminLayout>
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
          تعذر تحميل الدرس.
        </div>
      </AdminLayout>
    );
  }

  const lesson = lessonQ.data;
  if (!lesson) {
    return (
      <AdminLayout>
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          الدرس غير موجود.
          <div className="mt-3">
            <Link
              to="/admin/lessons"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-foreground hover:bg-muted"
            >
              <ArrowRight className="h-4 w-4" />
              العودة إلى قائمة الدروس
            </Link>
          </div>
        </div>
      </AdminLayout>
    );
  }

  const hasVideo = !!(lesson as any).has_video;
  const hasLessonPdf = !!(lesson as any).has_content_pdf;
  const subjectName = (lesson as any).subject?.name ?? "—";
  const unitTitle = (lesson as any).unit?.title ?? "—";

  // 20B — one contract, derived from the same rows the student reads.
  const lifecycleMap = rowsToLifecycleMap(lifecycleQ.data ?? []);
  const lifecycleStatuses = Object.fromEntries(
    Object.entries(lifecycleMap).map(([k, v]) => [
      k,
      typeof v === "string" ? v : v!.status,
    ]),
  ) as Partial<Record<LessonContentCapabilityKey, LessonCapabilityLifecycleStatus>>;

  const capabilityContract = applyLifecycleOverlay(
    buildLessonCapabilityContract({
      lessonTitle: (lesson as any)?.title ?? null,
      deliveryMode: (lesson as any)?.delivery_mode ?? null,
      bookContents: (bookQ.data?.raw ?? []) as any,
      inlineContent: (lesson as any)?.content_text ?? null,
      explanations: (explanationsQ.data?.items ?? []) as any,
      resources: (resourcesQ.data?.items ?? []) as any,
      simulations: (simulationsQ.data?.items ?? []) as any,
      summaries: (summaryQ.data?.raw ?? []) as any,
      questionsCount: questionsQ.data?.count ?? 0,
      assessmentsCount: assessmentsQ.data?.assessmentsCount ?? 0,
      lessonExamCount: assessmentsQ.data?.lessonExamCount ?? 0,
      performanceTrackable: true,
      enhancementsAccessible: true,
    }),
    lifecycleMap,
  );


  return (
    <AdminLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <BookOpen className="h-6 w-6 text-primary" />
              {(lesson as any).title}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              إدارة محتوى الدرس وقدراته التعليمية.
            </p>
          </div>
          <Link
            to="/admin/lessons"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
          >
            <ArrowRight className="h-4 w-4" />
            قائمة الدروس
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-12 justify-start gap-2"
            onClick={() => setOpenExplanationsDialog(true)}
          >
            <FileText className="h-4 w-4 text-primary" />
            إدارة الشروحات وحذفها
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-12 justify-start gap-2"
            onClick={() => setOpenResourcesDialog(true)}
          >
            <FolderOpen className="h-4 w-4 text-primary" />
            إدارة الموارد وحذفها
          </Button>
        </div>

        <LessonContentWorkspace
          lessonId={lessonId}
          contract={capabilityContract}
          header={{
            subjectName,
            gradeName: gradeQ.data ?? "—",
            trackNames: unitTitle,
            lessonTitle: (lesson as any).title,
            lessonCode: (lesson as any).slug ?? (lesson as any).id.slice(0, 8),
          }}
          onEdit={{
            officialBookContent: () => setOpenBookDialog(true),
            tamkeenExplanation: () => setOpenExplanationsDialog(true),
            quickReview: () => setOpenSummaryDialog(true),
            mindMap: () => setOpenResourcesDialog(true),
            simulation: () => setOpenResourcesDialog(true),
            supportingResources: () => setOpenResourcesDialog(true),
            originalBookPdf: () => setOpenResourcesDialog(true),
          }}
        />

        {/* Basic info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="المادة" value={subjectName} />
          <Stat label="الوحدة" value={unitTitle} />
          <Stat label="الصف" value={gradeQ.data ?? "—"} />
          <Stat label="الترتيب" value={(lesson as any).sort_order ?? 0} />
          <Stat label="المدة" value={(lesson as any).duration || "—"} />
          <Stat label="الفيديو" value={<YesNo on={hasVideo} />} />
          <Stat label="ملف الدرس (PDF)" value={<YesNo on={hasLessonPdf} />} />
          <Stat
            label="معرّف الدرس"
            value={<span className="font-mono text-[11px]">{(lesson as any).id.slice(0, 8)}…</span>}
          />
        </div>

        {/* Book contents */}
        <Section title="محتوى الكتاب">
          {bookQ.isLoading ? (
            <Loading />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  عدد السجلات: <span className="text-foreground font-medium">{bookQ.data?.display?.length ?? 0}</span>
                </p>
                <button
                  onClick={() => setOpenBookDialog(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  تحرير محتوى الكتاب
                </button>
              </div>
              {(bookQ.data?.display ?? []).map((b: any, idx: number) => (
                <div key={b.id} className="mt-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">سجل #{idx + 1}</span>
                    <span>PDF: <YesNo on={b.hasPdf} /></span>
                  </div>
                  {b.preview && (
                    <p className="mt-2 line-clamp-3 text-foreground/80 whitespace-pre-wrap">
                      {b.preview}
                      {b.preview.length >= 200 ? "…" : ""}
                    </p>
                  )}
                </div>
              ))}
            </>
          )}
        </Section>

        {/* Summary */}
        <Section title="الملخص">
          {summaryQ.isLoading ? (
            <Loading />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  عدد السجلات: <span className="text-foreground font-medium">{summaryQ.data?.count ?? 0}</span>
                </p>
                <button
                  onClick={() => setOpenSummaryDialog(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  تحرير ملخص الدرس
                </button>
              </div>
              {summaryQ.data && summaryQ.data.count > 0 ? (
                <>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <Stat label="الحالة" value={<YesNo on={true} />} />
                    <Stat label="النقاط الرئيسية" value={summaryQ.data.keyPointsCount} />
                  </div>
                  {summaryQ.data.preview && (
                    <p className="mt-3 line-clamp-3 rounded-lg border border-border bg-muted/30 p-3 text-xs text-foreground/80 whitespace-pre-wrap">
                      {summaryQ.data.preview}
                      {summaryQ.data.preview.length >= 200 ? "…" : ""}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">لا يوجد ملخص.</p>
              )}
            </>
          )}
        </Section>

        {/* Explanations */}
        <Section title="الشروحات">
          {explanationsQ.isLoading ? (
            <Loading />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  عدد الشروحات:{" "}
                  <span className="text-foreground font-medium">
                    {explanationsQ.data?.count ?? 0}
                  </span>
                </p>
                <button
                  onClick={() => setOpenExplanationsDialog(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  إدارة شروحات الدرس
                </button>
              </div>
              {(explanationsQ.data?.items ?? []).length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-foreground/80">
                  {explanationsQ.data!.items.map((e: any, idx: number) => (
                    <li key={e.id} className="flex items-center gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                        #{idx + 1}
                      </span>
                      <span>{e.title || "بدون عنوان"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Section>




        {/* Questions */}
        <Section title="الأسئلة">
          {questionsQ.isLoading ? (
            <Loading />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                عدد الأسئلة: <span className="text-foreground font-medium">{questionsQ.data?.count ?? 0}</span>
              </p>
              {Object.keys(questionsQ.data?.types ?? {}).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(questionsQ.data!.types).map(([t, n]) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground"
                    >
                      {t} <span className="text-muted-foreground">×{n}</span>
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                لا تُعرض نصوص الأسئلة أو الإجابات الصحيحة هنا.
              </p>
            </>
          )}
        </Section>

        {/* Resources */}
        <Section title="الموارد">
          {resourcesQ.isLoading ? (
            <Loading />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  عدد الموارد: <span className="text-foreground font-medium">{resourcesQ.data?.count ?? 0}</span>
                </p>
                <button
                  onClick={() => setOpenResourcesDialog(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  إدارة موارد الدرس
                </button>
              </div>
              {Object.keys(resourcesQ.data?.types ?? {}).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Object.entries(resourcesQ.data!.types).map(([t, n]) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground"
                    >
                      {t} <span className="text-muted-foreground">×{n}</span>
                    </span>
                  ))}
                </div>
              )}
              {(resourcesQ.data?.items ?? []).length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {resourcesQ.data!.items.map((r: any) => (
                    <li key={r.id} className="flex items-center gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">{r.resource_type}</span>
                      <span className="text-foreground/80">{r.title}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">لا تُعرض روابط الموارد.</p>
            </>
          )}
        </Section>

        {/* Simulations */}
        <Section title="التجارب والمحاكاة">
          {simulationsQ.isLoading ? (
            <Loading />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                عدد المحاكاة: <span className="text-foreground font-medium">{simulationsQ.data?.count ?? 0}</span>
              </p>
              {(simulationsQ.data?.items ?? []).length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-foreground/80">
                  {simulationsQ.data!.items.map((s: any) => (
                    <li key={s.id}>• {s.title}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">لا تُعرض روابط المحاكاة.</p>
            </>
          )}
        </Section>

        <Section title="ملف الدرس الأساسي (PDF)">
          <LessonPrimaryPdfCard lessonId={lessonId} enabled={enabled} />
        </Section>

        <LessonBookContentDialog
          open={openBookDialog}
          onOpenChange={setOpenBookDialog}
          lessonId={lessonId}
          lessonTitle={(lesson as any)?.title ?? null}
          items={bookQ.data?.items ?? []}
        />

        <LessonSummaryDialog
          open={openSummaryDialog}
          onOpenChange={setOpenSummaryDialog}
          lessonId={lessonId}
          lessonTitle={(lesson as any)?.title ?? null}
          items={summaryQ.data?.items ?? []}
        />

        <LessonExplanationsDialog
          open={openExplanationsDialog}
          onOpenChange={setOpenExplanationsDialog}
          lessonId={lessonId}
          lessonTitle={(lesson as any)?.title ?? null}
          items={explanationsQ.data?.items ?? []}
        />

        <LessonResourcesDialog
          open={openResourcesDialog}
          onOpenChange={setOpenResourcesDialog}
          lessonId={lessonId}
          lessonTitle={(lesson as any)?.title ?? null}
          items={(resourcesQ.data?.items ?? []) as any}
        />
      </div>
    </AdminLayout>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center py-4">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}

