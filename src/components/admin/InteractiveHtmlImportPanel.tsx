import React, { useState, useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, FileArchive, FileSpreadsheet, ShieldAlert, Sparkles, Upload, Loader2 } from "lucide-react";
import {
  parseMasterZipBuffer,
  computePackageDeterministicHash,
  type PackageFileItem,
  type ImportDryRunReport,
  type SecurityFinding,
  runInteractiveResourceImportDryRun,
  type InteractiveLessonResourceImportRow,
} from "@/lib/content-import/html-package/index";
import {
  initializeHtmlImportFn,
  finalizeHtmlUploadFn,
  submitHtmlForReviewFn,
  checkHtmlBackendEnabledFn,
} from "@/lib/api/html-workflow.functions";
import type { InitializeImportResult, ImportResourceSession } from "@/lib/server/html-pipeline/html-workflow.types";

type ImportStage =
  | "idle"
  | "local_validation"
  | "initializing"
  | "uploading"
  | "validating"
  | "review_findings"
  | "submitting"
  | "submitted"
  | "error";

interface ResourceUploadStatus {
  resource_code: string;
  title_ar: string;
  status: "pending" | "uploading" | "uploaded" | "validating" | "validated" | "validation_failed" | "submitted" | "error";
  error?: string;
  findings?: SecurityFinding[];
}

export function InteractiveHtmlImportPanel() {
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [stage, setStage] = useState<ImportStage>("idle");
  const [backendEnabled, setBackendEnabled] = useState<boolean | null>(null);
  const [localReport, setLocalReport] = useState<ImportDryRunReport | null>(null);
  const [initResult, setInitResult] = useState<InitializeImportResult | null>(null);
  const [resourceStatuses, setResourceStatuses] = useState<ResourceUploadStatus[]>([]);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runCheckBackend = useServerFn(checkHtmlBackendEnabledFn);
  const runInitialize = useServerFn(initializeHtmlImportFn);
  const runFinalize = useServerFn(finalizeHtmlUploadFn);
  const runSubmit = useServerFn(submitHtmlForReviewFn);

  const checkBackend = useCallback(async () => {
    try {
      const result = await runCheckBackend();
      setBackendEnabled(result.backendEnabled && result.uploadEnabled);
    } catch {
      setBackendEnabled(false);
    }
  }, [runCheckBackend]);

  React.useEffect(() => {
    void checkBackend();
  }, [checkBackend]);

  const extractPerResourceZip = async (
    masterZipBytes: Uint8Array,
    packagePath: string,
  ): Promise<Uint8Array> => {
    const JSZip = (await import("jszip")).default;
    const parseRes = await parseMasterZipBuffer(masterZipBytes);
    if (!parseRes.isValid) {
      throw new Error("ZIP الرئيسي غير صالح");
    }

    const packageFiles = parseRes.packageMap[packagePath] || [];
    if (packageFiles.length === 0) {
      throw new Error(`لا توجد ملفات للحزمة: ${packagePath}`);
    }

    const newZip = new JSZip();
    for (const file of packageFiles) {
      if (file.buffer && !file.isDir) {
        newZip.file(`package/${file.path}`, file.buffer);
      }
    }

    const blob = await newZip.generateAsync({ type: "uint8array" });
    return blob;
  };

  const computePackageHashFromFiles = async (files: PackageFileItem[]): Promise<string> => {
    return computePackageDeterministicHash(files);
  };

  const handleLocalValidation = async () => {
    if (!excelFile || !zipFile) return;

    setLoading(true);
    setStage("local_validation");
    setGlobalError(null);

    try {
      const zipArrayBuffer = await zipFile.arrayBuffer();
      const zipBytes = new Uint8Array(zipArrayBuffer);
      const parseRes = await parseMasterZipBuffer(zipBytes);

      if (!parseRes.isValid) {
        setLocalReport({
          summary: {
            totalRows: 0,
            validRows: 0,
            rejectedRows: 0,
            totalResourcesInZip: 0,
            validPackages: 0,
            rejectedPackages: 1,
            offlineEligibleCount: 0,
          },
          rows: [],
          packageResults: {},
          globalFindings: parseRes.findings,
        });
        setStage("review_findings");
        setLoading(false);
        return;
      }

      const excelArrayBuffer = await excelFile.arrayBuffer();
      const excelBase64 = btoa(
        new Uint8Array(excelArrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          "",
        ),
      );

      const packageHashes: Record<string, string> = {};
      for (const [path, files] of Object.entries(parseRes.packageMap)) {
        const hash = await computePackageHashFromFiles(files);
        packageHashes[path] = hash;
      }

      const packageEntries: InteractiveLessonResourceImportRow[] = [];
      for (const [path, files] of Object.entries(parseRes.packageMap)) {
        const manifestFile = files.find((f) => f.path === "manifest.json" || f.path.endsWith("/manifest.json"));
        if (manifestFile?.buffer) {
          try {
            const text = new TextDecoder().decode(manifestFile.buffer);
            const manifest = JSON.parse(text) as Record<string, unknown>;
            packageEntries.push({
              resource_code: String(manifest.resource_code ?? path),
              grade_code: "",
              subject_code: "",
              lesson_code: "",
              resource_type: String(manifest.resource_type ?? "mind_map_html") as InteractiveLessonResourceImportRow["resource_type"],
              title_ar: "",
              package_path: path,
              entry_file: String(manifest.entry_file ?? "index.html"),
              sort_order: 1,
              version: Number(manifest.version ?? 1),
              status: "draft",
              offline_enabled: Boolean(manifest.offline_enabled ?? true),
              orientation: "auto",
              height_mode: "viewport",
              completion_mode: "view",
              minimum_interaction_seconds: 0,
            });
          } catch {
            // manifest parse failure — will be caught by server validation
          }
        }
      }

      const dryRunReport = await runInteractiveResourceImportDryRun(
        packageEntries,
        parseRes.packageMap,
      );

      setLocalReport(dryRunReport);
      setStage("review_findings");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setGlobalError(`فشل الفحص المحلي: ${msg}`);
      setStage("error");
    } finally {
      setLoading(false);
    }
  };

  const handleFullImport = async () => {
    if (!excelFile || !zipFile || !backendEnabled) return;

    setLoading(true);
    setStage("initializing");
    setGlobalError(null);

    try {
      const zipArrayBuffer = await zipFile.arrayBuffer();
      const zipBytes = new Uint8Array(zipArrayBuffer);
      const parseRes = await parseMasterZipBuffer(zipBytes);

      if (!parseRes.isValid) {
        throw new Error("ZIP الرئيسي غير صالح");
      }

      const packageHashes: Record<string, string> = {};
      for (const [path, files] of Object.entries(parseRes.packageMap)) {
        packageHashes[path] = await computePackageHashFromFiles(files);
      }

      const excelArrayBuffer = await excelFile.arrayBuffer();
      const excelBase64 = btoa(
        new Uint8Array(excelArrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          "",
        ),
      );

      const result = await runInitialize({
        data: {
          excelFileBase64: excelBase64,
          excelFileName: excelFile.name,
          packageHashes,
        },
      });

      setInitResult(result);

      if (result.resources.length === 0) {
        setGlobalError("لم يتم إنشاء أي مورد. تحقق من الأخطاء أدناه.");
        setStage("error");
        setLoading(false);
        return;
      }

      setResourceStatuses(
        result.resources.map((r) => ({
          resource_code: r.resource_code,
          title_ar: r.title_ar,
          status: "pending" as const,
        })),
      );

      setStage("uploading");

      const updatedStatuses: ResourceUploadStatus[] = [];

      for (const resource of result.resources) {
        const statusIdx = updatedStatuses.length;
        updatedStatuses.push({
          resource_code: resource.resource_code,
          title_ar: resource.title_ar,
          status: "uploading",
        });
        setResourceStatuses([...updatedStatuses]);

        try {
          const perResourceZip = await extractPerResourceZip(zipBytes, resource.resource_code);

          const uploadResponse = await fetch(resource.signed_upload_url, {
            method: "PUT",
            headers: {
              "Content-Type": "application/octet-stream",
              "x-ms-blob-type": "BlockBlob",
            },
            body: new Blob([new Uint8Array(perResourceZip) as unknown as BlobPart], { type: "application/octet-stream" }),
          });

          if (!uploadResponse.ok) {
            throw new Error(`Upload failed: HTTP ${uploadResponse.status}`);
          }

          updatedStatuses[statusIdx] = {
            ...updatedStatuses[statusIdx],
            status: "uploaded",
          };
          setResourceStatuses([...updatedStatuses]);

          updatedStatuses[statusIdx] = {
            ...updatedStatuses[statusIdx],
            status: "validating",
          };
          setResourceStatuses([...updatedStatuses]);

          const validationResult = await runFinalize({
            data: {
              uploadSessionId: resource.upload_session_id,
              resourceVersionId: resource.version_id,
            },
          });

          if (validationResult.is_valid) {
            updatedStatuses[statusIdx] = {
              ...updatedStatuses[statusIdx],
              status: "validated",
              findings: validationResult.findings,
            };
          } else {
            updatedStatuses[statusIdx] = {
              ...updatedStatuses[statusIdx],
              status: "validation_failed",
              findings: validationResult.findings,
              error: "فشل فحص الأمان الخادمي",
            };
          }
          setResourceStatuses([...updatedStatuses]);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          updatedStatuses[statusIdx] = {
            ...updatedStatuses[statusIdx],
            status: "error",
            error: msg,
          };
          setResourceStatuses([...updatedStatuses]);
        }
      }

      const validatedResources = result.resources.filter((r, i) =>
        updatedStatuses[i]?.status === "validated"
      );

      if (validatedResources.length > 0) {
        setStage("submitting");

        const submitResult = await runSubmit({
          data: {
            resourceIds: validatedResources.map((r) => r.resource_id),
          },
        });

        for (let i = 0; i < updatedStatuses.length; i++) {
          if (updatedStatuses[i].status === "validated") {
            const wasSubmitted = submitResult.submitted.includes(
              result.resources[i].resource_id,
            );
            updatedStatuses[i] = {
              ...updatedStatuses[i],
              status: wasSubmitted ? "submitted" : "error",
              error: wasSubmitted ? undefined : "فشل إرسال المورد للمراجعة",
            };
          }
        }
        setResourceStatuses([...updatedStatuses]);

        const hasSubmitted = updatedStatuses.some((s) => s.status === "submitted");
        setStage(hasSubmitted ? "submitted" : "error");
      } else {
        setStage("error");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setGlobalError(`فشل عملية الاستيراد: ${msg}`);
      setStage("error");
    } finally {
      setLoading(false);
    }
  };

  const hasBlockingFindings = localReport?.globalFindings.some(
    (f) => f.severity === "error",
  );
  const canProceed = excelFile && zipFile && !hasBlockingFindings && !loading;
  const isBackendDisabled = backendEnabled === false;

  return (
    <Card className="border-emerald-500/30 bg-emerald-950/10 shadow-sm" dir="rtl">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-400 shrink-0" />
            <CardTitle className="text-lg text-emerald-300">
              استيراد المحتوى التفاعلي HTML
            </CardTitle>
          </div>
          <div className="flex gap-2">
            {backendEnabled !== null && (
              <Badge
                variant="outline"
                className={
                  backendEnabled
                    ? "border-emerald-500/40 text-emerald-300"
                    : "border-amber-500/40 text-amber-300"
                }
              >
                {backendEnabled ? "Backend مفعّل" : "Backend معطّل — معاينة فقط"}
              </Badge>
            )}
          </div>
        </div>
        <CardDescription className="text-emerald-200/80">
          استيراد الخرائط الذهنية والتجارب العملية عبر Trusted Server Pipeline.
          {isBackendDisabled && " (الوضع الحالي: معاينة وفحص محلي فقط — لا رفع أو كتابة)"}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* File Inputs */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-dashed border-emerald-500/30 p-4 text-center space-y-2">
            <FileSpreadsheet className="mx-auto h-8 w-8 text-emerald-400" />
            <p className="text-xs text-muted-foreground">ملف Excel (.xlsx) للموارد التفاعلية</p>
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              id="excel-file-input"
              disabled={loading}
              onChange={(e) => {
                setExcelFile(e.target.files?.[0] ?? null);
                setLocalReport(null);
                setInitResult(null);
                setResourceStatuses([]);
                setGlobalError(null);
                setStage("idle");
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={loading}
              onClick={() => document.getElementById("excel-file-input")?.click()}
            >
              <Upload className="ml-2 h-3.5 w-3.5" />
              {excelFile ? excelFile.name : "رفع Excel"}
            </Button>
          </div>

          <div className="rounded-lg border border-dashed border-emerald-500/30 p-4 text-center space-y-2">
            <FileArchive className="mx-auto h-8 w-8 text-emerald-400" />
            <p className="text-xs text-muted-foreground">حزمة الموارد المضغوطة (ZIP)</p>
            <input
              type="file"
              accept=".zip"
              className="hidden"
              id="zip-file-input"
              disabled={loading}
              onChange={(e) => {
                setZipFile(e.target.files?.[0] ?? null);
                setLocalReport(null);
                setInitResult(null);
                setResourceStatuses([]);
                setGlobalError(null);
                setStage("idle");
              }}
            />
            <Button
              size="sm"
              variant="secondary"
              disabled={loading}
              onClick={() => document.getElementById("zip-file-input")?.click()}
            >
              <Upload className="ml-2 h-3.5 w-3.5" />
              {zipFile ? zipFile.name : "رفع ZIP"}
            </Button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-3 justify-end">
          <Button
            variant="outline"
            className="gap-2"
            disabled={!excelFile || !zipFile || loading}
            onClick={handleLocalValidation}
          >
            {loading && stage === "local_validation" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldAlert className="h-4 w-4" />
            )}
            فحص محلي (Dry-Run)
          </Button>

          <Button
            className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2"
            disabled={!canProceed || isBackendDisabled}
            onClick={handleFullImport}
            title={
              isBackendDisabled
                ? "Backend غير مفعّل — لا يمكن التنفيذ"
                : undefined
            }
          >
            {loading && stage !== "idle" && stage !== "review_findings" && stage !== "error" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {stage === "submitted" ? "تم الاستيراد" : "استيراد ورفع للمراجعة"}
          </Button>
        </div>

        {/* Global Error */}
        {globalError && (
          <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">خطأ</p>
              <p>{globalError}</p>
            </div>
          </div>
        )}

        {/* Local Validation Report */}
        {localReport && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                نتائج الفحص المحلي
              </h3>
              <div className="flex gap-2">
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
                  الحزم: {localReport.summary.validPackages} / {localReport.summary.totalResourcesInZip}
                </Badge>
              </div>
            </div>

            {localReport.globalFindings.length > 0 && (
              <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 space-y-2 text-xs text-destructive">
                <div className="flex items-center gap-2 font-bold text-sm">
                  <AlertCircle className="h-4 w-4" />
                  <span>نتائج الفحص الأمني:</span>
                </div>
                <ul className="list-disc list-inside space-y-1">
                  {localReport.globalFindings.map((f, idx) => (
                    <li key={idx}>
                      <strong>[{f.code}]:</strong> {f.message} {f.file ? `(${f.file})` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Resource Upload Statuses */}
        {resourceStatuses.length > 0 && (
          <div className="space-y-2 border-t border-border/40 pt-4">
            <h3 className="text-sm font-semibold text-foreground">حالة الموارد</h3>
            <div className="space-y-1">
              {resourceStatuses.map((rs, idx) => (
                <div
                  key={rs.resource_code}
                  className="flex items-center justify-between rounded-lg border border-border/40 bg-muted/20 px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-muted-foreground">{rs.resource_code}</span>
                    <span className="text-foreground">{rs.title_ar}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ResourceStatusBadge status={rs.status} />
                    {rs.error && (
                      <span className="text-destructive text-[10px]">{rs.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Init Errors */}
        {initResult && initResult.errors.length > 0 && (
          <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 space-y-2 text-xs text-destructive">
            <div className="flex items-center gap-2 font-bold text-sm">
              <AlertCircle className="h-4 w-4" />
              <span>أخطاء الاستيراد ({initResult.errors.length})</span>
            </div>
            <ul className="list-disc list-inside space-y-1">
              {initResult.errors.map((e, idx) => (
                <li key={idx}>
                  <strong>صف {e.row_number} ({e.resource_code}):</strong> {e.message}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Disabled Notice */}
        {isBackendDisabled && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200/90 flex items-start gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong>Backend غير مفعّل:</strong> يمكنك إجراء فحص محلي (Dry-Run) فقط.
              لاستفعال الاستيراد الفعلي، يجب تفعيل feature flags: html_content_backend و html_content_upload.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResourceStatusBadge({ status }: { status: ResourceUploadStatus["status"] }) {
  const config: Record<
    ResourceUploadStatus["status"],
    { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
  > = {
    pending: { label: "في الانتظار", variant: "outline" },
    uploading: { label: "جاري الرفع...", variant: "secondary" },
    uploaded: { label: "تم الرفع", variant: "outline" },
    validating: { label: "جاري الفحص...", variant: "secondary" },
    validated: { label: "فحص ناجح", variant: "default" },
    validation_failed: { label: "فشل الفحص", variant: "destructive" },
    submitted: { label: "أُرسل للمراجعة", variant: "default" },
    error: { label: "خطأ", variant: "destructive" },
  };

  const { label, variant } = config[status];

  return (
    <Badge variant={variant} className="text-[10px]">
      {status === "uploading" || status === "validating" ? (
        <Loader2 className="h-3 w-3 animate-spin ml-1" />
      ) : null}
      {label}
    </Badge>
  );
}
