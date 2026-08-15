import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  ADMIN_MISTAKE_SCOPE_LABEL,
  formatPercent,
  getAdminMistakeInsights,
  type AdminMistakeScope,
} from "@/lib/mistakes/admin-mistake-insights-api";
import { AlertTriangle, BookOpen, Loader2, ShieldCheck, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/learning-insights/mistakes")({
  head: () => ({
    meta: [
      { title: "تحليلات الأخطاء التعليمية | لوحة إدارة تمكين" },
      {
        name: "description",
        content: "تحليلات مجمّعة لأخطاء الطلاب: الأسئلة الأكثر خطأً والدروس والمواد الأضعف.",
      },
      { property: "og:title", content: "تحليلات الأخطاء التعليمية | تمكين" },
      {
        property: "og:description",
        content: "لوحة تحليلات مجمّعة لأخطاء الطلاب في تمكين.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminMistakeInsightsPage,
});

const ALL = "__all__";

function AdminMistakeInsightsPage() {
  const { enabled, loading } = useRequireAdminSection("full");
  const [gradeId, setGradeId] = useState<string>(ALL);
  const [trackId, setTrackId] = useState<string>(ALL);
  const [subjectId, setSubjectId] = useState<string>(ALL);
  const [lessonId, setLessonId] = useState<string>(ALL);
  const [scope, setScope] = useState<AdminMistakeScope>("ALL");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const refs = useQuery({
    queryKey: ["admin-mistake-insight-refs"],
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

  const lessons = useQuery({
    queryKey: ["admin-mistake-insight-lessons", subjectId],
    enabled: enabled && subjectId !== ALL,
    queryFn: async () => {
      const { data } = await supabase
        .from("lessons")
        .select("id, title")
        .eq("subject_id", subjectId)
        .order("title");
      return data ?? [];
    },
  });

  const insights = useQuery({
    queryKey: ["admin-mistake-insights", gradeId, trackId, subjectId, lessonId, scope, from, to],
    enabled,
    queryFn: () =>
      getAdminMistakeInsights({
        gradeId: gradeId === ALL ? null : gradeId,
        trackId: trackId === ALL ? null : trackId,
        subjectId: subjectId === ALL ? null : subjectId,
        lessonId: lessonId === ALL ? null : lessonId,
        scope,
        from: from ? new Date(from).toISOString() : null,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : null,
        limit: 30,
      }),
  });

  const data = insights.data;
  const topByBlank = [...(data?.top_questions ?? [])]
    .sort((a, b) => b.blank_percentage - a.blank_percentage)
    .slice(0, 10);
  const weakestLessons = (data?.by_lesson ?? []).slice(0, 10);
  const weakestSubjects = (data?.by_subject ?? []).slice(0, 10);

  return (
    <AdminLayout>
      <div className="space-y-6" dir="rtl">
        <header className="space-y-1">
          <h1 className="text-xl font-bold text-foreground md:text-2xl">تحليلات الأخطاء التعليمية</h1>
          <p className="text-sm text-muted-foreground">
            تحليلات مجمّعة مشتقّة من محاولات الطلاب الفعلية — بدون أي بيانات تعريف للطلاب وبدون كشف الإجابات.
          </p>
          <Badge variant="secondary" className="gap-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            بيانات مجمّعة فقط
          </Badge>
        </header>

        {loading || !enabled ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">الفلاتر</CardTitle>
                <CardDescription>حصر التحليلات حسب الصف والمنهج والمادة والدرس والنطاق والفترة.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>الصف</Label>
                  <Select value={gradeId} onValueChange={setGradeId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>كل الصفوف</SelectItem>
                      {(refs.data?.grades ?? []).map((g) => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>المنهج</Label>
                  <Select value={trackId} onValueChange={setTrackId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>كل المناهج</SelectItem>
                      {(refs.data?.tracks ?? []).map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.track_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>المادة</Label>
                  <Select
                    value={subjectId}
                    onValueChange={(v) => {
                      setSubjectId(v);
                      setLessonId(ALL);
                    }}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>كل المواد</SelectItem>
                      {(refs.data?.subjects ?? []).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>الدرس</Label>
                  <Select value={lessonId} onValueChange={setLessonId} disabled={subjectId === ALL}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>كل الدروس</SelectItem>
                      {(lessons.data ?? []).map((l) => (
                        <SelectItem key={l.id} value={l.id}>{l.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>نطاق المحاولات</Label>
                  <Select value={scope} onValueChange={(v) => setScope(v as AdminMistakeScope)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(ADMIN_MISTAKE_SCOPE_LABEL) as AdminMistakeScope[]).map((k) => (
                        <SelectItem key={k} value={k}>{ADMIN_MISTAKE_SCOPE_LABEL[k]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label>من تاريخ</Label>
                    <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>إلى تاريخ</Label>
                    <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {insights.isPending ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : insights.isError ? (
              <Card>
                <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  تعذّر تحميل التحليلات حالياً.
                </CardContent>
              </Card>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
                  <SummaryTile label="إجمالي مرات الخطأ" value={data?.summary.total_mistake_occurrences ?? 0} />
                  <SummaryTile label="أسئلة عليها أخطاء" value={data?.summary.unique_questions_with_mistakes ?? 0} />
                  <SummaryTile label="أخطاء متكررة" value={data?.summary.repeated_mistakes ?? 0} />
                  <SummaryTile label="نسبة الترك (Blank)" value={formatPercent(data?.summary.blank_rate)} />
                  <SummaryTile label="نسبة الإتقان اللاحق" value={formatPercent(data?.summary.mastered_later_rate)} />
                  <SummaryTile label="إجمالي المحاولات المقيّمة" value={data?.summary.total_evaluated_occurrences ?? 0} />
                </div>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <TrendingDown className="h-4 w-4 text-destructive" />
                      أكثر الأسئلة خطأً
                    </CardTitle>
                    <CardDescription>مرتّبة حسب عدد مرات الخطأ/الترك.</CardDescription>
                  </CardHeader>
                  <CardContent className="overflow-x-auto p-0 sm:p-2">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">السؤال</TableHead>
                          <TableHead className="text-right">المادة / الدرس</TableHead>
                          <TableHead className="text-right">محاولات</TableHead>
                          <TableHead className="text-right">خطأ</TableHead>
                          <TableHead className="text-right">ترك</TableHead>
                          <TableHead className="text-right">إتقان لاحق</TableHead>
                          <TableHead className="text-right">إجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(data?.top_questions ?? []).map((q) => (
                          <TableRow key={q.question_id}>
                            <TableCell className="max-w-[260px]">
                              <div className="text-xs text-muted-foreground">{q.question_code ?? "—"}</div>
                              <div className="line-clamp-2 text-sm">{q.question_preview || "—"}</div>
                            </TableCell>
                            <TableCell className="text-sm">
                              <div>{q.subject_name ?? "—"}</div>
                              <div className="text-xs text-muted-foreground">{q.lesson_title ?? "بدون درس"}</div>
                            </TableCell>
                            <TableCell className="text-sm">{q.attempt_count}</TableCell>
                            <TableCell className="text-sm">
                              {q.wrong_count} <span className="text-xs text-muted-foreground">({formatPercent(q.wrong_percentage)})</span>
                            </TableCell>
                            <TableCell className="text-sm">
                              {q.blank_count} <span className="text-xs text-muted-foreground">({formatPercent(q.blank_percentage)})</span>
                            </TableCell>
                            <TableCell className="text-sm">{formatPercent(q.mastered_later_percentage)}</TableCell>
                            <TableCell className="space-x-1 space-x-reverse whitespace-nowrap">
                              <Button asChild size="sm" variant="outline">
                                <Link to="/admin/questions" search={{ q: q.question_code ?? "" }}>
                                  بنك الأسئلة
                                </Link>
                              </Button>
                              {q.lesson_id ? (
                                <Button asChild size="sm" variant="ghost">
                                  <Link to="/admin/lessons/$lessonId" params={{ lessonId: q.lesson_id }}>
                                    الدرس
                                  </Link>
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                        {(data?.top_questions ?? []).length === 0 && (
                          <TableRow>
                            <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                              لا توجد بيانات مطابقة للفلاتر.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">أعلى نسبة ترك (Blank)</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {topByBlank.map((q) => (
                        <div key={q.question_id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2">
                          <span className="line-clamp-1 text-sm">{q.question_preview || q.question_code || "—"}</span>
                          <Badge variant="outline">{formatPercent(q.blank_percentage)}</Badge>
                        </div>
                      ))}
                      {topByBlank.length === 0 && <p className="text-sm text-muted-foreground">لا توجد بيانات.</p>}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <BookOpen className="h-4 w-4" />
                        الدروس الأضعف
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {weakestLessons.map((l) => (
                        <div key={l.lesson_id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2">
                          <div className="min-w-0">
                            <div className="line-clamp-1 text-sm">{l.lesson_title ?? "—"}</div>
                            <div className="text-xs text-muted-foreground">{l.subject_name ?? "—"}</div>
                          </div>
                          <Badge variant="outline">{l.mistake_occurrences}</Badge>
                        </div>
                      ))}
                      {weakestLessons.length === 0 && <p className="text-sm text-muted-foreground">لا توجد بيانات.</p>}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">المواد الأضعف</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {weakestSubjects.map((s) => (
                        <div key={s.subject_id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2">
                          <span className="line-clamp-1 text-sm">{s.subject_name ?? "—"}</span>
                          <Badge variant="outline">{s.mistake_occurrences}</Badge>
                        </div>
                      ))}
                      {weakestSubjects.length === 0 && <p className="text-sm text-muted-foreground">لا توجد بيانات.</p>}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">التوزيع حسب الصف والمنهج</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {(data?.by_grade ?? []).map((g) => (
                        <div key={g.grade_id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-2">
                          <span className="text-sm">{g.grade_name ?? "—"}</span>
                          <Badge variant="outline">{g.mistake_occurrences}</Badge>
                        </div>
                      ))}
                      {(data?.by_track ?? []).map((t) => (
                        <div key={t.track_id} className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border p-2">
                          <span className="text-sm">{t.track_name ?? "—"}</span>
                          <Badge variant="secondary">{t.mistake_occurrences}</Badge>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </AdminLayout>
  );
}

function SummaryTile({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-xl font-bold text-foreground">{value}</p>
      </CardContent>
    </Card>
  );
}
