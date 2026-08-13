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
import { CONTENT_IMPORT_TEMPLATES } from "@/lib/content-import/content-import-templates";
import { AlertCircle, Clock, History, Loader2 } from "lucide-react";

function templateLabel(templateKey: string | null): string {
  if (!templateKey) return "—";
  const match = CONTENT_IMPORT_TEMPLATES.find((t) => t.key === templateKey);
  if (!match) return templateKey;
  return `${String(match.order).padStart(2, "0")} — ${match.titleAr}`;
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-EG", {
    dateStyle: "short",
    timeStyle: "short",
  });
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
  const rows: Array<[string, string]> = [
    ["القالب", templateLabel(job.templateKey)],
    ["الملف", job.originalFilename ?? "—"],
    ["الصفوف", String(job.totalRows)],
    ["مُدرج", String(job.insertedCount)],
    ["مُحدّث", String(job.updatedCount)],
    ["متجاوَز", String(job.skippedCount)],
    ["محجوب (منشور)", String(job.blockedCount)],
    ["أخطاء", String(job.errorsCount)],
    ["المشغّل", job.operatorName ?? "—"],
    ["التاريخ", formatDate(job.createdAt)],
  ];

  return (
    <div className="rounded-xl border border-border/55 bg-muted/20 p-4 space-y-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-foreground">{formatDate(job.createdAt)}</span>
        <Badge variant={statusVariant(job.status)} className="text-[11px]">
          {statusLabel(job.status)}
        </Badge>
      </div>
      <dl className="grid gap-2 text-xs">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-2">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-foreground truncate max-w-[60%]" title={value}>
              {value}
            </dd>
          </div>
        ))}
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
          آخر عشر عمليات معاينة أو تنفيذ، بالأرقام الفعلية المسجلة لكل عملية.
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
                    <TableHead className="text-right">القالب</TableHead>
                    <TableHead className="text-right">الملف</TableHead>
                    <TableHead className="text-right">الصفوف</TableHead>
                    <TableHead className="text-right">مُدرج</TableHead>
                    <TableHead className="text-right">مُحدّث</TableHead>
                    <TableHead className="text-right">متجاوَز</TableHead>
                    <TableHead className="text-right">محجوب</TableHead>
                    <TableHead className="text-right">أخطاء</TableHead>
                    <TableHead className="text-right">الحالة</TableHead>
                    <TableHead className="text-right">المشغّل</TableHead>
                    <TableHead className="text-right">التاريخ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {templateLabel(job.templateKey)}
                      </TableCell>
                      <TableCell
                        className="max-w-[180px] truncate text-xs"
                        title={job.originalFilename ?? undefined}
                      >
                        {job.originalFilename ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-[11px]">{job.totalRows}</TableCell>
                      <TableCell className="font-mono text-[11px]">{job.insertedCount}</TableCell>
                      <TableCell className="font-mono text-[11px]">{job.updatedCount}</TableCell>
                      <TableCell className="font-mono text-[11px]">{job.skippedCount}</TableCell>
                      <TableCell className="font-mono text-[11px]">{job.blockedCount}</TableCell>
                      <TableCell className="font-mono text-[11px]">{job.errorsCount}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(job.status)} className="text-[11px]">
                          {statusLabel(job.status)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {job.operatorName ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {formatDate(job.createdAt)}
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
      </CardContent>
    </Card>
  );
}
