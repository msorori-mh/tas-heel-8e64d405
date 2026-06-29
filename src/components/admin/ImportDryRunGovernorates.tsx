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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dryRunGovernoratesImport } from "@/lib/import/import-dry-run.functions";
import {
  GOVERNORATES_ALL_COLUMNS,
  GOVERNORATES_MAX_FILE_BYTES,
  GOVERNORATES_PREVIEW_ROWS,
  GOVERNORATES_TEMPLATE_FILE,
  type GovernoratesDryRunApiResponse,
} from "@/lib/import/governorates-dry-run.shared";
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  Loader2,
  ShieldCheck,
  TableProperties,
} from "lucide-react";

const STEPS = [
  { id: 1, label: "اختيار ملف المحافظات" },
  { id: 2, label: "قراءة الأعمدة" },
  { id: 3, label: "معاينة أول 10 صفوف" },
  { id: 4, label: "عرض أخطاء التحقق" },
  { id: 5, label: "التنفيذ لاحقاً" },
] as const;

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

function stepStatus(
  stepId: number,
  hasFile: boolean,
  result: GovernoratesDryRunApiResponse | null,
  parsing: boolean,
): "done" | "active" | "pending" | "disabled" {
  if (stepId === 5) return "disabled";
  if (stepId === 1) return hasFile ? "done" : "active";
  if (!hasFile) return "pending";
  if (parsing) return stepId === 2 ? "active" : "pending";
  if (!result) return "pending";
  if (stepId === 2) return result.detectedColumns.length > 0 ? "done" : "active";
  if (stepId === 3) return "done";
  if (stepId === 4) return "done";
  return "pending";
}

export function ImportDryRunGovernorates() {
  const runDryRun = useServerFn(dryRunGovernoratesImport);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<GovernoratesDryRunApiResponse | null>(null);

  const handleFileChange = useCallback(
    async (file: File | null) => {
      setParseError(null);
      setResult(null);
      if (!file) {
        setFileName(null);
        return;
      }

      if (!file.name.toLowerCase().endsWith(".xlsx")) {
        setParseError("يُقبل ملف Excel بصيغة .xlsx فقط.");
        setFileName(file.name);
        return;
      }

      if (file.size > GOVERNORATES_MAX_FILE_BYTES) {
        setParseError(
          `حجم الملف يتجاوز الحد المسموح (${GOVERNORATES_MAX_FILE_BYTES / (1024 * 1024)} MB).`,
        );
        setFileName(file.name);
        return;
      }

      setFileName(file.name);
      setParsing(true);
      try {
        const fileBase64 = await fileToBase64(file);
        const response = await runDryRun({
          data: {
            fileName: file.name,
            fileBase64,
            fileSize: file.size,
          },
        });
        setResult(response);
      } catch (err) {
        setParseError(
          err instanceof Error ? err.message : "تعذّر قراءة الملف. جرّب ملفاً آخر.",
        );
      } finally {
        setParsing(false);
      }
    },
    [runDryRun],
  );

  const hasFile = Boolean(fileName);
  const errorCount = result?.errorCount ?? 0;

  return (
    <section className="space-y-4" aria-labelledby="dry-run-heading">
      <div className="space-y-2">
        <h2 id="dry-run-heading" className="text-lg font-semibold text-foreground">
          تجربة المعاينة الجافة
        </h2>
        <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
          المرحلة الحالية مخصصة للتجربة على قالب المحافظات فقط ({GOVERNORATES_TEMPLATE_FILE}).
          المعالجة تتم على السيرفر كمعاينة جافة، ويتم حفظ نتيجة المعاينة في سجل الاستيراد دون
          تعديل بيانات المحافظات.
        </p>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <CardTitle className="text-base">POC — المحافظات</CardTitle>
            <Badge variant="secondary" className="shrink-0">مؤهل لتجربة المعاينة</Badge>
          </div>
          <CardDescription className="space-y-1 text-sm">
            <p>
              <span className="font-medium text-foreground">القالب:</span> المحافظات (
              {GOVERNORATES_TEMPLATE_FILE})
            </p>
            <p>
              <span className="font-medium text-foreground">سبب الاختيار:</span> منخفض الخطورة
              ولا يحتوي بيانات حساسة.
            </p>
            <p className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              المعاينة لا تعدّل البيانات — قراءة وتحقق على السيرفر فقط.
            </p>
          </CardDescription>
        </CardHeader>
      </Card>

      <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((step) => {
          const status = stepStatus(step.id, hasFile, result, parsing);
          return (
            <li
              key={step.id}
              className={`rounded-xl border px-3 py-2.5 text-sm flex items-center gap-2 min-w-0 ${
                status === "active"
                  ? "border-primary/40 bg-primary/5"
                  : status === "done"
                    ? "border-emerald-500/30 bg-emerald-500/5"
                    : status === "disabled"
                      ? "border-border/50 opacity-60"
                      : "border-border/50 bg-muted/20"
              }`}
            >
              <span className="font-mono text-xs text-muted-foreground shrink-0">
                {String(step.id).padStart(2, "0")}
              </span>
              <span className="truncate">{step.label}</span>
              {status === "done" && (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 ms-auto" />
              )}
              {status === "disabled" && (
                <Badge variant="secondary" className="text-[10px] shrink-0 ms-auto">قريباً</Badge>
              )}
            </li>
          );
        })}
      </ol>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileUp className="h-4 w-4" />
            1 — اختيار ملف المحافظات
          </CardTitle>
          <CardDescription>
            اختر ملف Excel مملوء من قالب المحافظات. يُقبل .xlsx فقط (حد 5 MB، حتى 500 صف).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto min-h-[44px] gap-2"
            onClick={() => inputRef.current?.click()}
            disabled={parsing}
          >
            {parsing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            {fileName ? "تغيير الملف" : "اختيار ملف .xlsx"}
          </Button>
          {fileName && (
            <p className="text-xs text-muted-foreground truncate" title={fileName}>
              الملف المختار: <span className="font-mono">{fileName}</span>
            </p>
          )}
          {parseError && (
            <p className="text-sm text-destructive flex items-start gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              {parseError}
            </p>
          )}
        </CardContent>
      </Card>

      {(parsing || result) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <TableProperties className="h-4 w-4" />
              2 — قراءة الأعمدة
            </CardTitle>
          </CardHeader>
          <CardContent>
            {parsing ? (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                جاري المعالجة على السيرفر…
              </p>
            ) : result ? (
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={result.status === "valid" ? "default" : "destructive"}
                  className="text-[11px]"
                >
                  {result.status === "valid" ? "صالح" : "غير صالح"}
                </Badge>
                {GOVERNORATES_ALL_COLUMNS.map((col) => {
                  const found = result.detectedColumns.includes(col);
                  return (
                    <Badge
                      key={col}
                      variant={found ? "default" : "outline"}
                      className={found ? "" : "opacity-50"}
                    >
                      {col}
                      {col === "name" && " *"}
                    </Badge>
                  );
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}

      {result && !parsing && result.persisted && (
        <Card className="border-emerald-500/25 bg-emerald-500/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              سجل المعاينة الجافة
            </CardTitle>
            <CardDescription className="space-y-2 text-sm">
              <p>{result.message}</p>
              <p className="text-foreground">
                تم حفظ نتيجة المعاينة الجافة فقط. لم يتم تعديل بيانات المحافظات.
              </p>
              <p className="font-mono text-xs text-muted-foreground break-all">
                jobId: {result.jobId}
              </p>
              <p className="text-xs text-muted-foreground">
                حالة السجل: <span className="font-mono">{result.jobStatus}</span>
              </p>
              <p className="text-xs text-muted-foreground">
                سجل عمليات الاستيراد الكامل سيُعرض في مرحلة 01C-B3.
              </p>
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {result && !parsing && (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                3 — معاينة أول {GOVERNORATES_PREVIEW_ROWS} صفوف
              </CardTitle>
              <CardDescription>
                إجمالي الصفوف غير الفارغة: {result.totalRowCount}
              </CardDescription>
            </CardHeader>
            <CardContent className="min-w-0">
              {result.previewRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد صفوف للمعاينة.</p>
              ) : (
                <div className="overflow-x-auto -mx-1 px-1 max-w-full">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="whitespace-nowrap">#</TableHead>
                        {GOVERNORATES_ALL_COLUMNS.map((col) => (
                          <TableHead key={col} className="whitespace-nowrap">
                            {col}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.previewRows.map((row) => (
                        <TableRow key={row.rowNumber}>
                          <TableCell className="font-mono text-xs">{row.rowNumber}</TableCell>
                          <TableCell>{row.name}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.default_track_code || "—"}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {row.sort_order || "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                4 — أخطاء التحقق
                {errorCount > 0 && (
                  <Badge variant="destructive" className="text-[10px]">
                    {errorCount}
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {result.issues.length === 0 ? (
                <p className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  لا توجد أخطاء تحقق في الملف.
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {result.issues.map((issue, idx) => (
                    <li
                      key={`${issue.code}-${issue.row ?? "g"}-${idx}`}
                      className="rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2"
                    >
                      <span className="font-mono text-xs text-destructive">{issue.code}</span>
                      {issue.row != null && (
                        <span className="text-muted-foreground text-xs ms-2">
                          صف {issue.row}
                        </span>
                      )}
                      <p className="mt-1 text-foreground">{issue.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <Button variant="outline" disabled className="min-h-[44px] opacity-70" aria-disabled>
          التنفيذ لاحقاً
          <Badge variant="secondary" className="text-[10px] ms-2">قريباً</Badge>
        </Button>
        <p className="text-xs text-muted-foreground">
          لن يُفعَّل التنفيذ في قاعدة البيانات حتى مرحلة لاحقة (01D).
        </p>
      </div>
    </section>
  );
}
