import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  adenToday,
  daysBetween,
  examCountdownLabel,
  EXAM_KIND_LABEL,
  pickUpcomingExam,
  schedulesOverlap,
  type ExamSchedule,
} from "@/lib/exams/exam-countdown";
import { arabicCount, DAY_FORMS } from "@/lib/i18n/arabic-count";

export const Route = createFileRoute("/_authenticated/admin/exam-schedule")({
  component: ExamSchedulePage,
});
const newSchedule = (): ExamSchedule => ({
  id: "",
  curriculum_track_id: "",
  grade_id: null,
  semester: null,
  exam_kind: "semester_final",
  title: "اختبارات نهاية الفصل",
  starts_on: "",
  ends_on: null,
  is_published: false,
});
const ADMIN_KIND_LABEL = { ...EXAM_KIND_LABEL, semester_final: "اختبار نهاية الفصل" };
const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";
function ExamSchedulePage() {
  const access = useRequireAdminSection("full");
  const cache = useQueryClient();
  const today = adenToday();
  const [draft, setDraft] = useState<ExamSchedule | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExamSchedule | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewTrack, setPreviewTrack] = useState("");
  const [previewGrade, setPreviewGrade] = useState("");
  const rows = useQuery({
    queryKey: ["admin-exam-schedule"],
    enabled: access.enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exam_schedule")
        .select(
          "id,curriculum_track_id,grade_id,semester,exam_kind,title,starts_on,ends_on,is_published",
        )
        .order("starts_on");
      if (error) throw error;
      return data as ExamSchedule[];
    },
  });
  const references = useQuery({
    queryKey: ["exam-schedule-reference"],
    enabled: access.enabled,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const [tracks, grades] = await Promise.all([
        supabase.from("curriculum_tracks").select("id,track_name,track_code").order("track_name"),
        supabase.from("grades").select("id,name").order("sort_order"),
      ]);
      if (tracks.error) throw tracks.error;
      if (grades.error) throw grades.error;
      return { tracks: tracks.data, grades: grades.data };
    },
  });
  const refresh = async () => {
    await Promise.all([
      cache.invalidateQueries({ queryKey: ["admin-exam-schedule"] }),
      cache.invalidateQueries({ queryKey: ["exam-countdown"] }),
    ]);
  };
  const mutate = async (action: () => PromiseLike<{ error: unknown }>, success: string) => {
    if (!access.enabled || busy) return false;
    setBusy(true);
    try {
      const { error } = await action();
      if (error) throw error;
      await refresh();
      toast.success(success);
      return true;
    } catch {
      toast.error("تعذّر حفظ التغيير. تحقق من الاتصال والصلاحيات ثم حاول مجدداً.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  const updateChoices = (patch: Partial<ExamSchedule>) => {
    if (!draft) return;
    const updated = { ...draft, ...patch };
    const suggested = `${updated.exam_kind === "semester_final" ? "اختبارات نهاية الفصل" : EXAM_KIND_LABEL[updated.exam_kind]}${updated.semester ? (updated.semester === 1 ? " الأول" : " الثاني") : ""}`;
    setDraft({ ...updated, title: suggested });
  };
  if (access.loading || !access.allowed) return null;
  const tracks = references.data?.tracks ?? [];
  const grades = references.data?.grades ?? [];
  const preview = pickUpcomingExam(rows.data ?? [], {
    trackId: previewTrack,
    gradeId: previewGrade || null,
    today,
  });
  const overlap =
    draft && draft.starts_on && (rows.data ?? []).some((row) => schedulesOverlap(draft, row));
  return (
    <AdminLayout>
      <div className="space-y-5" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">مواعيد الاختبارات</h1>
          <Button
            className="min-h-11"
            disabled={!references.data || rows.isError}
            onClick={() => setDraft({ ...newSchedule(), curriculum_track_id: tracks[0]?.id ?? "" })}
          >
            إضافة موعد
          </Button>
        </div>
        <section className="space-y-3 rounded-xl border p-4" aria-label="معاينة الطالب">
          <h2 className="font-bold">معاينة ما يراه الطالب</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              المنهج
              <select
                className={selectClass}
                value={previewTrack}
                onChange={(e) => setPreviewTrack(e.target.value)}
              >
                <option value="">اختر المنهج</option>
                {tracks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.track_name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              الصف
              <select
                className={selectClass}
                value={previewGrade}
                onChange={(e) => setPreviewGrade(e.target.value)}
              >
                <option value="">اختر الصف</option>
                {grades.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p role="status" className="text-sm">
            {previewTrack && previewGrade
              ? `سيرى طالب ${grades.find((g) => g.id === previewGrade)?.name} – ${tracks.find((t) => t.id === previewTrack)?.track_name}: ${preview ? examCountdownLabel(preview, today) : "لا يوجد موعد منشور مناسب"}`
              : "اختر المنهج والصف لعرض المعاينة."}
          </p>
        </section>
        {rows.isPending || references.isPending ? (
          <p role="status">جارٍ تحميل المواعيد…</p>
        ) : rows.isError || references.isError ? (
          <div role="alert">
            <p>تعذّر تحميل المواعيد أو قوائم المنهج والصف.</p>
            <Button
              onClick={() => {
                void rows.refetch();
                void references.refetch();
              }}
            >
              إعادة المحاولة
            </Button>
          </div>
        ) : !rows.data?.length ? (
          <p className="rounded-xl border p-5">
            لم تُضف مواعيد بعد. لن يظهر العدّاد للطلاب حتى تضيف موعداً وتنشره.
          </p>
        ) : (
          tracks.map((track) => {
            const group = rows.data
              .filter((row) => row.curriculum_track_id === track.id)
              .sort(
                (a, b) =>
                  Number((a.ends_on ?? a.starts_on) < today) -
                    Number((b.ends_on ?? b.starts_on) < today) ||
                  a.starts_on.localeCompare(b.starts_on),
              );
            return !group.length ? null : (
              <section key={track.id} className="space-y-3">
                <h2 className="text-lg font-bold">{track.track_name}</h2>
                <div className="overflow-x-auto rounded-xl border">
                  <table className="w-full text-right text-sm">
                    <thead>
                      <tr>
                        {[
                          "العنوان",
                          "الصف",
                          "الفصل",
                          "النوع",
                          "من",
                          "إلى",
                          "الحالة",
                          "الأيام المتبقية",
                          "الإجراءات",
                        ].map((t) => (
                          <th key={t} className="whitespace-nowrap p-3">
                            {t}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.map((row) => {
                        const ended = (row.ends_on ?? row.starts_on) < today;
                        return (
                          <tr
                            key={row.id}
                            className={`border-t ${ended ? "bg-muted text-muted-foreground" : ""}`}
                          >
                            <td className="p-3">{row.title}</td>
                            <td className="p-3 whitespace-nowrap">
                              {grades.find((g) => g.id === row.grade_id)?.name ?? "كل الصفوف"}
                            </td>
                            <td className="p-3">
                              {row.semester === 1
                                ? "الأول"
                                : row.semester === 2
                                  ? "الثاني"
                                  : "غير مرتبط"}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              {ADMIN_KIND_LABEL[row.exam_kind]}
                            </td>
                            <td className="p-3 whitespace-nowrap">{row.starts_on}</td>
                            <td className="p-3 whitespace-nowrap">{row.ends_on ?? "—"}</td>
                            <td className="p-3">{row.is_published ? "منشور" : "مسودة"}</td>
                            <td className="p-3 whitespace-nowrap">
                              {ended
                                ? "انتهى"
                                : daysBetween(today, row.starts_on) <= 0
                                  ? "جارية"
                                  : arabicCount(daysBetween(today, row.starts_on), DAY_FORMS)}
                            </td>
                            <td className="flex gap-2 p-3">
                              <Button
                                variant="outline"
                                className="min-h-11"
                                disabled={busy}
                                onClick={() => setDraft({ ...row })}
                              >
                                تعديل
                              </Button>
                              <Button
                                variant="outline"
                                className="min-h-11"
                                disabled={busy}
                                onClick={() =>
                                  void mutate(
                                    () =>
                                      supabase
                                        .from("exam_schedule")
                                        .update({ is_published: !row.is_published })
                                        .eq("id", row.id),
                                    "تم تحديث حالة النشر",
                                  )
                                }
                              >
                                {row.is_published ? "إخفاء" : "نشر"}
                              </Button>
                              <Button
                                variant="destructive"
                                className="min-h-11"
                                disabled={busy}
                                onClick={() => setDeleteTarget(row)}
                              >
                                حذف
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })
        )}
        <Dialog
          open={!!draft}
          onOpenChange={(open) => {
            if (!open && !busy) setDraft(null);
          }}
        >
          <DialogContent
            dir="rtl"
            className="max-h-[90vh] overflow-y-auto [&>button]:min-h-11 [&>button]:min-w-11"
          >
            <DialogHeader>
              <DialogTitle>{draft?.id ? "تعديل موعد الاختبار" : "إضافة موعد الاختبار"}</DialogTitle>
            </DialogHeader>
            {draft && (
              <form
                className="space-y-4"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (draft.ends_on && draft.ends_on < draft.starts_on) {
                    toast.error("تاريخ النهاية يجب ألا يسبق البداية.");
                    return;
                  }
                  const { id, ...value } = draft;
                  const saved = await mutate(
                    () =>
                      id
                        ? supabase.from("exam_schedule").update(value).eq("id", id)
                        : supabase.from("exam_schedule").insert(value),
                    "تم حفظ الموعد",
                  );
                  if (saved) setDraft(null);
                }}
              >
                <label className="block">
                  المنهج
                  <select
                    required
                    className={selectClass}
                    value={draft.curriculum_track_id}
                    onChange={(e) => updateChoices({ curriculum_track_id: e.target.value })}
                  >
                    {tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.track_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  الصف
                  <select
                    className={selectClass}
                    value={draft.grade_id ?? ""}
                    onChange={(e) => updateChoices({ grade_id: e.target.value || null })}
                  >
                    <option value="">كل الصفوف</option>
                    {grades.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  الفصل
                  <select
                    className={selectClass}
                    value={draft.semester ?? ""}
                    onChange={(e) =>
                      updateChoices({ semester: e.target.value ? Number(e.target.value) : null })
                    }
                  >
                    <option value="">لا يرتبط بفصل</option>
                    <option value="1">الأول</option>
                    <option value="2">الثاني</option>
                  </select>
                </label>
                <label className="block">
                  النوع
                  <select
                    className={selectClass}
                    value={draft.exam_kind}
                    onChange={(e) =>
                      updateChoices({ exam_kind: e.target.value as ExamSchedule["exam_kind"] })
                    }
                  >
                    {Object.entries(ADMIN_KIND_LABEL).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  العنوان
                  <Input
                    className="min-h-11"
                    required
                    minLength={3}
                    maxLength={80}
                    value={draft.title}
                    onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label>
                    تاريخ البداية
                    <Input
                      className="min-h-11"
                      required
                      type="date"
                      value={draft.starts_on}
                      onChange={(e) => setDraft({ ...draft, starts_on: e.target.value })}
                    />
                  </label>
                  <label>
                    تاريخ النهاية (اختياري)
                    <Input
                      className="min-h-11"
                      type="date"
                      min={draft.starts_on || undefined}
                      value={draft.ends_on ?? ""}
                      onChange={(e) => setDraft({ ...draft, ends_on: e.target.value || null })}
                    />
                  </label>
                </div>
                <label className="flex min-h-11 items-center gap-3">
                  <input
                    type="checkbox"
                    checked={draft.is_published}
                    onChange={(e) => setDraft({ ...draft, is_published: e.target.checked })}
                  />
                  نشر للطلاب
                </label>
                {overlap && (
                  <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
                    يوجد موعد منشور متداخل لنفس المنهج والصف والنوع. يمكنك الحفظ بعد مراجعة التداخل.
                  </p>
                )}
                <Button
                  type="submit"
                  className="min-h-11 w-full"
                  disabled={busy || !draft.curriculum_track_id}
                >
                  {busy ? "جارٍ الحفظ…" : "حفظ الموعد"}
                </Button>
              </form>
            )}
          </DialogContent>
        </Dialog>
        <AlertDialog
          open={!!deleteTarget}
          onOpenChange={(open) => {
            if (!open && !busy) setDeleteTarget(null);
          }}
        >
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle>حذف هذا الموعد؟</AlertDialogTitle>
              <AlertDialogDescription>
                سيُحذف موعد «{deleteTarget?.title}» فقط. لا يمكن التراجع عن الحذف.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="min-h-11" disabled={busy}>
                إلغاء
              </AlertDialogCancel>
              <AlertDialogAction
                className="min-h-11"
                disabled={busy}
                onClick={async (e) => {
                  e.preventDefault();
                  if (
                    deleteTarget &&
                    (await mutate(
                      () => supabase.from("exam_schedule").delete().eq("id", deleteTarget.id),
                      "تم حذف الموعد",
                    ))
                  )
                    setDeleteTarget(null);
                }}
              >
                تأكيد حذف الموعد
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AdminLayout>
  );
}
