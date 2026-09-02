import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { supabase } from "@/integrations/supabase/client";
import {
  listMinisterialModels,
  publishMinisterialModel,
  setMinisterialModelStatus,
} from "@/lib/ministerial/ministerial-admin-api";
import { MinisterialTrackPackageImporter } from "@/components/admin/MinisterialTrackPackageImporter";
import { ScrollText, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ministerial-exams")({
  component: AdminMinisterialExamsPage,
});

type SubjectRow = {
  id: string;
  code: string | null;
  name: string;
  grade_id: string | null;
};

type GradeRow = { id: string; name: string; slug: string };

function isGrade12Reference(grade: Pick<GradeRow, "name" | "slug">): boolean {
  const slug = grade.slug.trim().toLowerCase();
  return (
    slug === "grade-12" ||
    slug === "g12" ||
    /(^|-)12($|-)/.test(slug) ||
    /الثالث\s+الثانوي|الثاني\s+عشر/.test(grade.name)
  );
}

function isGrade12Model(model: { grade_slug: string | null; model_code: string }): boolean {
  const slug = (model.grade_slug ?? "").trim().toLowerCase();
  return slug === "grade-12" || slug === "g12" || model.model_code.startsWith("mex-g12-");
}

function AdminMinisterialExamsPage() {
  const { loading, enabled } = useRequireAdminSection("content");
  const queryClient = useQueryClient();

  const modelsQuery = useQuery({
    queryKey: ["ministerial-models"],
    queryFn: listMinisterialModels,
    enabled,
  });

  const refQuery = useQuery({
    queryKey: ["ministerial-reference"],
    enabled,
    queryFn: async () => {
      const [subjects, tracks, links, grades] = await Promise.all([
        supabase.from("subjects").select("id, code, name, grade_id").order("code"),
        supabase.from("curriculum_tracks").select("id, track_code, track_name, is_active"),
        supabase
          .from("subject_curriculum_tracks")
          .select("subject_id, curriculum_track_id, is_active"),
        supabase.from("grades").select("id, name, slug").order("sort_order"),
      ]);
      return {
        subjects: (subjects.data ?? []) as SubjectRow[],
        tracks: (tracks.data ?? []) as {
          id: string;
          track_code: string;
          track_name: string;
          is_active: boolean;
        }[],
        links: (links.data ?? []) as {
          subject_id: string;
          curriculum_track_id: string;
          is_active: boolean;
        }[],
        grades: (grades.data ?? []) as GradeRow[],
      };
    },
  });

  const ref = refQuery.data;
  const grade12 = useMemo(() => (ref?.grades ?? []).find(isGrade12Reference) ?? null, [ref]);
  const subjectsForGrade = useMemo(
    () => (ref?.subjects ?? []).filter((s) => grade12 !== null && s.grade_id === grade12.id),
    [ref, grade12],
  );
  const [busy, setBusy] = useState<string | null>(null);

  const [filterSubject, setFilterSubject] = useState("all");
  const [filterTrack, setFilterTrack] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const models = modelsQuery.data ?? [];
  const modelsForGrade12 = models.filter(isGrade12Model);
  const filteredModels = modelsForGrade12.filter(
    (m) =>
      (filterSubject === "all" || m.subject_code === filterSubject) &&
      (filterTrack === "all" || m.track_code === filterTrack) &&
      (filterYear === "all" || String(m.academic_year) === filterYear) &&
      (filterStatus === "all" || m.status === filterStatus),
  );

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    try {
      await fn();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشلت العملية");
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          جاري التحميل…
        </div>
      </AdminLayout>
    );
  }
  if (!enabled) return null;

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl space-y-6" dir="rtl">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary shrink-0" />
            <h1 className="text-2xl font-bold text-foreground">النماذج الوزارية السابقة</h1>
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            حزمة XLSX واحدة لكل مادة ومسار، مع عقدين منفصلين لصنعاء وعدن. يفحص النظام الملف محليًا
            ثم يعرض بصمة ومعاينة خادمية قبل إنشاء المسودات، ولا ينشر أي نموذج تلقائيًا.
          </p>
        </header>

        <MinisterialTrackPackageImporter
          subjects={subjectsForGrade}
          tracks={ref?.tracks ?? []}
          links={ref?.links ?? []}
          onExecuted={() => queryClient.invalidateQueries({ queryKey: ["ministerial-models"] })}
        />

        {/* --------------------------------------------------------- models list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">قائمة النماذج</CardTitle>
            <CardDescription>
              المادة المشتركة تظهر مرة واحدة، لكن لكل مسار نموذجه المستقل (صنعاء ≠ عدن).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <FilterSelect
                label="المادة"
                value={filterSubject}
                onChange={setFilterSubject}
                options={[...new Set(modelsForGrade12.map((m) => m.subject_code))]}
              />
              <FilterSelect
                label="المسار"
                value={filterTrack}
                onChange={setFilterTrack}
                options={[...new Set(modelsForGrade12.map((m) => m.track_code))]}
              />
              <FilterSelect
                label="السنة"
                value={filterYear}
                onChange={setFilterYear}
                options={[...new Set(modelsForGrade12.map((m) => String(m.academic_year)))]}
              />
              <FilterSelect
                label="الحالة"
                value={filterStatus}
                onChange={setFilterStatus}
                options={["draft", "published", "archived"]}
              />
            </div>

            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الكود</TableHead>
                    <TableHead>المادة</TableHead>
                    <TableHead>المسار</TableHead>
                    <TableHead>السنة</TableHead>
                    <TableHead>الأسئلة</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead>إجراءات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredModels.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
                        لا توجد نماذج بعد.
                      </TableCell>
                    </TableRow>
                  )}
                  {filteredModels.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-mono text-xs">{m.model_code}</TableCell>
                      <TableCell>{m.subject_name}</TableCell>
                      <TableCell>{m.track_name}</TableCell>
                      <TableCell>{m.academic_year}</TableCell>
                      <TableCell>{m.question_count}</TableCell>
                      <TableCell>
                        <Badge variant={m.status === "published" ? "default" : "secondary"}>
                          {m.status === "published"
                            ? "منشور"
                            : m.status === "archived"
                              ? "مؤرشف"
                              : "مسودة"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {m.status === "draft" && (
                            <Button
                              size="sm"
                              disabled={!m.can_publish || busy !== null}
                              onClick={() =>
                                void run(`publish-${m.id}`, async () => {
                                  await publishMinisterialModel(m.id);
                                  toast.success("تم النشر.");
                                  await queryClient.invalidateQueries({
                                    queryKey: ["ministerial-models"],
                                  });
                                })
                              }
                            >
                              <ShieldCheck className="ms-1 h-4 w-4" />
                              نشر
                            </Button>
                          )}
                          {m.status === "published" && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy !== null}
                              onClick={() =>
                                void run(`archive-${m.id}`, async () => {
                                  await setMinisterialModelStatus(m.id, "archived", "أرشفة إدارية");
                                  toast.success("تمت الأرشفة.");
                                  await queryClient.invalidateQueries({
                                    queryKey: ["ministerial-models"],
                                  });
                                })
                              }
                            >
                              أرشفة
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              لا يوجد حذف مباشر من الواجهة. النشر والأرشفة وإزالة العضوية تمر عبر إجراءات محمية في
              الخادم، ولا تُعاد بناء قواعد الحماية هنا.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">الكل</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
