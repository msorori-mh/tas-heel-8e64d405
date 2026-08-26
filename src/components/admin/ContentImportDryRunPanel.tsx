import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { downloadContextualTemplate } from "@/lib/content-codes/content-codes.functions";
import {
  createContentImportJob,
  prepareContentImportStaging,
  runContentImportExecute,
  type ExecuteImportResult,
} from "@/lib/import/import-staging.functions";
import { toArabicImportExecuteMessage } from "@/lib/import/import-execute-messages";
import {
  curriculumImportScopeKey,
  isCompleteSubjectImportScope,
  isCompleteCurriculumImportScope,
  type ContentStructureImportScope,
} from "@/lib/import/curriculum-import-scope";
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
  Download,
} from "lucide-react";

function downloadBase64Workbook(fileBase64: string, fileName: string): void {
  const binary = atob(fileBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

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

interface ContentImportDryRunPanelProps {
  allowedTemplateKeys?: readonly ContentImportTemplateKey[];
  initialTemplateKey?: ContentImportTemplateKey;
  heading?: string;
  description?: string;
  idPrefix?: string;
  curriculumScope?: ContentStructureImportScope | null;
  onExecuted?: () => void | Promise<void>;
}

export function ContentImportDryRunPanel({
  allowedTemplateKeys,
  initialTemplateKey,
  heading = "فحص ملف قبل الاستيراد",
  description = "ارفع ملف Excel المملوء، ثم اتبع الخطوات: فحص ← تجهيز ← تنفيذ.",
  idPrefix = "content-import",
  curriculumScope = null,
  onExecuted,
}: ContentImportDryRunPanelProps = {}) {
  const runDryRun = useServerFn(dryRunContentImport);
  const downloadTemplate = useServerFn(downloadContextualTemplate);
  const createJob = useServerFn(createContentImportJob);
  const prepareStaging = useServerFn(prepareContentImportStaging);
  const runExecute = useServerFn(runContentImportExecute);
  const inputRef = useRef<HTMLInputElement>(null);
  const availableTemplates = allowedTemplateKeys?.length
    ? CONTENT_IMPORT_TEMPLATES.filter((template) => allowedTemplateKeys.includes(template.key))
    : CONTENT_IMPORT_TEMPLATES;
  const fallbackTemplateKey = availableTemplates[0]?.key ?? "subjects";
  const [templateKey, setTemplateKey] = useState<ContentImportTemplateKey>(
    initialTemplateKey && availableTemplates.some((template) => template.key === initialTemplateKey)
      ? initialTemplateKey
      : fallbackTemplateKey,
  );
  const [fileName, setFileName] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ContentImportDryRunReport | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [preparedHash, setPreparedHash] = useState<string | null>(null);
  const [stagedRows, setStagedRows] = useState<number | null>(null);
  const [executeResult, setExecuteResult] = useState<ExecuteImportResult | null>(null);
  const scopeRequired =
    templateKey === "subjects" || templateKey === "units" || templateKey === "lessons";
  const scopeComplete =
    !scopeRequired ||
    (templateKey === "subjects"
      ? isCompleteSubjectImportScope(curriculumScope)
      : isCompleteCurriculumImportScope(curriculumScope));
  const scopeKey = curriculumImportScopeKey(curriculumScope);

  const resetPipeline = useCallback(() => {
    setReport(null);
    setError(null);
    setJobId(null);
    setPreparedHash(null);
    setStagedRows(null);
    setExecuteResult(null);
  }, []);

  useEffect(() => {
    resetPipeline();
    setFileName(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [resetPipeline, scopeKey]);

  const handleTemplateDownload = useCallback(async () => {
    if (templateKey !== "subjects" && templateKey !== "units" && templateKey !== "lessons") {
      setError("أكمل سياق الاستيراد قبل تنزيل النموذج.");
      return;
    }

    setDownloadingTemplate(true);
    setError(null);
    try {
      const templateScope = curriculumScope;
      if (templateKey === "subjects") {
        if (!isCompleteSubjectImportScope(templateScope)) {
          setError("أكمل سياق استيراد المواد: الصف ← المسار أو المسارات.");
          return;
        }
        const generated = await downloadTemplate({
          data: {
            templateKey,
            gradeSlug: templateScope.gradeSlug,
            trackCodes: templateScope.trackCodes,
            rowCount: 20,
          },
        });
        downloadBase64Workbook(generated.fileBase64, generated.filename);
        return;
      }
      if (!isCompleteCurriculumImportScope(templateScope)) {
        setError("أكمل سياق الاستيراد: الصف ← المسار ← الفصل ← المادة.");
        return;
      }
      const generated = await downloadTemplate({
        data: {
          templateKey,
          gradeSlug: templateScope.gradeSlug,
          trackCodes: templateScope.trackCodes,
          semester: templateScope.semester,
          subjectCode: templateScope.subjectCode,
          rowCount: templateKey === "units" ? 20 : 50,
        },
      });
      downloadBase64Workbook(generated.fileBase64, generated.filename);
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "تعذر إنشاء نموذج الاستيراد. أعد المحاولة.",
      );
    } finally {
      setDownloadingTemplate(false);
    }
  }, [curriculumScope, downloadTemplate, templateKey]);

  const pickFile = useCallback((): File | null => {
    if (!scopeComplete) {
      setError(
        templateKey === "subjects"
          ? "أكمل سياق استيراد المواد: الصف ← المسار أو المسارات."
          : "أكمل سياق الاستيراد: الصف ← المسار ← الفصل ← المادة.",
      );
      return null;
    }
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
  }, [scopeComplete]);

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
          curriculumScope: scopeRequired ? curriculumScope : undefined,
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
  }, [curriculumScope, pickFile, resetPipeline, runDryRun, scopeRequired, templateKey]);

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
      const [fileBase64, fileHash] = await Promise.all([fileToBase64(file), sha256Hex(file)]);

      const { jobId: newJobId } = await createJob({
        data: {
          templateKey,
          fileName: file.name,
          fileSize: file.size,
          fileHash,
          totalRows: report.totalRows,
          validRows: report.validRows,
          warningRows: report.warningCount,
          curriculumScope: scopeRequired ? curriculumScope : undefined,
        },
      });

      const staged = await prepareStaging({
        data: {
          jobId: newJobId,
          templateKey,
          fileName: file.name,
          fileBase64,
          fileSize: file.size,
          curriculumScope: scopeRequired ? curriculumScope : undefined,
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
        err instanceof Error ? toArabicImportExecuteMessage(err.message) : "تعذّر تجهيز الملف.",
      );
    } finally {
      setPreparing(false);
    }
  }, [createJob, curriculumScope, pickFile, prepareStaging, report, scopeRequired, templateKey]);

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
        data: {
          jobId,
          templateKeys: [templateKey],
          curriculumScope: scopeRequired ? curriculumScope : undefined,
        },
      });
      setExecuteResult(result);
      if (result.ok) await onExecuted?.();
      if (!result.ok && result.error) {
        setError(toArabicImportExecuteMessage(result.error));
      }
      setJobId(null);
      setPreparedHash(null);
    } catch (err) {
      setError(
        err instanceof Error ? toArabicImportExecuteMessage(err.message) : "تعذّر تنفيذ الاستيراد.",
      );
    } finally {
      setExecuting(false);
    }
  }, [
    curriculumScope,
    jobId,
    onExecuted,
    pickFile,
    preparedHash,
    runExecute,
    scopeRequired,
    templateKey,
  ]);

  const dryRunPassed = report != null && report.status !== "fail" && report.errorCount === 0;
  const isQuestionsTemplate = templateKey === "questions" || templateKey === "self_test_questions";

  const previewColumns = report?.previewRows.length
    ? Object.keys(report.previewRows[0] ?? {})
    : (report?.detectedColumns ?? []);

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardHeader className="space-y-3 pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSearch className="h-4 w-4" />
          {heading}
        </CardTitle>
        <CardDescription className="space-y-1 text-sm">
          <p>{description}</p>
          <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            الفحص لا يكتب شيئاً، والتجهيز يكتب صفوفاً مؤقتة فقط، والتنفيذ يتم داخل معاملة واحدة لكل
            قالب.
          </p>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {scopeRequired ? (
          <div className="flex flex-col gap-3 rounded-xl border border-primary/25 bg-background/70 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">
                {templateKey === "subjects"
                  ? "نموذج استيراد المواد والمسارات — 01"
                  : templateKey === "units"
                    ? "نموذج استيراد الوحدات — 02"
                    : "نموذج استيراد الدروس — 03"}
              </p>
              <p className="text-xs text-muted-foreground">
                يُولّد النظام ملف XLSX بأكواد المادة والفصل والترتيب وفق السياق المختار، دون تغيير
                أسماء الأعمدة.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] shrink-0 gap-2"
              onClick={handleTemplateDownload}
              disabled={!scopeComplete || downloadingTemplate || checking || preparing || executing}
            >
              {downloadingTemplate ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {templateKey === "subjects"
                ? "تنزيل نموذج المواد"
                : templateKey === "units"
                  ? "تنزيل نموذج الوحدات"
                  : "تنزيل نموذج الدروس"}
            </Button>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-template`}>نوع القالب</Label>
            <select
              id={`${idPrefix}-template`}
              value={templateKey}
              onChange={(e) => {
                setTemplateKey(e.target.value as ContentImportTemplateKey);
                resetPipeline();
              }}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {availableTemplates.map((t) => (
                <option key={t.key} value={t.key}>
                  {String(t.order).padStart(2, "0")} — {t.titleAr}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`${idPrefix}-file`}>ملف Excel (.xlsx)</Label>
            <input
              ref={inputRef}
              id={`${idPrefix}-file`}
              type="file"
              disabled={!scopeComplete || checking || preparing || executing}
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm file:me-3 file:border-0 file:bg-transparent file:text-sm"
              onChange={() => {
                resetPipeline();
                setFileName(null);
              }}
            />
          </div>
        </div>

        {scopeRequired && !scopeComplete ? (
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
            {templateKey === "subjects"
              ? "اختيار ملف Excel معطّل حتى يكتمل سياق الصف والمسارات أعلاه."
              : "اختيار ملف Excel معطّل حتى يكتمل سياق الصف والمسار والفصل والمادة أعلاه."}
          </p>
        ) : null}

        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            type="button"
            className="min-h-[44px] gap-2"
            onClick={handleCheck}
            disabled={!scopeComplete || checking || preparing || executing}
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
            disabled={!dryRunPassed || checking || preparing || executing}
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
            disabled={!jobId || !preparedHash || checking || preparing || executing}
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
            قالبا أسئلة الكتاب (09) و«اختبر فهمك» (10) يُستوردان عبر مسار بنك الأسئلة: تُنشأ نسخ
            «مسودة» فقط، ولا يُنشر أي سؤال تلقائياً، ولا تُكتب الإجابات في الجداول القديمة.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            التنفيذ يُفعَّل فقط بعد نجاح الفحص وتجهيز الملف نفسه (تُقارَن بصمة الملف قبل التنفيذ).
          </p>
        )}

        {stagedRows != null && jobId && (
          <div className="rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
            <p className="font-medium text-foreground">تم التجهيز — {stagedRows} صف جاهز للتنفيذ</p>
            <p className="font-mono text-[11px] text-muted-foreground break-all">job: {jobId}</p>
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
                <span className="text-xs text-muted-foreground truncate font-mono">{fileName}</span>
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
                        <span className="text-xs text-muted-foreground">
                          صف {issue.rowNumber} —{" "}
                        </span>
                      )}
                      {issue.column && <span className="font-mono text-xs">{issue.column}: </span>}
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
                        <span className="text-xs text-muted-foreground">
                          صف {issue.rowNumber} —{" "}
                        </span>
                      )}
                      {issue.column && <span className="font-mono text-xs">{issue.column}: </span>}
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
                <h3 className="text-sm font-semibold mb-2">
                  معاينة أول {report.previewRows.length} صفوف
                </h3>
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
