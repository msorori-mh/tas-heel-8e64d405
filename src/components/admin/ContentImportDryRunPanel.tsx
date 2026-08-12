import { useCallback, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dryRunContentImport } from "@/lib/content-import/content-import-dry-run.functions";
import {
  createContentImportJob,
  prepareContentImportStaging,
  runContentImportExecute,
  type ExecuteImportResult,
} from "@/lib/import/import-staging.functions";
import { toArabicImportExecuteMessage } from "@/lib/import/import-execute-messages";
import {
  CONTENT_IMPORT_TEMPLATES,
  type ContentImportTemplateKey,
} from "@/lib/content-import/content-import-templates";
import type { ContentImportDryRunReport } from "@/lib/content-import/content-import-types";
import { CONTENT_IMPORT_MAX_FILE_BYTES } from "@/lib/content-import/content-import-types";
import {
  AlertCircle,
  CheckCircle2,
  FileSearch,
  FileUp,
  Loader2,
  PlayCircle,
  ShieldCheck,
  Layers,
} from "lucide-react";

async function sha256Hex(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}


function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== "string" || !dataUrl.includes(",")) {
        reject(new Error("تعذر قراءة الملف."));
        return;
      }
      resolve(dataUrl.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("تعذر قراءة الملف."));
    reader.readAsDataURL(file);
  });
}

function statusBadgeVariant(
  status: ContentImportDryRunReport["status"],
): "default" | "secondary" | "destructive" {
  if (status === "pass") return "default";
  if (status === "warn") return "secondary";
  return "destructive";
}

function statusLabel(status: ContentImportDryRunReport["status"]): string {
  if (status === "pass") return "PASS";
  if (status === "warn") return "WARN";
  return "FAIL";
}

export function ContentImportDryRunPanel() {
  const runDryRun = useServerFn(dryRunContentImport);
  const createJob = useServerFn(createContentImportJob);
  const prepareStaging = useServerFn(prepareContentImportStaging);
  const runExecute = useServerFn(runContentImportExecute);
  const inputRef = useRef<HTMLInputElement>(null);
  const [templateKey, setTemplateKey] = useState<ContentImportTemplateKey>("subjects");
  const [fileName, setFileName] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ContentImportDryRunReport | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [preparedHash, setPreparedHash] = useState<string | null>(null);
  const [stagedRows, setStagedRows] = useState<number | null>(null);
  const [executeResult, setExecuteResult] = useState<ExecuteImportResult | null>(null);

  const resetPipeline = useCallback(() => {
    setReport(null);
    setError(null);
    setJobId(null);
    setPreparedHash(null);
    setStagedRows(null);
    setExecuteResult(null);
  }, []);

  const pickFile = useCallback((): File | null => {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setError("اختر ملف Excel أولاً.");
      return null;
    }
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      setError("يُقبل ملف Excel بصيغة .xlsx فقط.");
      return null;
    }
    if (file.size > CONTENT_IMPORT_MAX_FILE_BYTES) {
      setError(
        `حجم الملف يتجاوز الحد المسموح (${CONTENT_IMPORT_MAX_FILE_BYTES / (1024 * 1024)} MB).`,
      );
      return null;
    }
    return file;
  }, []);

  const handleCheck = useCallback(async () => {
    const file = pickFile();
    if (!file) return;

    setChecking(true);
    resetPipeline();

    try {
      const fileBase64 = await fileToBase64(file);
      const result = await runDryRun({
        data: {
          templateKey,
          fileName: file.name,
          fileBase64,
          fileSize: file.size,
        },
      });
      setReport(result);
      setFileName(file.name);
    } catch (err) {
      setError(
        err instanceof Error
          ? toArabicImportExecuteMessage(err.message)
          : "تعذّر فحص الملف. جرّب ملفاً آخر.",
      );
    } finally {
      setChecking(false);
    }
  }, [pickFile, resetPipeline, runDryRun, templateKey]);

  const handlePrepare = useCallback(async () => {
    const file = pickFile();
    if (!file || !report) return;

    setPreparing(true);
    setError(null);
    setExecuteResult(null);
    setJobId(null);
    setPreparedHash(null);
    setStagedRows(null);

    try {
      const [fileBase64, fileHash] = await Promise.all([
        fileToBase64(file),
        sha256Hex(file),
      ]);

      const { jobId: newJobId } = await createJob({
        data: {
          templateKey,
          fileName: file.name,
          fileSize: file.size,
          fileHash,
          totalRows: report.totalRows,
          validRows: report.validRows,
          warningRows: report.warningCount,
        },
      });

      const staged = await prepareStaging({
        data: {
          jobId: newJobId,
          templateKey,
          fileName: file.name,
          fileBase64,
          fileSize: file.size,
        },
      });

      if (!staged.ok) {
        setError(
          staged.errors[0]
            ? `فشل التجهيز — صف ${staged.errors[0].rowNumber ?? "?"}: ${staged.errors[0].message}`
            : "فشل التجهيز.",
        );
        return;
      }

      setJobId(newJobId);
      setPreparedHash(fileHash);
      setStagedRows(staged.stagedRows);
    } catch (err) {
      setError(
        err instanceof Error
          ? toArabicImportExecuteMessage(err.message)
          : "تعذّر تجهيز الملف.",
      );
    } finally {
      setPreparing(false);
    }
  }, [createJob, pickFile, prepareStaging, report, templateKey]);

  const handleExecute = useCallback(async () => {
    const file = pickFile();
    if (!file || !jobId || !preparedHash) return;

    setExecuting(true);
    setError(null);
    setExecuteResult(null);

    try {
      const currentHash = await sha256Hex(file);
      if (currentHash !== preparedHash) {
        setError("الملف الحالي يختلف عن الملف المُجهَّز — أعد الفحص والتجهيز.");
        setJobId(null);
        setPreparedHash(null);
        setStagedRows(null);
        return;
      }

      const result = await runExecute({
        data: { jobId, templateKeys: [templateKey] },
      });
      setExecuteResult(result);
      if (!result.ok && result.error) {
        setError(toArabicImportExecuteMessage(result.error));
      }
      setJobId(null);
      setPreparedHash(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? toArabicImportExecuteMessage(err.message)
          : "تعذّر تنفيذ الاستيراد.",
      );
    } finally {
      setExecuting(false);
    }
  }, [jobId, pickFile, preparedHash, runExecute, templateKey]);

  const dryRunPassed = report != null && report.status !== "fail" && report.errorCount === 0;
  const isQuestionsTemplate = templateKey === "questions";


  const previewColumns =
    report?.previewRows.length
      ? Object.keys(report.previewRows[0] ?? {})
      : report?.detectedColumns ?? [];

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="space-y-3 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSearch className="h-4 w-4" />
          فحص ملف قبل الاستيراد
        </CardTitle>
        <CardDescription className="space-y-1 text-sm">
          <p>
            ارفع ملف Excel مملوءاً من أحد قوالب 01–09، ثم اتبع الخطوات:
            فحص ← تجهيز ← تنفيذ.
          </p>
          <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            الفحص لا يكتب شيئاً، والتجهيز يكتب صفوفاً مؤقتة فقط، والتنفيذ يتم داخل معاملة واحدة لكل قالب.
          </p>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="content-import-template">نوع القالب</Label>
            <select
              id="content-import-template"
              value={templateKey}
              onChange={(e) => {
                setTemplateKey(e.target.value as ContentImportTemplateKey);
                resetPipeline();
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {CONTENT_IMPORT_TEMPLATES.map((t) => (
                <option key={t.key} value={t.key}>
                  {String(t.order).padStart(2, "0")} — {t.titleAr}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content-import-file">ملف Excel (.xlsx)</Label>
            <input
              ref={inputRef}
              id="content-import-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:me-3 file:border-0 file:bg-transparent file:text-sm"
              onChange={() => {
                resetPipeline();
                setFileName(null);
              }}
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            className="min-h-[44px] gap-2"
            onClick={handleCheck}
            disabled={checking || preparing || executing}
          >
            {checking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            فحص الملف
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="min-h-[44px] gap-2"
            onClick={handlePrepare}
            disabled={!dryRunPassed || isQuestionsTemplate || checking || preparing || executing}
          >
            {preparing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Layers className="h-4 w-4" />
            )}
            تجهيز الاستيراد
          </Button>
          <Button
            type="button"
            className="min-h-[44px] gap-2"
            onClick={handleExecute}
            disabled={
              !jobId || !preparedHash || isQuestionsTemplate || checking || preparing || executing
            }
          >
            {executing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlayCircle className="h-4 w-4" />
            )}
            تنفيذ الاستيراد
          </Button>
        </div>
        {isQuestionsTemplate ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            قالب الأسئلة (09) لا يمر عبر هذا المسار — يُستورد حصراً عبر مسار بنك الأسئلة المعتمد.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            التنفيذ يُفعَّل فقط بعد نجاح الفحص وتجهيز الملف نفسه (تُقارَن بصمة الملف قبل التنفيذ).
          </p>
        )}

        {stagedRows != null && jobId && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">
              تم التجهيز — {stagedRows} صف جاهز للتنفيذ
            </p>
            <p className="font-mono text-[11px] text-muted-foreground break-all">
              job: {jobId}
            </p>
          </div>
        )}

        {executeResult && (
          <div
            className={`rounded-xl border px-4 py-3 text-sm space-y-2 ${
              executeResult.ok
                ? "border-emerald-500/30 bg-emerald-500/10"
                : "border-destructive/30 bg-destructive/5"
            }`}
          >
            <p className="font-medium text-foreground">
              {executeResult.ok ? "تم التنفيذ بنجاح" : "فشل التنفيذ — تم التراجع عن القالب كاملاً"}
            </p>
            {executeResult.results.map((r) => (
              <div key={r.templateKey} className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="rounded-lg border bg-background/60 px-3 py-2">
                  <div className="text-muted-foreground">مُدرج</div>
                  <div className="font-semibold">{r.inserted}</div>
                </div>
                <div className="rounded-lg border bg-background/60 px-3 py-2">
                  <div className="text-muted-foreground">محدَّث</div>
                  <div className="font-semibold">{r.updated}</div>
                </div>
                <div className="rounded-lg border bg-background/60 px-3 py-2">
                  <div className="text-muted-foreground">متطابق (تخطٍّ)</div>
                  <div className="font-semibold">{r.skipped}</div>
                </div>
                <div className="rounded-lg border bg-background/60 px-3 py-2">
                  <div className="text-muted-foreground">محجوب (منشور)</div>
                  <div className="font-semibold">{r.blockedPublished}</div>
                </div>
              </div>
            ))}
          </div>
        )}


        {error && (
          <p className="text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            {error}
          </p>
        )}

        {report && (
          <div className="space-y-4 rounded-xl border border-border/55 bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusBadgeVariant(report.status)}>
                {statusLabel(report.status)}
              </Badge>
              {fileName && (
                <span className="text-xs text-muted-foreground truncate font-mono">
                  {fileName}
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <div className="text-muted-foreground">إجمالي الصفوف</div>
                <div className="font-semibold">{report.totalRows}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <div className="text-muted-foreground">صفوف صالحة</div>
                <div className="font-semibold">{report.validRows}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <div className="text-muted-foreground">أخطاء</div>
                <div className="font-semibold text-destructive">{report.errorCount}</div>
              </div>
              <div className="rounded-lg border bg-muted/30 px-3 py-2">
                <div className="text-muted-foreground">تحذيرات</div>
                <div className="font-semibold">{report.warningCount}</div>
              </div>
            </div>

            {report.errors.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  الأخطاء
                </h3>
                <ul className="space-y-1 text-sm max-h-48 overflow-y-auto">
                  {report.errors.map((issue, idx) => (
                    <li
                      key={`err-${idx}`}
                      className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2"
                    >
                      {issue.rowNumber != null && (
                        <span className="text-xs text-muted-foreground">صف {issue.rowNumber} — </span>
                      )}
                      {issue.column && (
                        <span className="font-mono text-xs">{issue.column}: </span>
                      )}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.warnings.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">التحذيرات</h3>
                <ul className="space-y-1 text-sm max-h-48 overflow-y-auto">
                  {report.warnings.map((issue, idx) => (
                    <li
                      key={`warn-${idx}`}
                      className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2"
                    >
                      {issue.rowNumber != null && (
                        <span className="text-xs text-muted-foreground">صف {issue.rowNumber} — </span>
                      )}
                      {issue.column && (
                        <span className="font-mono text-xs">{issue.column}: </span>
                      )}
                      {issue.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {report.status === "pass" && report.errors.length === 0 && (
              <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                الملف يمر التحقق الأساسي — جاهز للمراجعة اليدوية قبل التنفيذ لاحقاً.
              </p>
            )}

            {report.previewRows.length > 0 && (
              <div className="min-w-0">
                <h3 className="text-sm font-semibold mb-2">معاينة أول {report.previewRows.length} صفوف</h3>
                <div className="overflow-x-auto -mx-1 px-1 max-w-full">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {previewColumns.map((col) => (
                          <TableHead key={col} className="whitespace-nowrap font-mono text-xs">
                            {col}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {report.previewRows.map((row, idx) => (
                        <TableRow key={idx}>
                          {previewColumns.map((col) => (
                            <TableCell
                              key={col}
                              className="max-w-[200px] truncate text-xs"
                              title={row[col] ?? ""}
                            >
                              {row[col] || "—"}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
