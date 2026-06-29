import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Badge } from "@/components/ui/badge";
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
import { listRecentImportJobs } from "@/lib/import/import-jobs-history.functions";
import type { ImportJobHistoryItem } from "@/lib/import/import-jobs-history.types";
import { IMPORT_TEMPLATE_CATALOG } from "@/lib/import-template-catalog";
import { AlertCircle, Clock, History, Loader2 } from "lucide-react";

function templateLabel(templateKey: string | null): string {
  if (!templateKey) return "—";
  const match = IMPORT_TEMPLATE_CATALOG.find((t) =>
    t.file.startsWith(templateKey),
  );
  return match?.nameAr ?? templateKey;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-EG", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function modeLabel(mode: string): string {
  if (mode === "dry_run") return "معاينة جافة";
  if (mode === "execute") return "تنفيذ";
  return mode;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: "مسودة",
    validating: "جاري التحقق",
    validated: "تم التحقق",
    validation_failed: "فشل التحقق",
    executing: "جاري التنفيذ",
    completed: "مكتمل",
    failed: "فشل",
    cancelled: "ملغي",
  };
  return labels[status] ?? status;
}

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "validated" || status === "completed") return "default";
  if (status === "validation_failed" || status === "failed") return "destructive";
  return "secondary";
}

function JobHistoryCard({ job }: { job: ImportJobHistoryItem }) {
  return (
    <div className="rounded-xl border border-border/55 bg-muted/20 p-4 space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-foreground">{formatDate(job.createdAt)}</span>
        <div className="flex flex-wrap gap-1">
          <Badge variant="outline" className="text-[11px]">{modeLabel(job.mode)}</Badge>
          <Badge variant={statusVariant(job.status)} className="text-[11px]">
            {statusLabel(job.status)}
          </Badge>
        </div>
      </div>
      <dl className="grid gap-2 text-xs">
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">القالب</dt>
          <dd className="text-foreground font-medium">{templateLabel(job.templateKey)}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">الملف</dt>
          <dd className="text-foreground truncate max-w-[60%]" title={job.originalFilename ?? undefined}>
            {job.originalFilename ?? "—"}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">الصفوف</dt>
          <dd className="text-foreground font-mono text-[11px]">
            {job.totalRows} / {job.validRows} / {job.invalidRows} / {job.warningRows}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-muted-foreground">تنفيذ فعلي؟</dt>
          <dd className="text-foreground">
            {job.noExecute === true ? "لا" : job.noExecute === false ? "نعم" : "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function ImportJobsHistory() {
  const fetchJobs = useServerFn(listRecentImportJobs);
  const [jobs, setJobs] = useState<ImportJobHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchJobs()
      .then((response) => {
        if (active) setJobs(response.jobs);
      })
      .catch((err: unknown) => {
        if (active) {
          const message =
            err instanceof Error ? err.message : "تعذر تحميل سجل الاستيراد.";
          setError(message);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [fetchJobs]);

  return (
    <Card className="border-border/55 shadow-card">
      <CardHeader className="space-y-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="h-5 w-5 text-primary shrink-0" />
          سجل عمليات الاستيراد
        </CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          يعرض آخر عمليات المعاينة أو الاستيراد، والمرحلة الحالية قراءة فقط.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin shrink-0" />
            <span>جاري تحميل سجل الاستيراد…</span>
          </div>
        )}

        {!loading && error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-destructive/35 bg-destructive/10 p-4 text-sm text-destructive"
          >
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <p>تعذر تحميل سجل الاستيراد.</p>
          </div>
        )}

        {!loading && !error && jobs.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-muted-foreground">
            <Clock className="h-8 w-8 opacity-50" />
            <p>لا توجد عمليات استيراد مسجلة بعد.</p>
          </div>
        )}

        {!loading && !error && jobs.length > 0 && (
          <>
            <div className="hidden md:block overflow-x-auto rounded-xl border border-border/50">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">التاريخ</TableHead>
                    <TableHead className="text-right">القالب</TableHead>
                    <TableHead className="text-right">الوضع</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">الملف</TableHead>
                    <TableHead className="text-right">الصفوف</TableHead>
                    <TableHead className="text-right">تنفيذ فعلي؟</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDate(job.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {templateLabel(job.templateKey)}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[11px]">
                          {modeLabel(job.mode)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(job.status)} className="text-[11px]">
                          {statusLabel(job.status)}
                        </Badge>
                      </TableCell>
                      <TableCell
                        className="max-w-[180px] truncate text-xs"
                        title={job.originalFilename ?? undefined}
                      >
                        {job.originalFilename ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] whitespace-nowrap">
                        {job.totalRows} / {job.validRows} / {job.invalidRows} /{" "}
                        {job.warningRows}
                      </TableCell>
                      <TableCell className="text-sm">
                        {job.noExecute === true
                          ? "لا"
                          : job.noExecute === false
                            ? "نعم"
                            : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden space-y-3">
              {jobs.map((job) => (
                <JobHistoryCard key={job.id} job={job} />
              ))}
            </div>
          </>
        )}

        <p className="text-xs text-muted-foreground/90 leading-relaxed">
          تفاصيل الأخطاء ستُضاف في مرحلة لاحقة بعد اعتماد سياسة عرض آمنة.
        </p>
      </CardContent>
    </Card>
  );
}
