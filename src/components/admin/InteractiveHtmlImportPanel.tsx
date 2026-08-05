import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertCircle, CheckCircle2, Download, FileArchive, FileSpreadsheet, Eye, ShieldAlert, Sparkles, Upload } from "lucide-react";
import {
  InteractiveLessonResourceImportRow,
  ImportDryRunReport,
  runInteractiveResourceImportDryRun,
  generatePreviewHtmlBundle,
  PackageFileItem,
  buildPackageCsp,
  parseMasterZipBuffer,
} from "@/lib/content-import/html-package/index";

export function InteractiveHtmlImportPanel() {
  const [stage, setStage] = useState<number>(1);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportDryRunReport | null>(null);
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [previewSrcDoc, setPreviewSrcDoc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSimulateDryRun = async () => {
    setLoading(true);
    setStage(4); // Preflight

    let packageFilesMap: Record<string, PackageFileItem[]> = {};

    if (zipFile && zipFile.size > 0) {
      try {
        const arrayBuffer = await zipFile.arrayBuffer();
        const zipRes = await parseMasterZipBuffer(new Uint8Array(arrayBuffer));
        packageFilesMap = zipRes.packageMap;
      } catch {
        // Fallback to demo map if zip parsing fails or empty mock file used
      }
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
        alt_text_ar: "خريطة ذهنية توضح أجزاء الخلية النباتية",
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
      {
        resource_code: "EXP-G12-PHY-L004",
        grade_code: "grade-12",
        subject_code: "phys-g12-aden",
        lesson_code: "LES-G12-PHY-004",
        resource_type: "practical_experiment_html",
        title_ar: "تجربة قانون أوم للكهرباء",
        description_ar: "محاكاة تفاعلية لحساب المقاومة الكهربائية",
        package_path: "EXP-G12-PHY-L004",
        entry_file: "index.html",
        sort_order: 1,
        version: 1,
        status: "draft",
        offline_enabled: true,
        orientation: "landscape",
        height_mode: "viewport",
        completion_mode: "interaction_event",
        completion_event: "experiment_completed",
        minimum_interaction_seconds: 60,
      },
    ];

    const demoHtmlBody = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>معاينة خريطة ذهنية تفاعلية</title>
        <style>
          body { font-family: system-ui; padding: 20px; background: #0f172a; color: #f8fafc; text-align: center; }
          .node { border: 2px solid #38bdf8; border-radius: 12px; padding: 16px; margin: 10px auto; max-width: 300px; background: #1e293b; }
        </style>
      </head>
      <body>
        <div class="node">الخلية النباتية</div>
        <div class="node">الجدار الخلوي</div>
        <div class="node">البلاستيدات الخضراء</div>
        <script>
          console.log("Interactive HTML initialized safely inside sandbox");
        </script>
      </body>
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
          {
            path: "manifest.json",
            size: 150,
            isDir: false,
            contentSha256: "demo-sha-manifest",
            mimeType: "application/json",
            buffer: new TextEncoder().encode(
              JSON.stringify({
                resource_code: "MM-G12-BIO-L001",
                entry_file: "index.html",
                version: 1,
                resource_type: "mind_map_html",
                offline_enabled: true,
              })
            ),
          },
        ],
        "EXP-G12-PHY-L004": [
          {
            path: "index.html",
            size: demoHtmlBody.length,
            isDir: false,
            contentSha256: "demo-sha-2",
            mimeType: "text/html",
            buffer: new TextEncoder().encode(demoHtmlBody),
          },
          {
            path: "manifest.json",
            size: 150,
            isDir: false,
            contentSha256: "demo-sha-manifest-2",
            mimeType: "application/json",
            buffer: new TextEncoder().encode(
              JSON.stringify({
                resource_code: "EXP-G12-PHY-L004",
                entry_file: "index.html",
                version: 1,
                resource_type: "practical_experiment_html",
                offline_enabled: true,
              })
            ),
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
    setStage(7); // Preview stage
  };

  return (
    <Card className="border-emerald-500/30 bg-emerald-950/10 shadow-sm" dir="rtl">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-emerald-400 shrink-0" />
            <CardTitle className="text-lg text-emerald-300">
              مركز محاكاة استيراد الخرائط الذهنية والتجارب العملية (Source-Only Dry-Run)
            </CardTitle>
          </div>
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
            Source-Only Simulator
          </Badge>
        </div>
        <CardDescription className="text-emerald-200/80">
          محاكي اختبار وتدقيق المحتوى التفاعلي بصيغة HTML في الذاكرة دون كتابة في Storage أو Database.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Stages Indicator */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-xs font-medium">
          {[
            { num: 1, label: "تحميل القالب" },
            { num: 2, label: "رفع Excel" },
            { num: 3, label: "رفع ZIP" },
            { num: 4, label: "Preflight" },
            { num: 5, label: "Security scan" },
            { num: 6, label: "Curriculum check" },
            { num: 7, label: "Preview" },
            { num: 8, label: "Error report" },
            { num: 9, label: "Submit for review" },
            { num: 10, label: "Apply/Publish (معطل)" },
          ].map((s) => (
            <div
              key={s.num}
              className={`rounded-lg p-2 text-center border transition-all ${
                stage === s.num
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-200 font-bold"
                  : stage > s.num
                  ? "border-emerald-500/40 bg-emerald-900/30 text-emerald-300"
                  : "border-border/40 bg-muted/10 text-muted-foreground"
              }`}
            >
              <div className="text-[10px] opacity-75">مرحلة {s.num}</div>
              <div className="truncate">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Action Panel */}
        <div className="space-y-4 rounded-xl border border-emerald-500/20 bg-background/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">تحميل القوالب والدليل الفني</h3>
              <p className="text-xs text-muted-foreground">
                حمل نماذج Excel و ZIP ودليل الشروط الأمنية لمنع الأخطاء أثناء تجهيز المحتوى.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <a href="/docs/content-import/templates/interactive_lesson_resources_template.xlsx" download>
                  <Download className="ml-2 h-4 w-4 text-emerald-400" />
                  تحميل القالب (.xlsx)
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a href="/docs/content-import/templates/interactive_lesson_resources_example.xlsx" download>
                  <Download className="ml-2 h-4 w-4 text-emerald-400" />
                  تحميل نموذج الاسترشاد
                </a>
              </Button>
            </div>
          </div>

          {/* Upload Inputs Simulator */}
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
              <Button size="sm" variant="secondary" onClick={() => document.getElementById("excel-file-input")?.click()}>
                <Upload className="ml-2 h-3.5 w-3.5" />
                {excelFile ? excelFile.name : "رفع Excel"}
              </Button>
            </div>

            <div className="rounded-lg border border-dashed border-emerald-500/30 p-4 text-center space-y-2">
              <FileArchive className="mx-auto h-8 w-8 text-emerald-400" />
              <p className="text-xs text-muted-foreground">اختر حزمة الموارد المضغوطة (interactive_resources_files.zip)</p>
              <input
                type="file"
                accept=".zip"
                className="hidden"
                id="zip-file-input"
                onChange={(e) => e.target.files?.[0] && setZipFile(e.target.files[0])}
              />
              <Button size="sm" variant="secondary" onClick={() => document.getElementById("zip-file-input")?.click()}>
                <Upload className="ml-2 h-3.5 w-3.5" />
                {zipFile ? zipFile.name : "رفع ZIP"}
              </Button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2"
              disabled={loading}
              onClick={handleSimulateDryRun}
            >
              {loading ? "جاري فحص الحزمة أمنياً..." : "تشغيل فحص Dry-Run الشامل"}
            </Button>
          </div>
        </div>

        {/* Report & Preview Display */}
        {report && (
          <div className="space-y-4 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                نتائج فحص الحزمة (Dry-Run Summary)
              </h3>
              <div className="flex gap-2">
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
                  الصفو الصحيحة: {report.summary.validRows} / {report.summary.totalRows}
                </Badge>
                <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
                  الحزم المتوافقة: {report.summary.validPackages} / {report.summary.totalResourcesInZip}
                </Badge>
              </div>
            </div>

            {/* Sandbox Preview iframe */}
            {previewSrcDoc && (
              <div className="rounded-xl border border-border/60 bg-black/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-2">
                    <Eye className="h-4 w-4 text-emerald-400" />
                    معاينة حية داخل بيئة العزل (Sandboxed Iframe Preview) — {previewCode}
                  </p>
                  <Badge variant="secondary" className="text-[10px]">sandbox="allow-scripts"</Badge>
                </div>
                <div className="rounded-lg overflow-hidden border border-border/40 bg-background h-64">
                  <iframe
                    title="Interactive HTML Preview"
                    sandbox="allow-scripts"
                    srcDoc={previewSrcDoc}
                    className="w-full h-full border-0"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Apply Disabled Notice */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200/90 flex items-start gap-2">
          <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <strong>تنبيه صريح:</strong> هذا المحاكي يعمل بصورة مصدريّة فقط (Source-Only mode). زر Apply/Publish معطّل، ولا توجد عمليات كتابة في قاعدة البيانات أو التخزين (Database/Storage Writes Disabled). التشغيل الفعلي يتطلب تكامل Backend وموافقة Migration.
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
