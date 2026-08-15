import { Fragment, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  fetchAdminReviewCoverage,
  filterLessons,
  buildCoverage,
  type AdminReviewLessonRow,
  type CoverageBucket,
  type ReadinessStatus,
} from "@/lib/review/admin-review-coverage";
import { Loader2, FileText, CheckCircle2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/learning-insights/quick-review")({
  head: () => ({
    meta: [
      { title: "جاهزية المراجعة السريعة | لوحة إدارة تمكين" },
      {
        name: "description",
        content: "تغطية ملخصات الدروس وجاهزية المراجعة السريعة حسب الصف والمسار والمادة.",
      },
      { property: "og:title", content: "جاهزية المراجعة السريعة | تمكين" },
      { property: "og:description", content: "متابعة تغطية ملخصات المراجعة السريعة في تمكين." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminQuickReviewReadinessPage,
});

const ALL = "__all__";
const PAGE_SIZE = 50;

function CoverageTable({ title, rows }: { title: string; rows: CoverageBucket[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-xs">الأقل تغطية أولاً</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">لا توجد بيانات.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الاسم</TableHead>
                  <TableHead className="text-right">الدروس</TableHead>
                  <TableHead className="text-right">جاهزة</TableHead>
                  <TableHead className="text-right">التغطية</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell className="tabular-nums">{row.total}</TableCell>
                    <TableCell className="tabular-nums">{row.ready}</TableCell>
                    <TableCell className="tabular-nums">{row.coverage}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LessonPreview({ lesson }: { lesson: AdminReviewLessonRow }) {
  if (lesson.readiness !== "READY") {
    return <p className="text-sm text-muted-foreground">لا يوجد ملخص لعرضه.</p>;
  }
  return (
    <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3 text-right">
      <p className="whitespace-pre-line text-sm leading-7">{lesson.summary}</p>
      {lesson.keyPoints.length > 0 && (
        <ul className="list-disc space-y-1 pr-5 text-xs text-muted-foreground">
          {lesson.keyPoints.map((point, i) => (
            <li key={i}>{point}</li>
          ))}
        </ul>
      )}
      {lesson.studyTip && <p className="text-xs text-primary">{lesson.studyTip}</p>}
    </div>
  );
}

function AdminQuickReviewReadinessPage() {
  const { enabled } = useRequireAdminSection("full");
  const [gradeId, setGradeId] = useState<string>(ALL);
  const [trackId, setTrackId] = useState<string>(ALL);
  const [subjectId, setSubjectId] = useState<string>(ALL);
  const [readiness, setReadiness] = useState<ReadinessStatus | "ALL">("ALL");
  const [page, setPage] = useState(0);
  const [openLesson, setOpenLesson] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin-quick-review-readiness"],
    queryFn: fetchAdminReviewCoverage,
    enabled,
  });

  const allLessons = data?.lessons ?? [];

  const filtered = useMemo(
    () =>
      filterLessons(allLessons, {
        gradeId: gradeId === ALL ? null : gradeId,
        trackId: trackId === ALL ? null : trackId,
        subjectId: subjectId === ALL ? null : subjectId,
        readiness,
      }),
    [allLessons, gradeId, trackId, subjectId, readiness],
  );

  // Coverage always reflects the current filter selection.
  const scoped = useMemo(() => buildCoverage(filtered), [filtered]);

  const gradeOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of allLessons) if (l.gradeId) map.set(l.gradeId, l.gradeName ?? "—");
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [allLessons]);

  const trackOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of allLessons)
      l.trackIds.forEach((id, i) => map.set(id, l.trackNames[i] ?? "—"));
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [allLessons]);

  const subjectOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of allLessons) map.set(l.subjectId, l.subjectName);
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [allLessons]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  const resetPage = () => setPage(0);

  return (
    <AdminLayout>
      <div className="space-y-6" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold">جاهزية المراجعة السريعة</h1>
          <p className="text-sm text-muted-foreground">
            الدرس جاهز للمراجعة السريعة عندما يملك ملخصاً نصياً. دروس ملفات PDF تتبع القاعدة
            نفسها — لا يتم توليد أي ملخص تلقائياً.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل بيانات التغطية…
          </div>
        )}

        {error && (
          <Card className="border-destructive/40">
            <CardContent className="flex items-center gap-2 p-4 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4" /> تعذّر تحميل بيانات الجاهزية. حاول مرة أخرى.
            </CardContent>
          </Card>
        )}

        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>إجمالي الدروس</CardDescription>
                  <CardTitle className="text-2xl tabular-nums">
                    {scoped.summary.totalLessons}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>دروس بملخص</CardDescription>
                  <CardTitle className="text-2xl tabular-nums text-primary">
                    {scoped.summary.lessonsWithSummary}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>دروس بلا ملخص</CardDescription>
                  <CardTitle className="text-2xl tabular-nums text-destructive">
                    {scoped.summary.lessonsWithoutSummary}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>نسبة التغطية</CardDescription>
                  <CardTitle className="text-2xl tabular-nums">
                    {scoped.summary.coveragePercentage}%
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              <Badge variant="outline">
                دروس PDF: {scoped.summary.pdfLessons} (جاهزة {scoped.summary.pdfReady})
              </Badge>
              <Badge variant="outline">دروس مباشرة بلا وحدة: {scoped.summary.directLessons}</Badge>
            </div>

            <Card>
              <CardContent className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-xs">الصف</Label>
                  <Select
                    value={gradeId}
                    onValueChange={(v) => {
                      setGradeId(v);
                      resetPage();
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>كل الصفوف</SelectItem>
                      {gradeOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">المسار</Label>
                  <Select
                    value={trackId}
                    onValueChange={(v) => {
                      setTrackId(v);
                      resetPage();
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>كل المسارات</SelectItem>
                      {trackOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">المادة</Label>
                  <Select
                    value={subjectId}
                    onValueChange={(v) => {
                      setSubjectId(v);
                      resetPage();
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>كل المواد</SelectItem>
                      {subjectOptions.map((o) => (
                        <SelectItem key={o.id} value={o.id}>
                          {o.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">الجاهزية</Label>
                  <Select
                    value={readiness}
                    onValueChange={(v) => {
                      setReadiness(v as ReadinessStatus | "ALL");
                      resetPage();
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">الكل</SelectItem>
                      <SelectItem value="READY">جاهز</SelectItem>
                      <SelectItem value="NOT_READY">غير جاهز</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <CoverageTable title="التغطية حسب الصف" rows={scoped.byGrade} />
              <CoverageTable title="التغطية حسب المسار" rows={scoped.byTrack} />
              <CoverageTable title="التغطية حسب المادة" rows={scoped.bySubject} />
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">تفاصيل الدروس</CardTitle>
                <CardDescription className="text-xs">
                  {filtered.length} درس — صفحة {safePage + 1} من {pageCount}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {pageRows.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    لا توجد دروس مطابقة لعوامل التصفية الحالية.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-right">الدرس</TableHead>
                          <TableHead className="text-right">المادة</TableHead>
                          <TableHead className="text-right">الوحدة</TableHead>
                          <TableHead className="text-right">نمط التسليم</TableHead>
                          <TableHead className="text-right">الجاهزية</TableHead>
                          <TableHead className="text-right">إجراءات</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageRows.map((lesson) => (
                          <Fragment key={lesson.lessonId}>
                            <TableRow>
                              <TableCell className="font-medium">{lesson.lessonTitle}</TableCell>
                              <TableCell>{lesson.subjectName}</TableCell>
                              <TableCell className="text-muted-foreground">
                                {lesson.unitTitle ?? "درس مباشر"}
                              </TableCell>
                              <TableCell>
                                {lesson.deliveryMode === "standard" ? (
                                  "عادي"
                                ) : (
                                  <span className="inline-flex items-center gap-1">
                                    <FileText className="h-3 w-3" /> PDF
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {lesson.readiness === "READY" ? (
                                  <Badge className="gap-1">
                                    <CheckCircle2 className="h-3 w-3" /> جاهز
                                  </Badge>
                                ) : (
                                  <Badge variant="destructive">غير جاهز</Badge>
                                )}
                              </TableCell>
                              <TableCell className="space-x-1 space-x-reverse whitespace-nowrap">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() =>
                                    setOpenLesson(
                                      openLesson === lesson.lessonId ? null : lesson.lessonId,
                                    )
                                  }
                                >
                                  معاينة
                                </Button>
                                <Button size="sm" variant="outline" asChild>
                                  <Link to="/admin/lessons">تحرير الدرس</Link>
                                </Button>
                              </TableCell>
                            </TableRow>
                            {openLesson === lesson.lessonId && (
                              <TableRow>
                                <TableCell colSpan={6}>
                                  <LessonPreview lesson={lesson} />
                                </TableCell>
                              </TableRow>
                            )}
                          </Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                السابق
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums">
                {safePage + 1} / {pageCount}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                التالي
              </Button>
            </div>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
