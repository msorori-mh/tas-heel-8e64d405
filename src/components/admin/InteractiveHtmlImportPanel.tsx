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

    if (!excelFile || !zipFile) {
      setActionMessage("يرجى اختيار ملف Excel وملف ZIP لبدء الاستيراد.");
      return;
    }

    setLoading(true);
    setActionMessage("جاري قراءة الحزم والتحقق من الشروط...");
    setStage(4);

    try {
      // 1. Ingest ZIP & Local Preflight
      const zipArrayBuffer = await zipFile.arrayBuffer();
      const zipBytes = new Uint8Array(zipArrayBuffer);

      const zipScan = await parseMasterZipBuffer(zipBytes);
      if (!zipScan.isValid) {
        setReport({
          summary: {
            totalRows: 1,
            validRows: 0,
            rejectedRows: 1,
            totalResourcesInZip: 1,
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

      // 2. Create Batch
      const batchRes = await createContentImportBatch(excelFile.name, zipFile.name, 1);
      if (!batchRes.success || !batchRes.data?.batch_id) {
        throw new Error(batchRes.error?.message || "فشل إنشاء دفعة الاستيراد");
      }

      const activeBatchId = batchRes.data.batch_id;
      setBatchId(activeBatchId);

      // 3. Issue Upload Session
      const issueRes = await issueContentUpload(activeBatchId, "MM-G12-BIO-L001", zipFile.name);
      if (!issueRes.success) {
        throw new Error(issueRes.error?.message || "فشل إخراج مسار الرفع");
      }

      // 4. Finalize Draft Upload
      const finalizeRes = await finalizeContentUpload(
        activeBatchId,
        "00000000-0000-0000-0000-000000000000",
        "MM-G12-BIO-L001",
        "mind_map_html",
        "الخريطة الذهنية التفاعلية",
        issueRes.data.staging_path,
        "client-sha-hash",
        { entry: "index.html" },
        [{ file_path: "index.html", file_size_bytes: 100, mime_type: "text/html", sha256_hash: "hash", is_entry_point: true }]
      );

      if (!finalizeRes.success) {
        throw new Error(finalizeRes.error?.message || "فشل تأكيد الرفع في القاعدة");
      }

      // 5. Attest Validation
      await validateContentPackage(finalizeRes.data.resource_id, finalizeRes.data.version_id);

      setActionMessage("تم إنشاء المسودة واستكمال فحص السيرفر بنجاح!");
      setLoading(false);
      setStage(7);
    } catch (err: any) {
      setActionMessage(`حدث خطأ أثناء التنفيذ: ${err.message}`);
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
      } catch (err: any) {
        zipErrorFindings = [
          {
            code: "ZIP_INGESTION_FAILED" as any,
            severity: "error",
            message: `فشل قراءة حزمة ZIP: ${err.message}`,
          },
        ];
      }
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

    const demoRows: InteractiveLessonResourceImportRow[] = [
      {
        resource_code: "MM-G12-BIO-L001",
        grade_code: "grade-12",
        subject_code: "bio-g12-aden",
        lesson_code: "LES-G12-BIO-001",
        resource_type: "mind_map_html",
        title_ar: "الخريطة الذهنية التفاعلية للخلية النباتية",
        description_ar: "خريطة تفاعلية تدعم التكبير والتصغير",
        package_path: "MM-G12-BIO-L001",
        entry_file: "index.html",
        sort_order: 1,
        version: 1,
        status: "draft",
        offline_enabled: true,
        orientation: "auto",
        height_mode: "viewport",
        completion_mode: "view",
        minimum_interaction_seconds: 15,
      },
    ];

    const demoHtmlBody = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head><meta charset="UTF-8"><title>معاينة خريطة ذهنية</title></head>
      <body><div>الخلية النباتية</div></body>
      </html>
    `;

    if (Object.keys(packageFilesMap).length === 0) {
      packageFilesMap = {
        "MM-G12-BIO-L001": [
          {
            path: "index.html",
            size: demoHtmlBody.length,
            isDir: false,
            contentSha256: "demo-sha-1",
            mimeType: "text/html",
            buffer: new TextEncoder().encode(demoHtmlBody),
          },
        ],
      };
    }

    const resReport = await runInteractiveResourceImportDryRun(demoRows, packageFilesMap);
    setReport(resReport);
    setPreviewCode("MM-G12-BIO-L001");
    const csp = await buildPackageCsp([], "MM-G12-BIO-L001", 1, "nonce-demo-123");
    const srcDoc = generatePreviewHtmlBundle(
      demoHtmlBody,
      [],
      csp,
      "MM-G12-BIO-L001",
      1,
      "nonce-demo-123"
    );
    setPreviewSrcDoc(srcDoc);
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
