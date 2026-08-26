import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ATTEMPT_TYPE_LABEL,
  attemptTypeLabel,
  fetchAdminUnifiedPerformance,
  formatElapsed,
  formatPercentage,
  PerformanceUnavailableError,
  type AttemptType,
} from "@/lib/performance/unified-performance-api";
import { Loader2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/learning-insights/performance")({
  head: () => ({
    meta: [
      { title: "تحليل الأداء الموحد | لوحة إدارة تمكين" },
      {
        name: "description",
        content: "مؤشرات أداء مجمّعة للطلاب: المتوسطات والتقدم وأضعف المواد والدروس.",
      },
      { property: "og:title", content: "تحليل الأداء الموحد | تمكين" },
      { property: "og:description", content: "لوحة مؤشرات أداء مجمّعة في تمكين." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminUnifiedPerformancePage,
});

const ALL = "__all__";
const ATTEMPT_TYPES: AttemptType[] = [
  "ALL",
  "ORDINARY",
  "MINISTERIAL",
  "MINISTERIAL_TRAINING",
  "MINISTERIAL_STRICT",
];

function AdminUnifiedPerformancePage() {
  const { enabled, loading } = useRequireAdminSection("full");
  const [gradeId, setGradeId] = useState(ALL);
  const [trackId, setTrackId] = useState(ALL);
  const [subjectId, setSubjectId] = useState(ALL);
  const [attemptType, setAttemptType] = useState<AttemptType>("ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const refs = useQuery({
    queryKey: ["admin-performance-refs"],
    enabled,
    queryFn: async () => {
      const [grades, tracks, subjects] = await Promise.all([
        supabase.from("grades").select("id, name").order("name"),
        supabase.from("curriculum_tracks").select("id, track_name").order("track_name"),
        supabase.from("subjects").select("id, name").order("name"),
      ]);
      return {
        grades: grades.data ?? [],
        tracks: tracks.data ?? [],
        subjects: subjects.data ?? [],
      };
    },
  });

  const perf = useQuery({
    queryKey: ["admin-unified-performance", gradeId, trackId, subjectId, attemptType, from, to],
    enabled,
    queryFn: () =>
      fetchAdminUnifiedPerformance({
        gradeId: gradeId === ALL ? null : gradeId,
        trackId: trackId === ALL ? null : trackId,
        subjectId: subjectId === ALL ? null : subjectId,
        attemptType,
        from: from ? new Date(from).toISOString() : null,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : null,
        limit: 20,
      }),
    // DEFECT-16-01: unavailable RPC → immediate Arabic notice, no retry spinner.
    retry: (count, error) => !(error instanceof PerformanceUnavailableError) && count < 1,
  });

  const data = perf.data;
  const unavailable = perf.error instanceof PerformanceUnavailableError;

  if (loading || !enabled) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div dir="rtl" className="space-y-5">
        <header>
          <h1 className="text-xl font-extrabold text-foreground">تحليل الأداء الموحد</h1>
          <p className="text-sm text-muted-foreground">
            مؤشرات مجمّعة فقط — لا تظهر هوية أي طالب ولا أي إجابة صحيحة.
          </p>
        </header>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">عوامل التصفية</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>الصف</Label>
              <Select value={gradeId} onValueChange={setGradeId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>كل الصفوف</SelectItem>
                  {(refs.data?.grades ?? []).map((g) => (
                    <SelectItem key={g.id} value={g.id}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>المنهج</Label>
              <Select value={trackId} onValueChange={setTrackId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>كل المناهج</SelectItem>
                  {(refs.data?.tracks ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.track_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>المادة</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>كل المواد</SelectItem>
                  {(refs.data?.subjects ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>نوع المحاولات</Label>
              <Select value={attemptType} onValueChange={(v) => setAttemptType(v as AttemptType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ATTEMPT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {ATTEMPT_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>من تاريخ</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>إلى تاريخ</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {perf.isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          </div>
        ) : unavailable ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              تحليل الأداء غير متاح حالياً.
            </CardContent>
          </Card>
        ) : perf.error ? (
          <Card>
            <CardContent className="p-6 text-sm text-destructive">تعذّر تحميل التحليل.</CardContent>
          </Card>
        ) : data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-4">
              {[
                ["المحاولات", String(data.summary.attempts_count)],
                ["متوسط الدرجات", formatPercentage(data.summary.avg_percentage)],
                ["نسبة الإتمام", formatPercentage(data.summary.completion_percentage)],
                ["متوسط الزمن", formatElapsed(data.summary.avg_elapsed_seconds)],
                ["نسبة الخطأ", formatPercentage(data.summary.wrong_rate)],
                ["نسبة الفراغ", formatPercentage(data.summary.blank_rate)],
                ["أتقنوها لاحقاً", formatPercentage(data.summary.mastered_later_rate)],
                ["أخطاء متكررة", formatPercentage(data.summary.repeated_mistake_rate)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-border bg-card p-4">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-extrabold">{value}</p>
                </div>
              ))}
            </div>

            <p className="flex items-center gap-2 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              تُخفى أي مجموعة يقل عدد طلابها عن {data.privacy_min_group_size}.
            </p>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">حسب نوع الاختبار</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>النوع</TableHead>
                      <TableHead>المحاولات</TableHead>
                      <TableHead>الطلاب</TableHead>
                      <TableHead>المتوسط</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.by_attempt_type.map((r) => (
                      <TableRow key={r.attempt_type}>
                        <TableCell>{attemptTypeLabel(r.attempt_type ?? "")}</TableCell>
                        <TableCell>{r.attempts ?? 0}</TableCell>
                        <TableCell>{r.students_count}</TableCell>
                        <TableCell>{formatPercentage(r.avg_percentage)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid gap-3 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">أضعف المواد</CardTitle>
                  <CardDescription>الأقل متوسطاً ضمن نطاق التصفية.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.weakest_subjects.map((s) => (
                    <div key={s.subject_id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{s.subject_name ?? "—"}</span>
                      <Badge variant="secondary">{formatPercentage(s.avg_percentage)}</Badge>
                    </div>
                  ))}
                  {data.weakest_subjects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">لا توجد بيانات كافية.</p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">أضعف الدروس</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.weakest_lessons.map((l) => (
                    <div key={l.lesson_id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{l.lesson_title ?? "—"}</span>
                      <Badge variant="secondary">{formatPercentage(l.accuracy)}</Badge>
                    </div>
                  ))}
                  {data.weakest_lessons.length === 0 ? (
                    <p className="text-sm text-muted-foreground">لا توجد بيانات كافية.</p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">أعلى نسبة ترك فارغ</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.highest_blank_rate.map((l) => (
                    <div key={l.lesson_id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{l.lesson_title ?? "—"}</span>
                      <Badge variant="secondary">{formatPercentage(l.blank_rate)}</Badge>
                    </div>
                  ))}
                  {data.highest_blank_rate.length === 0 ? (
                    <p className="text-sm text-muted-foreground">لا توجد بيانات كافية.</p>
                  ) : null}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">أعلى تكرار للأخطاء</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {data.highest_repeated_mistake_rate.map((l) => (
                    <div key={l.lesson_id} className="flex items-center justify-between text-sm">
                      <span className="truncate">{l.lesson_title ?? "—"}</span>
                      <Badge variant="secondary">{formatPercentage(l.repeated_mistake_rate)}</Badge>
                    </div>
                  ))}
                  {data.highest_repeated_mistake_rate.length === 0 ? (
                    <p className="text-sm text-muted-foreground">لا توجد بيانات كافية.</p>
                  ) : null}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">تفصيل المواد</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>المادة</TableHead>
                      <TableHead>الطلاب</TableHead>
                      <TableHead>المحاولات</TableHead>
                      <TableHead>المتوسط</TableHead>
                      <TableHead>الإتمام</TableHead>
                      <TableHead>الخطأ</TableHead>
                      <TableHead>الفراغ</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.by_subject.map((s) => (
                      <TableRow key={s.subject_id}>
                        <TableCell className="max-w-[180px] truncate">
                          {s.subject_name ?? "—"}
                        </TableCell>
                        <TableCell>{s.students_count}</TableCell>
                        <TableCell>{s.attempts}</TableCell>
                        <TableCell>{formatPercentage(s.avg_percentage)}</TableCell>
                        <TableCell>{formatPercentage(s.completion_percentage)}</TableCell>
                        <TableCell>{formatPercentage(s.wrong_rate)}</TableCell>
                        <TableCell>{formatPercentage(s.blank_rate)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </AdminLayout>
  );
}
