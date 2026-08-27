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
  DEFAULT_MINISTERIAL_ROUND_CODE,
  DEFAULT_MINISTERIAL_VARIANT_CODE,
  M01_COLUMNS,
  M01_OPERATOR_COLUMNS,
  M01_OPERATOR_REQUIRED_COLUMNS,
  M02_COLUMNS,
  M02_REQUIRED_COLUMNS,
  MINISTERIAL_IMPORT_ORDER,
  MINISTERIAL_TEMPLATE_KEYS,
  assertNoForbiddenM02Columns,
  assertRequiredColumns,
  buildMinisterialModelCode,
  describeBlockReason,
  normalizeM01OperatorRow,
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
} from "@/lib/ministerial/ministerial-admin-api";
import {
  Download,
  FilePlus2,
  FileSearch,
  Files,
  Loader2,
  PlayCircle,
  ScrollText,
  ShieldCheck,
  Upload,
} from "lucide-react";

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

function toCsv(headers: readonly string[], rows: string[][]): string {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return (
    "\uFEFF" + [headers.join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n") + "\n"
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
        grades: (grades.data ?? []) as GradeRow[],
      };
    },
  });

  // ---------------------------------------------------------- context generator
  const [workspaceMode, setWorkspaceMode] = useState<"single" | "bulk">("single");
  const [subjectId, setSubjectId] = useState("");
  const [trackId, setTrackId] = useState("");
  const [year, setYear] = useState("2025");
  const [label, setLabel] = useState("");

  const ref = refQuery.data;
  const grade12 = useMemo(() => (ref?.grades ?? []).find(isGrade12Reference) ?? null, [ref]);
  const subjectsForGrade = useMemo(
    () => (ref?.subjects ?? []).filter((s) => grade12 !== null && s.grade_id === grade12.id),
    [ref, grade12],
  );
  const subject = subjectsForGrade.find((s) => s.id === subjectId) ?? null;

  /** Only tracks actively assigned to the subject are selectable. */
  const tracksForSubject = useMemo(() => {
    if (!ref || !subjectId) return [];
    const activeIds = new Set(
      ref.links
        .filter((l) => l.subject_id === subjectId && l.is_active)
        .map((l) => l.curriculum_track_id),
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
        roundCode: DEFAULT_MINISTERIAL_ROUND_CODE,
        variantCode: DEFAULT_MINISTERIAL_VARIANT_CODE,
      });
    } catch {
      return "";
    }
  }, [subject, track, year]);

  // -------------------------------------------------------------- import state
  const [m01Text, setM01Text] = useState("");
  const [m02Text, setM02Text] = useState("");
  const [m01Prepare, setM01Prepare] = useState<MinisterialPrepareResult | null>(null);
  const [m02Prepare, setM02Prepare] = useState<MinisterialPrepareResult | null>(null);
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

  function handlePrepare(kind: "M01" | "M02") {
    const text = kind === "M01" ? m01Text : m02Text;
    void run(`prepare-${kind}`, async () => {
      const parsed = parseCsv(text);
      if (parsed.rows.length === 0) throw new Error("لا توجد صفوف في الملف.");
      if (kind === "M01") {
        assertRequiredColumns(
          parsed.headers,
          M01_OPERATOR_REQUIRED_COLUMNS,
          MINISTERIAL_TEMPLATE_KEYS.m01,
        );
        const result = await prepareM01(
          parsed.rows.map((row) => compact(normalizeM01OperatorRow(row), M01_COLUMNS)),
        );
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

  function handlePrepareSingleModel() {
    void run("prepare-single-model", async () => {
      if (!grade12) throw new Error("تعذر العثور على الصف الثالث الثانوي في البيانات المرجعية.");
      if (!subject?.code || !track || !generatedCode) {
        throw new Error("اختر المادة والمسار وأدخل سنة صحيحة أولاً.");
      }
      const result = await prepareM01([
        compact(
          normalizeM01OperatorRow({
            subject_code: subject.code,
            track_code: track.track_code,
            academic_year: year,
            model_label: label,
          }),
          M01_COLUMNS,
        ),
      ]);
      setM01Prepare(result);
      toast.success("تم تجهيز النموذج الجديد — راجع المعاينة قبل إنشاء المسودة.");
    });
  }

  function handleCsvFile(kind: "M01" | "M02", file: File | null) {
    if (!file) return;
    void run(`read-${kind}`, async () => {
      const text = await file.text();
      if (!text.trim()) throw new Error("الملف فارغ.");
      if (kind === "M01") {
        setM01Text(text);
        setM01Prepare(null);
      } else {
        setM02Text(text);
        setM02Prepare(null);
      }
      toast.success(`تم تحميل ملف ${kind}. افحصه قبل التنفيذ.`);
    });
  }

  function handleExecute(kind: "M01" | "M02") {
    const prepare = kind === "M01" ? m01Prepare : m02Prepare;
    if (!prepare) return;
    void run(`execute-${kind}`, async () => {
      const result =
        kind === "M01"
          ? await executeM01(prepare.prepare_id)
          : await executeM02(prepare.prepare_id);
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

        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row">
            <Button
              type="button"
              variant={workspaceMode === "single" ? "default" : "outline"}
              className="h-auto flex-1 justify-start gap-3 py-3 text-right"
              aria-pressed={workspaceMode === "single"}
              onClick={() => {
                setWorkspaceMode("single");
                setM01Prepare(null);
              }}
            >
              <FilePlus2 className="h-5 w-5 shrink-0" aria-hidden />
              <span>
                <span className="block font-semibold">إضافة نموذج جديد</span>
                <span className="mt-0.5 block text-xs font-normal opacity-80">
                  نموذج واحد مع توليد الكود تلقائيًا
                </span>
              </span>
            </Button>
            <Button
              type="button"
              variant={workspaceMode === "bulk" ? "default" : "outline"}
              className="h-auto flex-1 justify-start gap-3 py-3 text-right"
              aria-pressed={workspaceMode === "bulk"}
              onClick={() => {
                setWorkspaceMode("bulk");
                setM01Prepare(null);
              }}
            >
              <Files className="h-5 w-5 shrink-0" aria-hidden />
              <span>
                <span className="block font-semibold">الاستيراد المتعدد</span>
                <span className="mt-0.5 block text-xs font-normal opacity-80">
                  ارفع ملفات CSV تحتوي عدة نماذج أو أسئلة
                </span>
              </span>
            </Button>
          </CardContent>
        </Card>

        {/* ------------------------------------------------ context generator */}
        {workspaceMode === "single" && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">إضافة نموذج جديد</CardTitle>
              <CardDescription>
                هذه النماذج للصف الثالث الثانوي فقط. اختر المادة والمسار والسنة، وسيولّد النظام
                الكود تلقائيًا دون دور أو رمز نموذج يدوي.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>الصف</Label>
                  <div className="flex h-10 items-center rounded-md border border-input bg-muted/40 px-3 text-sm font-medium text-foreground">
                    {grade12?.name ?? "الثالث الثانوي فقط"}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>المادة</Label>
                  <Select
                    value={subjectId}
                    onValueChange={(v) => {
                      setSubjectId(v);
                      setTrackId("");
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="اختر المادة" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjectsForGrade.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} — {s.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>المسار</Label>
                  <Select value={trackId} onValueChange={setTrackId} disabled={!subjectId}>
                    <SelectTrigger>
                      <SelectValue placeholder="المسارات المرتبطة بالمادة" />
                    </SelectTrigger>
                    <SelectContent>
                      {tracksForSubject.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.track_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>السنة</Label>
                  <Input
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>اسم العرض (اختياري)</Label>
                  <Input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="النموذج أ"
                  />
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
                  disabled={!generatedCode || !subject?.code || !track || busy !== null}
                  onClick={handlePrepareSingleModel}
                >
                  {busy === "prepare-single-model" ? (
                    <Loader2 className="ms-1 h-4 w-4 animate-spin" />
                  ) : (
                    <FileSearch className="ms-1 h-4 w-4" />
                  )}
                  فحص النموذج الجديد
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

              {m01Prepare && (
                <div className="space-y-3 border-t border-border pt-4">
                  <PreparePreview kind="M01" prepare={m01Prepare} />
                  <Button
                    variant="secondary"
                    onClick={() => handleExecute("M01")}
                    disabled={busy !== null}
                  >
                    {busy === "execute-M01" ? (
                      <Loader2 className="ms-1 h-4 w-4 animate-spin" />
                    ) : (
                      <PlayCircle className="ms-1 h-4 w-4" />
                    )}
                    إنشاء المسودة
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ----------------------------------------------------- M01 / M02 import */}
        {workspaceMode === "bulk" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">الاستيراد المتعدد</CardTitle>
                <CardDescription>
                  حمّل القوالب المبسطة ثم ارفع CSV واحدًا أو الصق محتواه. الدور ورمز النموذج
                  يُولّدان تلقائيًا لكل صف.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    downloadCsv("M01_ministerial_models.csv", toCsv(M01_OPERATOR_COLUMNS, []))
                  }
                >
                  <Download className="ms-1 h-4 w-4" />
                  تحميل قالب النماذج
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    downloadCsv("M02_ministerial_model_questions.csv", toCsv(M02_COLUMNS, []))
                  }
                >
                  <Download className="ms-1 h-4 w-4" />
                  تحميل قالب الأسئلة
                </Button>
              </CardContent>
            </Card>
            {(["M01", "M02"] as const).map((kind) => {
              const prepare = kind === "M01" ? m01Prepare : m02Prepare;
              const text = kind === "M01" ? m01Text : m02Text;
              const setText = kind === "M01" ? setM01Text : setM02Text;
              return (
                <Card key={kind}>
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {kind === "M01" ? "استيراد نماذج متعددة" : "استيراد أسئلة متعددة"}
                    </CardTitle>
                    <CardDescription>
                      {kind === "M01"
                        ? "ينشئ مسودة فقط. لا نشر تلقائي، ولا تغيير لهوية نموذج منشور."
                        : "يربط أسئلة منشورة بالنموذج (إضافي فقط). غياب سؤال من الملف لا يحذفه."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1.5">
                      <Label
                        htmlFor={`ministerial-${kind}-file`}
                        className="flex items-center gap-1.5"
                      >
                        <Upload className="h-4 w-4" aria-hidden />
                        ملف CSV
                      </Label>
                      <Input
                        id={`ministerial-${kind}-file`}
                        type="file"
                        accept=".csv,text/csv"
                        disabled={busy !== null}
                        onChange={(event) => handleCsvFile(kind, event.target.files?.[0] ?? null)}
                      />
                    </div>
                    <Textarea
                      dir="ltr"
                      rows={5}
                      className="font-mono text-xs"
                      placeholder={`${(kind === "M01" ? M01_OPERATOR_COLUMNS : M02_COLUMNS).join(",")}`}
                      value={text}
                      onChange={(e) => {
                        setText(e.target.value);
                        if (kind === "M01") setM01Prepare(null);
                        else setM02Prepare(null);
                      }}
                    />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={() => handlePrepare(kind)}
                        disabled={busy !== null || !text.trim()}
                      >
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

                    {prepare && <PreparePreview kind={kind} prepare={prepare} />}
                  </CardContent>
                </Card>
              );
            })}
          </>
        )}

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

function PreparePreview({
  kind,
  prepare,
}: {
  kind: "M01" | "M02";
  prepare: MinisterialPrepareResult;
}) {
  return (
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
                  <TableHead>السنة</TableHead>
                  <TableHead>كود النموذج التلقائي</TableHead>
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
                    <TableCell>{row.academic_year}</TableCell>
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
