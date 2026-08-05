import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Download, FileArchive, FileSpreadsheet, Eye, ShieldAlert, Sparkles, Upload, Loader2, Lock } from "lucide-react";
import {
  InteractiveLessonResourceImportRow,
  ImportDryRunReport,
  runInteractiveResourceImportDryRun,
  generatePreviewHtmlBundle,
  PackageFileItem,
  buildPackageCsp,
  parseMasterZipBuffer,
  SecurityFinding,
} from "@/lib/content-import/html-package/index";
import { CONTENT_FEATURE_FLAGS } from "@/lib/content-onboarding/feature-flags";
import {
  createContentImportBatch,
  issueContentUpload,
  finalizeContentUpload,
  validateContentPackage,
  submitResourceForReview,
} from "@/lib/content-onboarding/rpc-client";

export function InteractiveHtmlImportPanel() {
  const [stage, setStage] = useState<number>(1);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportDryRunReport | null>(null);
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [previewSrcDoc, setPreviewSrcDoc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [batchId, setBatchId] = useState<string | null>(null);

  const isBackendUploadEnabled = CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_BACKEND && CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_UPLOAD;

  const handleExecuteImport = async () => {
    if (!isBackendUploadEnabled) {
      setActionMessage("عمليات الرفع والاستيراد الفعلية معطّلة حالياً عبر Feature Flag backend.");
      return;
    }

    if (!zipFile) {
      setActionMessage("يرجى اختيار ملف ZIP يحتوي الحزمة التفاعلية لبدء الاستيراد.");
      return;
    }

    setLoading(true);
    setActionMessage("جاري قراءة الحزم والتحقق الخادمي...");
    setStage(4);

    try {
      // 1. Ingest real ZIP & Preflight
      const zipArrayBuffer = await zipFile.arrayBuffer();
      const zipBytes = new Uint8Array(zipArrayBuffer);

      const zipScan = await parseMasterZipBuffer(zipBytes);
      if (!zipScan.isValid || Object.keys(zipScan.packageMap).length === 0) {
        setReport({
          summary: {
            totalRows: 1,
            validRows: 0,
            rejectedRows: 1,
            totalResourcesInZip: 0,
            validPackages: 0,
            rejectedPackages: 1,
            offlineEligibleCount: 0,
          },
          rows: [],
          packageResults: {},
          globalFindings: zipScan.findings,
        });
        setLoading(false);
        setStage(8);
        return;
      }

      const packageEntries = Object.entries(zipScan.packageMap);
      const [firstPkgCode, firstPkgFiles] = packageEntries[0];

      // Calculate real package hash & file metadata
      const { computePackageDeterministicHash } = await import("@/lib/content-import/html-package/index");
      const packageHash = await computePackageDeterministicHash(firstPkgFiles);

      const entryFileItem = firstPkgFiles.find((f) => f.path === "index.html" || f.path.endsWith("/index.html")) || firstPkgFiles[0];
      const entryFileName = entryFileItem ? entryFileItem.path : "index.html";

      const fileListPayload = firstPkgFiles.map((f) => ({
        file_path: f.path,
        file_size_bytes: f.size,
        mimeType: f.mimeType || "application/octet-stream",
        sha256_hash: f.contentSha256,
        is_entry_point: f.path === entryFileName,
      }));

      const cleanCode = (firstPkgCode || zipFile.name.replace(/\.zip$/i, "")).replace(/[^a-zA-Z0-9_-]/g, "");

      // 2. Create Import Batch
      const batchRes = await createContentImportBatch(excelFile?.name || `${cleanCode}.xlsx`, zipFile.name, packageEntries.length);
      if (!batchRes.success || !batchRes.data?.batch_id) {
        throw new Error(batchRes.error?.message || "فشل إنشاء دفعة الاستيراد الخادمية");
      }

      const activeBatchId = batchRes.data.batch_id;
      setBatchId(activeBatchId);

      // 3. Issue Upload Session
      const issueRes = await issueContentUpload(activeBatchId, cleanCode, zipFile.name);
      if (!issueRes.success || !issueRes.data?.staging_path) {
        throw new Error(issueRes.error?.message || "فشل إخراج مسار الرفع للمسودة");
      }

      // 4. Finalize Draft Upload
      const finalizeRes = await finalizeContentUpload(
        activeBatchId,
        "00000000-0000-0000-0000-000000000001",
        cleanCode,
        "mind_map_html",
        `حزمة ${cleanCode} التفاعلية`,
        issueRes.data.staging_path,
        packageHash,
        { entry: entryFileName },
        fileListPayload
      );

      if (!finalizeRes.success || !finalizeRes.data?.resource_id) {
        throw new Error(finalizeRes.error?.message || "فشل تأكيد المسودة بالخادم");
      }

      // 5. Attest Validation
      const valRes = await validateContentPackage(finalizeRes.data.resource_id, finalizeRes.data.version_id);
      if (!valRes.success) {
        throw new Error(valRes.error?.message || "فشل فحص الحزمة الخادمي");
      }

      setActionMessage("تم إنشاء المسودة واستكمال فحص السيرفر بنجاح!");
      setLoading(false);
      setStage(7);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "خطأ أثناء التنفيذ الخادمي";
      setActionMessage(`حدث خطأ أثناء التنفيذ: ${msg}`);
      setLoading(false);
      setStage(8);
    }
  };

  const handleSimulateDryRun = async () => {
    setLoading(true);
    setStage(4); // Preflight

    let packageFilesMap: Record<string, PackageFileItem[]> = {};
    let zipErrorFindings: SecurityFinding[] = [];

    if (zipFile && zipFile.size > 0) {
      try {
        const arrayBuffer = await zipFile.arrayBuffer();
        const zipRes = await parseMasterZipBuffer(new Uint8Array(arrayBuffer));
        if (!zipRes.isValid) {
          zipErrorFindings = zipRes.findings;
        } else {
          packageFilesMap = zipRes.packageMap;
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "خطأ في القراءة";
        zipErrorFindings = [
          {
            code: "ZIP_INGESTION_FAILED" as never,
            severity: "error",
            message: `فشل قراءة حزمة ZIP: ${msg}`,
          },
        ];
      }
    } else {
      zipErrorFindings = [
        {
          code: "MISSING_REQUIRED_FIELD" as never,
          severity: "error",
          message: "يرجى رفع ملف ZIP يحتوي على الحزمة التفاعلية لإجراء الفحص واللمعاينة.",
        },
      ];
    }

    if (zipErrorFindings.length > 0) {
      setReport({
        summary: {
          totalRows: 0,
          validRows: 0,
          rejectedRows: 1,
          totalResourcesInZip: 0,
          validPackages: 0,
          rejectedPackages: 1,
          offlineEligibleCount: 0,
        },
        rows: [],
        packageResults: {},
        globalFindings: zipErrorFindings,
      });
      setPreviewCode(null);
      setPreviewSrcDoc(null);
      setLoading(false);
      setStage(8);
      return;
    }

    const pkgCode = Object.keys(packageFilesMap)[0] || "interactive-package";
    const pkgFiles = packageFilesMap[pkgCode] || [];
    const entryFile = pkgFiles.find((f) => f.path === "index.html" || f.path.endsWith("/index.html")) || pkgFiles[0];
    const htmlText = entryFile?.buffer ? new TextDecoder().decode(entryFile.buffer) : "";

    const simulatedRows: InteractiveLessonResourceImportRow[] = [
      {
        resource_code: pkgCode,
        grade_code: "grade-12",
        subject_code: "subject-g12",
        lesson_code: "LES-G12-001",
        resource_type: "mind_map_html",
        title_ar: `حزمة ${pkgCode}`,
        description_ar: "معاينة حزمة مسبقة",
        package_path: pkgCode,
        entry_file: entryFile?.path || "index.html",
        sort_order: 1,
        version: 1,
        status: "draft",
        offline_enabled: true,
        orientation: "auto",
        height_mode: "viewport",
        completion_mode: "view",
        minimum_interaction_seconds: 15,
        alt_text_ar: `حزمة ${pkgCode}`,
      },
    ];

    const resReport = await runInteractiveResourceImportDryRun(simulatedRows, packageFilesMap);
    setReport(resReport);
    setPreviewCode(pkgCode);

    if (htmlText) {
      const csp = await buildPackageCsp([], pkgCode, 1, "nonce-demo-123");
      const srcDoc = generatePreviewHtmlBundle(htmlText, [], csp, pkgCode, 1, "nonce-demo-123");
      setPreviewSrcDoc(srcDoc);
    }

    setLoading(false);
    setStage(7);
  };

  return (
    <Card className="border-emerald-500/30 bg-emerald-950/10 shadow-sm" dir="rtl">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-400 shrink-0" />
            <CardTitle className="text-lg text-emerald-300">
              مركز استيراد وفحص الخرائط الذهنية والتجارب العملية HTML
            </CardTitle>
          </div>
          <Badge variant="outline" className={isBackendUploadEnabled ? "border-emerald-500 text-emerald-300" : "border-amber-500 text-amber-300"}>
            {isBackendUploadEnabled ? "Operational Backend Enabled" : "Simulator Mode (Flag Disabled)"}
          </Badge>
        </div>
        <CardDescription className="text-emerald-200/80">
          استيراد وفحص حزم HTML المضمنة والتحقق من عقود الأمان والاعتماد الخادمي.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {actionMessage && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            {actionMessage}
          </div>
        )}

        {/* Action Panel */}
        <div className="space-y-4 rounded-xl border border-emerald-500/20 bg-background/50 p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 pt-2">
            <div className="rounded-lg border border-dashed border-emerald-500/30 p-4 text-center space-y-2">
              <FileSpreadsheet className="mx-auto h-8 w-8 text-emerald-400" />
              <p className="text-xs text-muted-foreground">اختر ملف Excel (.xlsx) الخاص بالموارد التفاعلية</p>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                id="excel-file-input"
                onChange={(e) => e.target.files?.[0] && setExcelFile(e.target.files[0])}
              />
              <label htmlFor="excel-file-input">
                <Button variant="secondary" size="sm" type="button" className="cursor-pointer">
                  {excelFile ? excelFile.name : "اختر ملف Excel"}
                </Button>
              </label>
            </div>

            <div className="rounded-lg border border-dashed border-emerald-500/30 p-4 text-center space-y-2">
              <FileArchive className="mx-auto h-8 w-8 text-emerald-400" />
              <p className="text-xs text-muted-foreground">اختر حزمة ZIP الرئيسية التي تحتوي الموارد</p>
              <input
                type="file"
                accept=".zip"
                className="hidden"
                id="zip-file-input"
                onChange={(e) => e.target.files?.[0] && setZipFile(e.target.files[0])}
              />
              <label htmlFor="zip-file-input">
                <Button variant="secondary" size="sm" type="button" className="cursor-pointer">
                  {zipFile ? zipFile.name : "اختر ملف ZIP"}
                </Button>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
            <Button variant="outline" onClick={handleSimulateDryRun} disabled={loading}>
              <Eye className="ml-2 h-4 w-4 text-emerald-400" />
              تشغيل المحاكاة الفورية (In-Memory Preflight)
            </Button>

            <Button
              variant="default"
              onClick={handleExecuteImport}
              disabled={loading || !isBackendUploadEnabled}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جاري الاستيراد الخادمي…
                </>
              ) : isBackendUploadEnabled ? (
                <>
                  <Upload className="ml-2 h-4 w-4" />
                  بدء الاستيراد الخادمي والرفع الفعلي
                </>
              ) : (
                <>
                  <Lock className="ml-2 h-4 w-4" />
                  الرفع الفعلي معطل (Flag Off)
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Report Section */}
        {report && (
          <div className="space-y-4 rounded-xl border border-emerald-500/30 bg-card p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-foreground">تقرير الفحص والتحقق</h4>
              <Badge variant={report.summary.rejectedPackages > 0 ? "destructive" : "default"}>
                {report.summary.rejectedPackages > 0 ? "يوجد أخطاء مانعة" : "سليم وقابل للاستيراد"}
              </Badge>
            </div>

            {report.globalFindings.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-destructive">تنبيهات الأمن والجودة الخادمية:</div>
                <ul className="space-y-1 text-xs text-destructive/90 pr-4 list-disc">
                  {report.globalFindings.map((f, i) => (
                    <li key={i}>{f.message}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
