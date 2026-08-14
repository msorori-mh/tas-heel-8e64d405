import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
  M01_COLUMNS,
  M01_REQUIRED_COLUMNS,
  M02_COLUMNS,
  M02_REQUIRED_COLUMNS,
  MINISTERIAL_IMPORT_ORDER,
  MINISTERIAL_ROUND_CODES,
  MINISTERIAL_TEMPLATE_KEYS,
  assertNoForbiddenM02Columns,
  assertRequiredColumns,
  buildMinisterialModelCode,
  describeBlockReason,
  PREVIEW_ACTION_LABEL_AR,
} from "@/lib/ministerial/ministerial-import-contract";
import {
  executeM01,
  executeM02,
  listMinisterialModels,
  prepareM01,
  prepareM02,
  publishMinisterialModel,
  setMinisterialModelStatus,
  type MinisterialPrepareResult,
} from "@/lib/ministerial/ministerial-admin.client";
import { Loader2, ScrollText, ShieldCheck, Download, PlayCircle, FileSearch } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ministerial-exams")({
  component: AdminMinisterialExamsPage,
});

const ROUND_LABEL_AR: Record<string, string> = {
  r1: "الدور الأول",
  r2: "الدور الثاني",
  r3: "الدور الثالث",
  makeup: "دورة استدراكية",
};

type SubjectRow = {
  id: string;
  code: string | null;
  name: string;
  grade_id: string | null;
};

function toCsv(headers: readonly string[], rows: string[][]): string {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return (
    "\uFEFF" +
    [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n") +
    "\n"
  );
}

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.trim() !== "");
  if (lines.length === 0) return { headers: [], rows: [] };
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((v) => v.trim());
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase());
  const rows = lines.slice(1).map((line) => {
    const cells = split(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cells[i] ?? "";
    });
    return row;
  });
  return { headers, rows };
}

/** Drops empty optional keys so forbidden-column detection stays exact server-side. */
function compact(row: Record<string, string>, allowed: readonly string[]) {
  const out: Record<string, string> = {};
  for (const key of allowed) {
    const value = row[key];
    if (value !== undefined && value !== "") out[key] = value;
  }
  return out;
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
        grades: (grades.data ?? []) as { id: string; name: string; slug: string }[],
      };
    },
  });

  // ---------------------------------------------------------- context generator
  const [gradeId, setGradeId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [trackId, setTrackId] = useState("");
  const [year, setYear] = useState("2025");
  const [round, setRound] = useState("r1");
  const [variant, setVariant] = useState("main");
  const [label, setLabel] = useState("");

  const ref = refQuery.data;
  const subjectsForGrade = useMemo(
    () => (ref?.subjects ?? []).filter((s) => !gradeId || s.grade_id === gradeId),
    [ref, gradeId],
  );
  const subject = ref?.subjects.find((s) => s.id === subjectId) ?? null;

  /** Only tracks actively assigned to the subject are selectable. */
  const tracksForSubject = useMemo(() => {
    if (!ref || !subjectId) return [];
    const activeIds = new Set(
      ref.links.filter((l) => l.subject_id === subjectId && l.is_active).map((l) => l.curriculum_track_id),
    );
    return ref.tracks.filter((t) => t.is_active && activeIds.has(t.id));
  }, [ref, subjectId]);

  const track = tracksForSubject.find((t) => t.id === trackId) ?? null;

  const generatedCode = useMemo(() => {
    if (!subject?.code || !track) return "";
    try {
      return buildMinisterialModelCode({
        subjectCode: subject.code,
        trackCode: track.track_code,
        academicYear: Number(year),
        roundCode: round,
        variantCode: variant,
      });
    } catch {
      return "";
    }
  }, [subject, track, year, round, variant]);

  // -------------------------------------------------------------- import state
  const [m01Text, setM01Text] = useState("");
  const [m02Text, setM02Text] = useState("");
  const [m01Prepare, setM01Prepare] = useState<MinisterialPrepareResult | null>(null);
  const [m02Prepare, setM02Prepare] = useState<MinisterialPrepareResult | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [filterGrade, setFilterGrade] = useState("all");
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterTrack, setFilterTrack] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [filterRound, setFilterRound] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const models = modelsQuery.data ?? [];
  const filteredModels = models.filter(
    (m) =>
      (filterGrade === "all" || m.grade_slug === filterGrade) &&
      (filterSubject === "all" || m.subject_code === filterSubject) &&
      (filterTrack === "all" || m.track_code === filterTrack) &&
      (filterYear === "all" || String(m.academic_year) === filterYear) &&
      (filterRound === "all" || m.round_code === filterRound) &&
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

  function handlePrepare(kind: "M01" | "M02") {
    const text = kind === "M01" ? m01Text : m02Text;
    void run(`prepare-${kind}`, async () => {
      const parsed = parseCsv(text);
      if (parsed.rows.length === 0) throw new Error("لا توجد صفوف في الملف.");
      if (kind === "M01") {
        assertRequiredColumns(parsed.headers, M01_REQUIRED_COLUMNS, MINISTERIAL_TEMPLATE_KEYS.m01);
        const result = await prepareM01(parsed.rows.map((r) => compact(r, M01_COLUMNS)));
        setM01Prepare(result);
      } else {
        assertNoForbiddenM02Columns(parsed.headers);
        assertRequiredColumns(parsed.headers, M02_REQUIRED_COLUMNS, MINISTERIAL_TEMPLATE_KEYS.m02);
        const result = await prepareM02(parsed.rows.map((r) => compact(r, M02_COLUMNS)));
        setM02Prepare(result);
      }
      toast.success("تم التجهيز — راجع المعاينة قبل التنفيذ.");
    });
  }

  function handleExecute(kind: "M01" | "M02") {
    const prepare = kind === "M01" ? m01Prepare : m02Prepare;
    if (!prepare) return;
    void run(`execute-${kind}`, async () => {
      const result = kind === "M01" ? await executeM01(prepare.prepare_id) : await executeM02(prepare.prepare_id);
      toast.success(
        `تم التنفيذ: إضافة ${result.inserted} / تحديث ${result.updated} / تخطي ${result.skipped} / محجوب ${result.blocked}`,
      );
      if (kind === "M01") setM01Prepare(null);
      else setM02Prepare(null);
      await queryClient.invalidateQueries({ queryKey: ["ministerial-models"] });
    });
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
            مسار مستقل تماماً عن قوالب المحتوى 01–09. الترتيب الإلزامي:{" "}
            <span className="font-mono">{MINISTERIAL_IMPORT_ORDER.join(" ← ")}</span>. الأسئلة تأتي
            حصراً من بنك الأسئلة المنشور — لا نص سؤال ولا إجابة داخل قوالب النماذج.
          </p>
        </header>

        {/* ------------------------------------------------ context generator */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">المولّد السياقي</CardTitle>
            <CardDescription>
              اختر السياق، والنظام يولّد كود النموذج (TCS-2) تلقائياً — لا يُكتب يدوياً.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>الصف</Label>
                <Select
                  value={gradeId}
                  onValueChange={(v) => {
                    setGradeId(v);
                    setSubjectId("");
                    setTrackId("");
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="اختر الصف" /></SelectTrigger>
                  <SelectContent>
                    {(ref?.grades ?? []).map((g) => (
                      <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>المادة</Label>
                <Select value={subjectId} onValueChange={(v) => { setSubjectId(v); setTrackId(""); }}>
                  <SelectTrigger><SelectValue placeholder="اختر المادة" /></SelectTrigger>
                  <SelectContent>
                    {subjectsForGrade.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name} — {s.code}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>المسار</Label>
                <Select value={trackId} onValueChange={setTrackId} disabled={!subjectId}>
                  <SelectTrigger><SelectValue placeholder="المسارات المرتبطة بالمادة" /></SelectTrigger>
                  <SelectContent>
                    {tracksForSubject.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.track_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>السنة</Label>
                <Input value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" />
              </div>
              <div className="space-y-1.5">
                <Label>الدور</Label>
                <Select value={round} onValueChange={setRound}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MINISTERIAL_ROUND_CODES.map((r) => (
                      <SelectItem key={r} value={r}>{ROUND_LABEL_AR[r]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>رمز النموذج (variant)</Label>
                <Input value={variant} onChange={(e) => setVariant(e.target.value)} placeholder="main" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>اسم العرض (اختياري)</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="النموذج أ" />
              </div>
            </div>

            <div className="rounded-xl border border-primary/25 bg-primary/5 p-3">
              <p className="text-xs text-muted-foreground">كود النموذج المولَّد</p>
              <p className="font-mono text-sm text-foreground break-all">
                {generatedCode || "— اختر المادة والمسار أولاً —"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={!generatedCode || !subject?.code || !track}
                onClick={() =>
                  downloadCsv(
                    "M01_ministerial_models.csv",
                    toCsv(M01_COLUMNS, [
                      [subject?.code ?? "", track?.track_code ?? "", year, round, variant, label],
                    ]),
                  )
                }
              >
                <Download className="ms-1 h-4 w-4" />
                تحميل M01 مُهيّأ
              </Button>
              <Button
                variant="outline"
                disabled={!generatedCode}
                onClick={() =>
                  downloadCsv(
                    "M02_ministerial_model_questions.csv",
                    toCsv(M02_COLUMNS, [[generatedCode, "", "1", "", "1", "", "", "1"]]),
                  )
                }
              >
                <Download className="ms-1 h-4 w-4" />
                تحميل M02 مُهيّأ
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ----------------------------------------------------- M01 / M02 import */}
        {(["M01", "M02"] as const).map((kind) => {
          const prepare = kind === "M01" ? m01Prepare : m02Prepare;
          const text = kind === "M01" ? m01Text : m02Text;
          const setText = kind === "M01" ? setM01Text : setM02Text;
          return (
            <Card key={kind}>
              <CardHeader>
                <CardTitle className="text-lg">
                  {kind === "M01" ? "استيراد M01 — النماذج" : "استيراد M02 — أسئلة النموذج"}
                </CardTitle>
                <CardDescription>
                  {kind === "M01"
                    ? "ينشئ مسودة فقط. لا نشر تلقائي، ولا تغيير لهوية نموذج منشور."
                    : "يربط أسئلة منشورة بالنموذج (إضافي فقط). غياب سؤال من الملف لا يحذفه."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea
                  dir="ltr"
                  rows={5}
                  className="font-mono text-xs"
                  placeholder={`${(kind === "M01" ? M01_COLUMNS : M02_COLUMNS).join(",")}`}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => handlePrepare(kind)} disabled={busy !== null || !text.trim()}>
                    {busy === `prepare-${kind}` ? (
                      <Loader2 className="ms-1 h-4 w-4 animate-spin" />
                    ) : (
                      <FileSearch className="ms-1 h-4 w-4" />
                    )}
                    فحص وتجهيز
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleExecute(kind)}
                    disabled={busy !== null || !prepare}
                  >
                    {busy === `execute-${kind}` ? (
                      <Loader2 className="ms-1 h-4 w-4 animate-spin" />
                    ) : (
                      <PlayCircle className="ms-1 h-4 w-4" />
                    )}
                    تنفيذ
                  </Button>
                </div>

                {prepare && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2 text-xs">
                      <Badge variant="secondary">صفوف: {prepare.summary.rows}</Badge>
                      <Badge>إضافة: {prepare.summary.insert}</Badge>
                      <Badge variant="outline">تحديث: {prepare.summary.update}</Badge>
                      <Badge variant="outline">تخطي: {prepare.summary.skip}</Badge>
                      <Badge variant="destructive">محجوب: {prepare.summary.blocked}</Badge>
                    </div>
                    <div className="overflow-x-auto rounded-lg border border-border/60">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>#</TableHead>
                            {kind === "M01" ? (
                              <>
                                <TableHead>المادة</TableHead>
                                <TableHead>المسار</TableHead>
                                <TableHead>السنة/الدور</TableHead>
                                <TableHead>كود النموذج</TableHead>
                              </>
                            ) : (
                              <>
                                <TableHead>كود السؤال</TableHead>
                                <TableHead>النسخة المثبَّتة</TableHead>
                                <TableHead>الترتيب</TableHead>
                                <TableHead>الدرجة</TableHead>
                              </>
                            )}
                            <TableHead>الإجراء</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {prepare.preview.map((row) => (
                            <TableRow key={row.row_number}>
                              <TableCell>{row.row_number}</TableCell>
                              {kind === "M01" ? (
                                <>
                                  <TableCell>{row.subject_code}</TableCell>
                                  <TableCell>{row.track_code}</TableCell>
                                  <TableCell>
                                    {row.academic_year} / {row.round_code}
                                  </TableCell>
                                  <TableCell className="font-mono text-xs">{row.model_code}</TableCell>
                                </>
                              ) : (
                                <>
                                  <TableCell className="font-mono text-xs">{row.question_code}</TableCell>
                                  <TableCell className="font-mono text-[10px]">
                                    {row.pinned_revision_id ?? "—"}
                                  </TableCell>
                                  <TableCell>{row.display_order}</TableCell>
                                  <TableCell>{row.marks}</TableCell>
                                </>
                              )}
                              <TableCell>
                                <span className="text-xs">
                                  {PREVIEW_ACTION_LABEL_AR[row.action]}
                                  {row.blocked_reason ? ` — ${describeBlockReason(row.blocked_reason)}` : ""}
                                </span>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {/* --------------------------------------------------------- models list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">قائمة النماذج</CardTitle>
            <CardDescription>
              المادة المشتركة تظهر مرة واحدة، لكن لكل مسار نموذجه المستقل (صنعاء ≠ عدن).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <FilterSelect label="الصف" value={filterGrade} onChange={setFilterGrade}
                options={[...new Set(models.map((m) => m.grade_slug).filter(Boolean))] as string[]} />
              <FilterSelect label="المادة" value={filterSubject} onChange={setFilterSubject}
                options={[...new Set(models.map((m) => m.subject_code))]} />
              <FilterSelect label="المسار" value={filterTrack} onChange={setFilterTrack}
                options={[...new Set(models.map((m) => m.track_code))]} />
              <FilterSelect label="السنة" value={filterYear} onChange={setFilterYear}
                options={[...new Set(models.map((m) => String(m.academic_year)))]} />
              <FilterSelect label="الدور" value={filterRound} onChange={setFilterRound}
                options={[...MINISTERIAL_ROUND_CODES]} />
              <FilterSelect label="الحالة" value={filterStatus} onChange={setFilterStatus}
                options={["draft", "published", "archived"]} />
            </div>

            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>الكود</TableHead>
                    <TableHead>المادة</TableHead>
                    <TableHead>المسار</TableHead>
                    <TableHead>السنة/الدور</TableHead>
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
                      <TableCell>
                        {m.academic_year} / {ROUND_LABEL_AR[m.round_code] ?? m.round_code}
                      </TableCell>
                      <TableCell>{m.question_count}</TableCell>
                      <TableCell>
                        <Badge variant={m.status === "published" ? "default" : "secondary"}>
                          {m.status === "published" ? "منشور" : m.status === "archived" ? "مؤرشف" : "مسودة"}
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
                                  await queryClient.invalidateQueries({ queryKey: ["ministerial-models"] });
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
                                  await queryClient.invalidateQueries({ queryKey: ["ministerial-models"] });
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
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">الكل</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
