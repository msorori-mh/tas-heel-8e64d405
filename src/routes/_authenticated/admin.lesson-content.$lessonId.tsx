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
import { LessonContentWorkspace } from "@/components/admin/LessonContentWorkspace";
import {
  buildLessonCapabilityContract,
  applyLifecycleOverlay,
  type LessonContentCapabilityKey,
} from "@/lib/lessons/lesson-content-contract";
import {
  fetchLessonLifecycleRows,
  rowsToApplicabilityMap,
  rowsToLifecycleMap,
  type LessonCapabilityLifecycleStatus,
} from "@/lib/lessons/lesson-lifecycle";
import {
  htmlPreviewText,
  questionTypeLabelAr,
  summarizeAdminLessonQuestions,
} from "@/lib/lessons/admin-lesson-workspace";
import { Loader2, ArrowRight, Check, Minus, BookOpen } from "lucide-react";

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

function resourceCategoryLabel(resource: {
  resource_type?: string | null;
  html_resource_type?: string | null;
}): string {
  const type = resource.html_resource_type ?? resource.resource_type ?? "";
  if (type === "mindmap" || type === "mind_map_html") return "الخريطة الذهنية";
  if (type === "experiment" || type === "practical_experiment_html") {
    return "التجربة المعملية";
  }
  if (type === "video") return "مورد فيديو قديم";
  return "مورد مساعد قديم";
}

function AdminLessonDetailPage() {
  const { loading, enabled } = useRequireAdminSection("content");
  const { lessonId } = Route.useParams();

  const [openBookDialog, setOpenBookDialog] = useState(false);
  const [openSummaryDialog, setOpenSummaryDialog] = useState(false);
  const [openExplanationsDialog, setOpenExplanationsDialog] = useState(false);
  const [openResourcesDialog, setOpenResourcesDialog] = useState(false);

  // 20C-B — editorial lifecycle rows (staff read every status).
  const lifecycleQ = useQuery({
    enabled,
    queryKey: ["admin-lesson-lifecycle", lessonId],
    queryFn: () => fetchLessonLifecycleRows(lessonId),
  });

  const lessonQ = useQuery({
    enabled,
    queryKey: ["admin-lesson-detail", lessonId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lessons")
        .select(
          "id, title, slug, sort_order, duration, delivery_mode, content_text, unit_id, subject_id, unit:units!lessons_unit_id_fkey(id, title), subject:subjects!lessons_subject_id_fkey(id, name, grade_id, curriculum_track_id)",
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
          preview: htmlPreviewText(r.content),
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
      const usableCount = rows.filter((row) => (row.summary ?? "").trim().length > 0).length;
      return {
        items: rows.map((r) => ({
          id: r.id,
          summary: r.summary,
          key_points: r.key_points,
          study_tip: r.study_tip,
        })),
        raw: rows,
        count: rows.length,
        usableCount,
        invalidCount: rows.length - usableCount,
        keyPointsCount: kp.length,
        preview: htmlPreviewText(first?.summary),
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
      const items = data ?? [];
      const usableItems = items.filter((item) => (item.content ?? "").trim().length > 0);
      return {
        items,
        usableItems,
        count: usableItems.length,
        invalidCount: items.length - usableItems.length,
      };
    },
  });

  const questionsQ = useQuery({
    enabled: enabled && !!lessonQ.data,
    queryKey: ["admin-lesson-detail", "questions", lessonId],
    queryFn: async () => {
      // Intentionally excludes prompt, options, correct answer and explanation.
      const { data: questions, error } = await supabase
        .from("questions")
        .select("id, question_type, current_published_revision_id")
        .eq("lesson_id", lessonId)
        .is("archived_at", null);
      if (error) throw error;
      const questionIds = (questions ?? []).map((question) => question.id);
      if (questionIds.length === 0) return summarizeAdminLessonQuestions([], []);

      const { data: revisions, error: revisionsError } = await supabase
        .from("question_revisions")
        .select(
          "id, question_id, educational_label, status, revision_number, interaction_type, grading_mode",
        )
        .in("question_id", questionIds);
      if (revisionsError) throw revisionsError;
      return summarizeAdminLessonQuestions(questions ?? [], revisions ?? []);
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

      const base = "id, lesson_id, resource_type, title, url, description, sort_order, created_at";
      let { data, error, count } = (await run(
        `${base}, is_primary, html_resource_type, resource_code, metadata, lifecycle_status`,
      )) as any;
      if (error) {
        ({ data, error, count } = (await run(
          `${base}, is_primary, html_resource_type, resource_code, metadata`,
        )) as any);
      }
      if (error) {
        ({ data, error, count } = (await run(`${base}, is_primary`)) as any);
      }
      if (error) {
        ({ data, error, count } = (await run(base)) as any);
      }
      if (error) throw error;
      return { count: count ?? 0, items: data ?? [] };
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

  const gradeId = (lessonQ.data as any)?.subject?.grade_id ?? null;
  const trackId = (lessonQ.data as any)?.subject?.curriculum_track_id ?? null;
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

  const trackQ = useQuery({
    enabled: enabled && !!trackId,
    queryKey: ["admin-lesson-detail", "track", trackId],
    queryFn: async () => {
      if (!trackId) return null;
      const { data, error } = await supabase
        .from("curriculum_tracks")
        .select("track_name")
        .eq("id", trackId)
        .maybeSingle();
      if (error) throw error;
      return data?.track_name ?? null;
    },
  });

  const sourcesLoading =
    !!lessonQ.data &&
    [bookQ, summaryQ, explanationsQ, questionsQ, resourcesQ, simulationsQ].some(
      (query) => query.isLoading,
    );

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

  if (lessonQ.isLoading || lifecycleQ.isLoading || sourcesLoading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  if (lessonQ.isError || lifecycleQ.isError) {
    return (
      <AdminLayout>
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-6 text-center text-sm text-destructive">
          تعذر تحميل بيانات الدرس أو مساره التحريري؛ لم تُعرض حالة جاهزية غير موثوقة.
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

  const subjectName = (lesson as any).subject?.name ?? "—";
  const unitTitle = (lesson as any).unit?.title ?? "—";

  // 20B — one contract, derived from the same rows the student reads.
  const lifecycleMap = rowsToLifecycleMap(lifecycleQ.data ?? []);
  const lifecycleStatuses = Object.fromEntries(
    Object.entries(lifecycleMap).map(([k, v]) => [k, typeof v === "string" ? v : v!.status]),
  ) as Partial<Record<LessonContentCapabilityKey, LessonCapabilityLifecycleStatus>>;
  const applicability = rowsToApplicabilityMap(lifecycleQ.data ?? []);

  const capabilityContract = applyLifecycleOverlay(
    buildLessonCapabilityContract({
      lessonTitle: (lesson as any)?.title ?? null,
      deliveryMode: (lesson as any)?.delivery_mode ?? null,
      bookContents: (bookQ.data?.raw ?? []) as any,
      inlineContent: (lesson as any)?.content_text ?? null,
      explanations: (explanationsQ.data?.usableItems ?? []) as any,
      resources: (resourcesQ.data?.items ?? []) as any,
      simulations: (simulationsQ.data?.items ?? []) as any,
      summaries: (summaryQ.data?.raw ?? []) as any,
      officialQuestionsCount: questionsQ.data?.officialBook.count ?? 0,
      selfTestQuestionsCount: questionsQ.data?.selfTest.count ?? 0,
      assessmentsCount: 0,
      lessonExamCount: 0,
      performanceTrackable: true,
      enhancementsAccessible: true,
    }),
    lifecycleMap,
  );
  const hasSourceLoadError = [
    bookQ,
    summaryQ,
    explanationsQ,
    questionsQ,
    resourcesQ,
    simulationsQ,
  ].some((query) => query.isError);

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

        <LessonContentWorkspace
          lessonId={lessonId}
          contract={capabilityContract}
          lifecycle={lifecycleStatuses}
          applicability={applicability}
          header={{
            subjectName,
            gradeName: gradeQ.data ?? "—",
            trackNames: trackQ.data ?? "—",
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
          }}
        />

        {hasSourceLoadError && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            تعذر تحميل بعض مصادر المحتوى. القيم غير المحمّلة عوملت كغير جاهزة، ولا ينبغي اتخاذ قرار
            اعتماد قبل إعادة تحميل الصفحة بنجاح.
          </div>
        )}

        {/* Basic info */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="المادة" value={subjectName} />
          <Stat label="الوحدة" value={unitTitle} />
          <Stat label="الصف" value={gradeQ.data ?? "—"} />
          <Stat label="الترتيب" value={(lesson as any).sort_order ?? 0} />
          <Stat
            label="المدة"
            value={(lesson as any).duration ? `${(lesson as any).duration} دقيقة` : "—"}
          />
          <Stat
            label="رمز الدرس"
            value={
              <span className="font-mono text-[11px]">
                {(lesson as any).slug || `${(lesson as any).id.slice(0, 8)}…`}
              </span>
            }
          />
        </div>

        <Section title="تفاصيل محتوى الكتاب">
          {bookQ.isLoading ? (
            <Loading />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                عدد السجلات:{" "}
                <span className="text-foreground font-medium">
                  {bookQ.data?.display?.length ?? 0}
                </span>
              </p>
              {(bookQ.data?.display ?? []).map((b: any, idx: number) => (
                <div
                  key={b.id}
                  className="mt-2 rounded-lg border border-border bg-muted/30 p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">سجل #{idx + 1}</span>
                    <span>
                      مرفق PDF قديم: <YesNo on={b.hasPdf} />
                    </span>
                  </div>
                  {b.preview && (
                    <p className="mt-2 line-clamp-3 text-foreground/80 whitespace-pre-wrap">
                      {b.preview}
                    </p>
                  )}
                </div>
              ))}
            </>
          )}
        </Section>

        <Section title="تفاصيل ملخص الدرس">
          {summaryQ.isLoading ? (
            <Loading />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                عدد السجلات:{" "}
                <span className="text-foreground font-medium">{summaryQ.data?.count ?? 0}</span>
              </p>
              {summaryQ.data && summaryQ.data.usableCount > 0 ? (
                <>
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Stat label="السجلات الصالحة" value={summaryQ.data.usableCount} />
                    <Stat label="النقاط الرئيسية" value={summaryQ.data.keyPointsCount} />
                  </div>
                  {summaryQ.data.preview && (
                    <p className="mt-3 line-clamp-3 rounded-lg border border-border bg-muted/30 p-3 text-xs text-foreground/80 whitespace-pre-wrap">
                      {summaryQ.data.preview}
                    </p>
                  )}
                </>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">لا يوجد ملخص.</p>
              )}
              {(summaryQ.data?.invalidCount ?? 0) > 0 && (
                <p className="mt-2 text-[11px] text-destructive">
                  توجد {summaryQ.data?.invalidCount} سجلات فارغة لا تُحتسب في الجاهزية.
                </p>
              )}
            </>
          )}
        </Section>

        <Section title="تفاصيل شرح تمكين">
          {explanationsQ.isLoading ? (
            <Loading />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                عدد الشروحات الصالحة:{" "}
                <span className="text-foreground font-medium">
                  {explanationsQ.data?.count ?? 0}
                </span>
              </p>
              {(explanationsQ.data?.invalidCount ?? 0) > 0 && (
                <p className="mt-1 text-[11px] text-destructive">
                  توجد {explanationsQ.data?.invalidCount} سجلات فارغة لا تُحتسب في الجاهزية.
                </p>
              )}
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

        <Section title="تفاصيل أسئلة الكتاب واختبر فهمك">
          {questionsQ.isLoading ? (
            <Loading />
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  ["أسئلة الكتاب", questionsQ.data?.officialBook],
                  ["اختبر فهمك", questionsQ.data?.selfTest],
                ].map(([label, value]) => {
                  const summary = value as NonNullable<typeof questionsQ.data>["officialBook"];
                  return (
                    <div key={label as string} className="rounded-lg border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-medium text-foreground">{label as string}</h3>
                        <span className="text-xs text-muted-foreground">
                          {summary?.count ?? 0} سؤالًا
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        المنشور حاليًا: {summary?.publishedCount ?? 0}
                      </p>
                      {Object.keys(summary?.types ?? {}).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {Object.entries(summary.types).map(([type, count]) => (
                            <span
                              key={type}
                              className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground"
                            >
                              {questionTypeLabelAr(type)}{" "}
                              <span className="text-muted-foreground">×{count}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {((questionsQ.data?.unclassifiedCount ?? 0) > 0 ||
                (questionsQ.data?.invalidSelfTestCount ?? 0) > 0) && (
                <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
                  {(questionsQ.data?.unclassifiedCount ?? 0) > 0 && (
                    <p>غير مصنفة تعليميًا: {questionsQ.data?.unclassifiedCount}</p>
                  )}
                  {(questionsQ.data?.invalidSelfTestCount ?? 0) > 0 && (
                    <p>اختبر فهمك ببنية غير صالحة: {questionsQ.data?.invalidSelfTestCount}</p>
                  )}
                </div>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                لا تُعرض نصوص الأسئلة أو الإجابات الصحيحة هنا.
              </p>
            </>
          )}
        </Section>

        <Section title="تفاصيل الخريطة الذهنية والتجربة المعملية">
          {resourcesQ.isLoading ? (
            <Loading />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Stat label="الخريطة الذهنية" value={capabilityContract.mindMap.count} />
                <Stat label="التجربة المعملية" value={capabilityContract.simulation.count} />
              </div>
              {(resourcesQ.data?.items ?? []).length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {resourcesQ.data!.items.map((r: any) => (
                    <li key={r.id} className="flex items-center gap-2">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                        {resourceCategoryLabel(r)}
                      </span>
                      <span className="text-foreground/80">{r.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Section>

        <Section title="تفاصيل المحاكاة القديمة">
          {simulationsQ.isLoading ? (
            <Loading />
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                عدد المحاكاة:{" "}
                <span className="text-foreground font-medium">{simulationsQ.data?.count ?? 0}</span>
              </p>
              {(simulationsQ.data?.items ?? []).length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-foreground/80">
                  {simulationsQ.data!.items.map((s: any) => (
                    <li key={s.id}>• {s.title}</li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-[11px] text-muted-foreground">
                هذه سجلات قديمة تُحتسب ضمن «التجربة المعملية» عند وجودها.
              </p>
            </>
          )}
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
