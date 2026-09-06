import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
  uploadMinisterialPackageMedia,
  type MinisterialMediaUploadProgress,
  type MinisterialPackagePrepareResult,
} from "@/lib/ministerial/ministerial-admin-api";
import { describeBlockReason } from "@/lib/ministerial/ministerial-import-contract";
import { formatMediaBytes } from "@/lib/ministerial/ministerial-media-contract";
import {
  buildMinisterialPackageTemplate,
  buildMinisterialPackageTemplateZip,
  parseMinisterialPackageFile,
  summarizePackageMedia,
  type MinisterialPackageTrack,
  type MinisterialParsedPackage,
} from "@/lib/ministerial/ministerial-package-xlsx";
import {
  Download,
  FileArchive,
  FileCheck2,
  FileSearch,
  ImageIcon,
  Loader2,
  PlayCircle,
  Upload,
} from "lucide-react";

type SubjectReference = { id: string; code: string | null; name: string; grade_id: string | null };
type TrackReference = {
  id: string;
  track_code: string;
  track_name: string;
  is_active: boolean;
};
type LinkReference = { subject_id: string; curriculum_track_id: string; is_active: boolean };

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function downloadBytes(bytes: Uint8Array, name: string, type: string) {
  const blob = new Blob([bytes as BlobPart], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

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
  const [parsed, setParsed] = useState<MinisterialParsedPackage | null>(null);
  const [prepared, setPrepared] = useState<MinisterialPackagePrepareResult | null>(null);
  const [upload, setUpload] = useState<MinisterialMediaUploadProgress | null>(null);
  const [busy, setBusy] = useState<
    "template" | "template-zip" | "read" | "prepare" | "upload" | "execute" | null
  >(null);

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
  const pkg = parsed?.package ?? null;
  const totalQuestions = pkg?.models.reduce((sum, model) => sum + model.questions.length, 0) ?? 0;
  const mediaSummary = pkg ? summarizePackageMedia(pkg) : null;
  const hasMedia = (parsed?.media.length ?? 0) > 0;

  function resetFile() {
    setFileName("");
    setParsed(null);
    setPrepared(null);
    setUpload(null);
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

  async function downloadTemplate(kind: "xlsx" | "zip") {
    if (!subject?.code) return;
    await run(kind === "zip" ? "template-zip" : "template", async () => {
      const input = { trackCode, subjectCode: subject.code!, subjectName: subject.name };
      if (kind === "zip") {
        const bytes = await buildMinisterialPackageTemplateZip(input);
        downloadBytes(bytes, `ministerial-${trackCode}-${subject.code}.zip`, "application/zip");
        toast.success("تم تنزيل حزمة ZIP (XLSX + مجلد media/).");
      } else {
        const bytes = await buildMinisterialPackageTemplate(input);
        downloadBytes(bytes, `ministerial-${trackCode}-${subject.code}.xlsx`, XLSX_MIME);
        toast.success("تم تنزيل القالب السياقي.");
      }
    });
  }

  async function readFile(file: File | null) {
    if (!file || !subject?.code) return;
    resetFile();
    setFileName(file.name);
    await run("read", async () => {
      const result = await parseMinisterialPackageFile(file, {
        trackCode,
        subjectCode: subject.code!,
        subjectName: subject.name,
      });
      setParsed(result);
      const media = summarizePackageMedia(result.package);
      const questionCount = result.package.models.reduce(
        (sum, model) => sum + model.questions.length,
        0,
      );
      toast.success(
        media.media_refs > 0
          ? `تم فحص ${result.package.models.length} نموذج و${questionCount} سؤال و${result.media.length} صورة.`
          : `تم فحص ${result.package.models.length} نموذج و${questionCount} سؤال.`,
      );
    });
  }

  async function prepare() {
    if (!pkg) return;
    const result = await run("prepare", () => prepareMinisterialTrackPackage(pkg));
    if (!result) return;
    setPrepared(result);
    if (result.summary.blocked > 0) {
      toast.error("توجد نماذج محجوبة. راجع المعاينة قبل التنفيذ.");
    } else {
      toast.success("اكتمل التجهيز. راجع البصمات ثم نفّذ إنشاء المسودات.");
    }
  }

  async function execute() {
    if (!parsed || !prepared || prepared.summary.blocked > 0) return;
    if (parsed.media.length > 0) {
      const uploaded = await run("upload", () =>
        uploadMinisterialPackageMedia(parsed.media, setUpload),
      );
      if (!uploaded) return;
    }
    const result = await run("execute", () =>
      executeMinisterialTrackPackage(prepared.prepare_id, prepared.prepare_fingerprint),
    );
    if (!result) return;
    const mediaNote = result.inserted_media ? ` و${result.inserted_media} صورة` : "";
    toast.success(
      `أُنشئ ${result.inserted_models} نموذج و${result.inserted_questions} سؤال${mediaNote}. النشر ما زال خطوة مستقلة.`,
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
          منفصلة ومحكومة بفحوص النسخ والبصمات. الصور اختيارية: عند وجودها ارفع حزمة ZIP تحتوي ملف
          XLSX ومجلد media/.
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
              ? "ورقة فهرس + ورقة لكل نموذج: نص السؤال، أربعة خيارات، الإجابة الصحيحة، الشرح، والترتيب. أعمدة اختيارية لصورة السؤال وصور الخيارات وصورة الحل مع وصف لكل صورة."
              : "ورقة فهرس + ورقة لكل نموذج: نص السؤال، الإجابة النموذجية، الشرح، والترتيب. أعمدة اختيارية لصورة السؤال وصورة الحل مع وصف لكل صورة. لا توجد خيارات اختيار متعدد."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            الصور: PNG أو JPG أو WebP فقط (لا SVG)، حتى 8MB للصورة و50MB للحزمة، وبأسماء ملفات فريدة
            داخل media/.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!subject?.code || busy !== null}
              onClick={() => void downloadTemplate("xlsx")}
            >
              {busy === "template" ? (
                <Loader2 className="ms-1 h-4 w-4 animate-spin" />
              ) : (
                <Download className="ms-1 h-4 w-4" />
              )}
              تحميل القالب (XLSX)
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!subject?.code || busy !== null}
              onClick={() => void downloadTemplate("zip")}
            >
              {busy === "template-zip" ? (
                <Loader2 className="ms-1 h-4 w-4 animate-spin" />
              ) : (
                <FileArchive className="ms-1 h-4 w-4" />
              )}
              تحميل حزمة ZIP مع مجلد الصور
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ministerial-track-package" className="flex items-center gap-1.5">
            <Upload className="h-4 w-4" aria-hidden /> ملف الحزمة (XLSX أو ZIP)
          </Label>
          <Input
            ref={inputRef}
            id="ministerial-track-package"
            type="file"
            accept={`.xlsx,.zip,${XLSX_MIME},application/zip,application/x-zip-compressed`}
            disabled={!subject?.code || busy !== null}
            onChange={(event) => void readFile(event.target.files?.[0] ?? null)}
          />
          {fileName && <p className="text-xs text-muted-foreground">{fileName}</p>}
        </div>

        {parsed && pkg && (
          <div className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex flex-wrap gap-2 text-xs">
              <Badge variant="secondary">
                <FileCheck2 className="ms-1 h-3.5 w-3.5" />
                النماذج: {pkg.models.length}
              </Badge>
              <Badge variant="secondary">الأسئلة: {totalQuestions}</Badge>
              <Badge variant="outline">{trackCode === "sanaa" ? "MCQ × 4" : "إجابة نصية"}</Badge>
              {hasMedia && mediaSummary ? (
                <Badge variant="secondary">
                  <ImageIcon className="ms-1 h-3.5 w-3.5" />
                  الصور: {parsed.media.length} ملف · {mediaSummary.media_refs} مرجع ·{" "}
                  {mediaSummary.questions_with_media} سؤال ·{" "}
                  {formatMediaBytes(parsed.total_media_bytes)}
                </Badge>
              ) : (
                <Badge variant="outline">بدون صور</Badge>
              )}
              <Badge variant="outline">{pkg.contract_version}</Badge>
            </div>
            <p className="break-all font-mono text-[10px] text-muted-foreground">
              SHA-256: {pkg.source_sha256}
            </p>
            <ul className="space-y-1 text-sm text-foreground">
              {pkg.models.map((model) => (
                <li key={`${model.academic_year}-${model.variant_code}`}>
                  {model.model_label} — {model.academic_year} — {model.questions.length} سؤال
                  {model.questions.some((question) => question.media?.length)
                    ? ` — ${model.questions.filter((question) => question.media?.length).length} سؤال بصور`
                    : ""}
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
              {typeof prepared.summary.media_refs === "number" &&
                prepared.summary.media_refs > 0 && (
                  <Badge variant="secondary">
                    صور مقبولة على الخادم: {prepared.summary.media_files ?? 0} ملف ·{" "}
                    {prepared.summary.media_refs} مرجع
                  </Badge>
                )}
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
            {hasMedia && (
              <p className="text-xs text-muted-foreground">
                عند التنفيذ تُرفع الصور أولًا إلى حاوية خاصة بمفاتيح مشتقة من بصمة المحتوى (لا
                تكرار)، ثم يتحقق الخادم من وجود كل صورة قبل إنشاء الأسئلة في معاملة واحدة.
              </p>
            )}
            {busy === "upload" && upload && (
              <div className="space-y-1">
                <Progress value={upload.total ? (upload.done / upload.total) * 100 : 0} />
                <p className="text-xs text-muted-foreground">
                  رفع الصور {upload.done}/{upload.total}
                  {upload.currentName ? ` — ${upload.currentName}` : ""}
                </p>
              </div>
            )}
            <Button
              variant="secondary"
              disabled={busy !== null || prepared.summary.blocked > 0}
              onClick={() => void execute()}
            >
              {busy === "execute" || busy === "upload" ? (
                <Loader2 className="ms-1 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="ms-1 h-4 w-4" />
              )}
              {hasMedia ? "رفع الصور وإنشاء المسودات" : "إنشاء المسودات والأسئلة المثبتة"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
