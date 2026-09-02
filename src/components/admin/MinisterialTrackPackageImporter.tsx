import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  executeMinisterialTrackPackage,
  prepareMinisterialTrackPackage,
  type MinisterialPackagePrepareResult,
} from "@/lib/ministerial/ministerial-admin-api";
import { describeBlockReason } from "@/lib/ministerial/ministerial-import-contract";
import {
  buildMinisterialPackageTemplate,
  parseMinisterialPackageWorkbook,
  type MinisterialPackageTrack,
  type MinisterialTrackPackage,
} from "@/lib/ministerial/ministerial-package-xlsx";
import { Download, FileCheck2, FileSearch, Loader2, PlayCircle, Upload } from "lucide-react";

type SubjectReference = { id: string; code: string | null; name: string; grade_id: string | null };
type TrackReference = {
  id: string;
  track_code: string;
  track_name: string;
  is_active: boolean;
};
type LinkReference = { subject_id: string; curriculum_track_id: string; is_active: boolean };

export function MinisterialTrackPackageImporter({
  subjects,
  tracks,
  links,
  onExecuted,
}: {
  subjects: SubjectReference[];
  tracks: TrackReference[];
  links: LinkReference[];
  onExecuted: () => Promise<void> | void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [trackCode, setTrackCode] = useState<MinisterialPackageTrack>("sanaa");
  const [subjectId, setSubjectId] = useState("");
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<MinisterialTrackPackage | null>(null);
  const [prepared, setPrepared] = useState<MinisterialPackagePrepareResult | null>(null);
  const [busy, setBusy] = useState<"template" | "read" | "prepare" | "execute" | null>(null);

  const track = tracks.find(
    (candidate) => candidate.track_code === trackCode && candidate.is_active,
  );
  const subjectsForTrack = useMemo(() => {
    if (!track) return [];
    const assigned = new Set(
      links
        .filter((link) => link.curriculum_track_id === track.id && link.is_active)
        .map((link) => link.subject_id),
    );
    return subjects.filter((subject) => assigned.has(subject.id) && subject.code);
  }, [links, subjects, track]);
  const subject = subjectsForTrack.find((candidate) => candidate.id === subjectId) ?? null;
  const totalQuestions =
    parsed?.models.reduce((sum, model) => sum + model.questions.length, 0) ?? 0;

  function resetFile() {
    setFileName("");
    setParsed(null);
    setPrepared(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function run<T>(key: NonNullable<typeof busy>, fn: () => Promise<T>): Promise<T | null> {
    setBusy(key);
    try {
      return await fn();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشلت العملية.");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function downloadTemplate() {
    if (!subject?.code) return;
    await run("template", async () => {
      const bytes = await buildMinisterialPackageTemplate({
        trackCode,
        subjectCode: subject.code!,
        subjectName: subject.name,
      });
      const blob = new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ministerial-${trackCode}-${subject.code}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("تم تنزيل القالب السياقي.");
    });
  }

  async function readFile(file: File | null) {
    if (!file || !subject?.code) return;
    resetFile();
    setFileName(file.name);
    await run("read", async () => {
      const result = await parseMinisterialPackageWorkbook(file, {
        trackCode,
        subjectCode: subject.code!,
        subjectName: subject.name,
      });
      setParsed(result);
      toast.success(
        `تم فحص ${result.models.length} نموذج و${result.models.reduce((sum, model) => sum + model.questions.length, 0)} سؤال.`,
      );
    });
  }

  async function prepare() {
    if (!parsed) return;
    const result = await run("prepare", () => prepareMinisterialTrackPackage(parsed));
    if (!result) return;
    setPrepared(result);
    if (result.summary.blocked > 0) {
      toast.error("توجد نماذج محجوبة. راجع المعاينة قبل التنفيذ.");
    } else {
      toast.success("اكتمل التجهيز. راجع البصمات ثم نفّذ إنشاء المسودات.");
    }
  }

  async function execute() {
    if (!prepared || prepared.summary.blocked > 0) return;
    const result = await run("execute", () =>
      executeMinisterialTrackPackage(prepared.prepare_id, prepared.prepare_fingerprint),
    );
    if (!result) return;
    toast.success(
      `أُنشئ ${result.inserted_models} نموذج و${result.inserted_questions} سؤال. النشر ما زال خطوة مستقلة.`,
    );
    resetFile();
    await onExecuted();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">استيراد حزمة اختبارات وزارية</CardTitle>
        <CardDescription>
          اختر المسار أولًا؛ لكل مسار قالب وعقد مستقلان. ينشئ التنفيذ مسودات فقط، وتبقى خطوة النشر
          منفصلة ومحكومة بفحوص النسخ والبصمات.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>المسار</Label>
            <Select
              value={trackCode}
              disabled={busy !== null}
              onValueChange={(value) => {
                setTrackCode(value as MinisterialPackageTrack);
                setSubjectId("");
                resetFile();
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sanaa">مسار صنعاء — اختيار متعدد مثل المفاضلة</SelectItem>
                <SelectItem value="aden">مسار عدن — إجابة نصية ومراجعة نموذجية</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>المادة — الثالث الثانوي</Label>
            <Select
              value={subjectId}
              disabled={busy !== null}
              onValueChange={(value) => {
                setSubjectId(value);
                resetFile();
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="اختر المادة" />
              </SelectTrigger>
              <SelectContent>
                {subjectsForTrack.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
          <p className="font-semibold text-foreground">
            {trackCode === "sanaa" ? "قالب صنعاء" : "قالب عدن"}
          </p>
          <p className="mt-1 text-muted-foreground">
            {trackCode === "sanaa"
              ? "ورقة فهرس + ورقة لكل نموذج: نص السؤال، أربعة خيارات، الإجابة الصحيحة، الشرح، والترتيب."
              : "ورقة فهرس + ورقة لكل نموذج: نص السؤال، الإجابة النموذجية، الشرح، والترتيب. لا توجد خيارات اختيار متعدد."}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            disabled={!subject?.code || busy !== null}
            onClick={() => void downloadTemplate()}
          >
            {busy === "template" ? (
              <Loader2 className="ms-1 h-4 w-4 animate-spin" />
            ) : (
              <Download className="ms-1 h-4 w-4" />
            )}
            تحميل القالب
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ministerial-track-package" className="flex items-center gap-1.5">
            <Upload className="h-4 w-4" aria-hidden /> ملف الحزمة XLSX
          </Label>
          <Input
            ref={inputRef}
            id="ministerial-track-package"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={!subject?.code || busy !== null}
            onChange={(event) => void readFile(event.target.files?.[0] ?? null)}
          />
          {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
        </div>

        {parsed && (
          <div className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">
                <FileCheck2 className="ms-1 h-3.5 w-3.5" />
                النماذج: {parsed.models.length}
              </Badge>
              <Badge variant="secondary">الأسئلة: {totalQuestions}</Badge>
              <Badge variant="outline">{trackCode === "sanaa" ? "MCQ × 4" : "إجابة نصية"}</Badge>
            </div>
            <p className="break-all font-mono text-[10px] text-muted-foreground">
              SHA-256: {parsed.source_sha256}
            </p>
            <ul className="space-y-1 text-sm text-foreground">
              {parsed.models.map((model) => (
                <li key={`${model.academic_year}-${model.variant_code}`}>
                  {model.model_label} — {model.academic_year} — {model.questions.length} سؤال
                </li>
              ))}
            </ul>
            <Button disabled={busy !== null} onClick={() => void prepare()}>
              {busy === "prepare" ? (
                <Loader2 className="ms-1 h-4 w-4 animate-spin" />
              ) : (
                <FileSearch className="ms-1 h-4 w-4" />
              )}
              تجهيز ومعاينة الخادم
            </Button>
          </div>
        )}

        {prepared && (
          <div className="space-y-3 border-t border-border pt-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge>إضافة: {prepared.summary.insert}</Badge>
              <Badge variant="outline">مطابق: {prepared.summary.skip}</Badge>
              <Badge variant={prepared.summary.blocked ? "destructive" : "outline"}>
                محجوب: {prepared.summary.blocked}
              </Badge>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>النموذج</TableHead>
                    <TableHead>السنة</TableHead>
                    <TableHead>الأسئلة</TableHead>
                    <TableHead>البصمة</TableHead>
                    <TableHead>القرار</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prepared.preview.map((row) => (
                    <TableRow key={row.model_code}>
                      <TableCell>
                        <p>{row.model_label}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {row.model_code}
                        </p>
                      </TableCell>
                      <TableCell>{row.academic_year}</TableCell>
                      <TableCell>{row.question_count}</TableCell>
                      <TableCell className="font-mono text-[10px]">
                        {row.fingerprint.slice(0, 16)}…
                      </TableCell>
                      <TableCell>
                        {row.action === "INSERT"
                          ? "إضافة"
                          : row.action === "SKIP"
                            ? "مطابق — تخطي"
                            : `محجوب — ${describeBlockReason(row.blocked_reason)}`}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="break-all font-mono text-[10px] text-muted-foreground">
              Prepare: {prepared.prepare_fingerprint}
            </p>
            <Button
              variant="secondary"
              disabled={busy !== null || prepared.summary.blocked > 0}
              onClick={() => void execute()}
            >
              {busy === "execute" ? (
                <Loader2 className="ms-1 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="ms-1 h-4 w-4" />
              )}
              إنشاء المسودات والأسئلة المثبتة
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
