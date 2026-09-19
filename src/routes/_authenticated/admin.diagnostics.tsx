import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Activity, AlertTriangle, Bug, Loader2, RefreshCw, Users } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import {
  adminDiagnosticsIssueDetail,
  adminDiagnosticsOverview,
  adminDiagnosticsSetStatus,
  type DiagnosticsEvent,
  type DiagnosticsIssue,
  type DiagnosticsSummary,
} from "@/lib/diagnostics/diagnostics-admin.functions";
import {
  DIAGNOSTIC_ISSUE_STATUSES,
  DIAGNOSTIC_WINDOWS,
  type DiagnosticIssueStatus,
  type DiagnosticWindow,
} from "@/lib/diagnostics/diagnostics-contract";
import { DIAGNOSTICS_SOURCE_ADAPTERS } from "@/lib/diagnostics/diagnostics-sources";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/diagnostics")({
  component: AdminDiagnosticsPage,
  head: () => ({
    meta: [
      { title: "صحة التطبيق والتشخيص | تمكين الطالب" },
      {
        name: "description",
        content: "لوحة إدارية لمتابعة أخطاء تطبيق تمكين وحالة المشكلات التقنية.",
      },
      { property: "og:title", content: "صحة التطبيق والتشخيص | تمكين الطالب" },
      {
        property: "og:description",
        content: "لوحة إدارية لمتابعة أخطاء تطبيق تمكين وحالة المشكلات التقنية.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const WINDOW_LABELS: Record<DiagnosticWindow, string> = {
  "24h": "آخر ٢٤ ساعة",
  "7d": "آخر ٧ أيام",
  "30d": "آخر ٣٠ يوماً",
};

const STATUS_LABELS: Record<DiagnosticIssueStatus, string> = {
  new: "جديدة",
  investigating: "قيد الفحص",
  resolved: "تم حلها",
  ignored: "متجاهَلة",
};

const SEVERITY_LABELS: Record<string, string> = {
  fatal: "حرجة جداً",
  error: "خطأ",
  warning: "تحذير",
  info: "معلومة",
};

function severityVariant(severity: string): "destructive" | "secondary" | "outline" {
  if (severity === "fatal" || severity === "error") return "destructive";
  if (severity === "warning") return "secondary";
  return "outline";
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("ar-EG", { dateStyle: "short", timeStyle: "short" });
}

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number | string;
  icon: typeof Activity;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-xs text-muted-foreground">{title}</p>
          <p className="text-xl font-bold text-foreground">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminDiagnosticsPage() {
  const { loading, enabled } = useRequireAdminSection("full");
  const fetchOverview = useServerFn(adminDiagnosticsOverview);
  const fetchDetail = useServerFn(adminDiagnosticsIssueDetail);
  const setStatus = useServerFn(adminDiagnosticsSetStatus);

  const [range, setRange] = useState<DiagnosticWindow>("24h");
  const [summary, setSummary] = useState<DiagnosticsSummary | null>(null);
  const [issues, setIssues] = useState<DiagnosticsIssue[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [openIssue, setOpenIssue] = useState<DiagnosticsIssue | null>(null);
  const [detail, setDetail] = useState<DiagnosticsEvent[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const result = await fetchOverview({ data: { window: range } });
      setSummary(result.summary);
      setIssues(result.issues);
    } catch {
      setListError("تعذّر تحميل بيانات التشخيص. حاول مرة أخرى.");
    } finally {
      setListLoading(false);
    }
  }, [fetchOverview, range]);

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  const openDetail = useCallback(
    async (issue: DiagnosticsIssue) => {
      setOpenIssue(issue);
      setDetail([]);
      setDetailError(null);
      setDetailLoading(true);
      try {
        const result = await fetchDetail({ data: { fingerprint: issue.fingerprint } });
        setDetail(result.events);
      } catch {
        setDetailError("تعذّر تحميل تفاصيل المشكلة.");
      } finally {
        setDetailLoading(false);
      }
    },
    [fetchDetail],
  );

  const changeStatus = useCallback(
    async (fingerprint: string, status: DiagnosticIssueStatus) => {
      try {
        await setStatus({ data: { fingerprint, status } });
        setIssues((prev) =>
          prev.map((issue) => (issue.fingerprint === fingerprint ? { ...issue, status } : issue)),
        );
        setOpenIssue((prev) => (prev && prev.fingerprint === fingerprint ? { ...prev, status } : prev));
        toast.success("تم تحديث حالة المشكلة");
      } catch {
        toast.error("تعذّر تحديث حالة المشكلة");
      }
    },
    [setStatus],
  );

  if (loading || !enabled) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-5" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-foreground">صحة التطبيق والتشخيص</h1>
            <p className="text-sm text-muted-foreground">
              أخطاء التطبيق المسجّلة تقنياً فقط، دون أي بيانات شخصية للطلاب.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={(v) => setRange(v as DiagnosticWindow)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DIAGNOSTIC_WINDOWS.map((w) => (
                  <SelectItem key={w} value={w}>
                    {WINDOW_LABELS[w]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5">
              <RefreshCw className="h-4 w-4" />
              تحديث
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard title="إجمالي الأحداث" value={summary?.total_events ?? 0} icon={Activity} />
          <StatCard title="المستخدمون المتأثرون" value={summary?.affected_users ?? 0} icon={Users} />
          <StatCard
            title="الأحداث الحرجة"
            value={summary?.critical_events ?? 0}
            icon={AlertTriangle}
          />
          <StatCard title="المشكلات الجديدة" value={summary?.new_issues ?? 0} icon={Bug} />
        </div>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">مصادر البيانات</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3">
            {DIAGNOSTICS_SOURCE_ADAPTERS.map((adapter) => (
              <div key={adapter.id} className="rounded-xl border border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">{adapter.label}</span>
                  <Badge variant={adapter.connected ? "default" : "outline"}>
                    {adapter.connected ? "مفعّل" : "غير مربوط بعد"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{adapter.note}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        {listError && (
          <Alert variant="destructive">
            <AlertDescription>{listError}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">المشكلات المجمّعة</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {listLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : issues.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                لا توجد أخطاء مسجّلة في هذه الفترة.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-right text-sm">
                  <thead className="border-b border-border text-xs text-muted-foreground">
                    <tr>
                      <th className="p-3 font-medium">الخطورة</th>
                      <th className="p-3 font-medium">نوع الحدث</th>
                      <th className="p-3 font-medium">الرسالة</th>
                      <th className="p-3 font-medium">التكرار</th>
                      <th className="p-3 font-medium">المتأثرون</th>
                      <th className="p-3 font-medium">أول ظهور</th>
                      <th className="p-3 font-medium">آخر ظهور</th>
                      <th className="p-3 font-medium">الإصدار</th>
                      <th className="p-3 font-medium">المنصة</th>
                      <th className="p-3 font-medium">المسار</th>
                      <th className="p-3 font-medium">الحالة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {issues.map((issue) => (
                      <tr
                        key={issue.fingerprint}
                        className="cursor-pointer border-b border-border/60 hover:bg-muted/50"
                        onClick={() => void openDetail(issue)}
                      >
                        <td className="p-3">
                          <Badge variant={severityVariant(issue.severity)}>
                            {SEVERITY_LABELS[issue.severity] ?? issue.severity}
                          </Badge>
                        </td>
                        <td className="p-3 text-xs">{issue.event_type}</td>
                        <td className="max-w-[280px] truncate p-3">{issue.message}</td>
                        <td className="p-3">{issue.event_count}</td>
                        <td className="p-3">{issue.affected_users}</td>
                        <td className="p-3 text-xs">{formatDate(issue.first_seen)}</td>
                        <td className="p-3 text-xs">{formatDate(issue.last_seen)}</td>
                        <td className="p-3 text-xs">{issue.app_version ?? "—"}</td>
                        <td className="p-3 text-xs">{issue.platform ?? "—"}</td>
                        <td className="max-w-[160px] truncate p-3 text-xs">{issue.route ?? "—"}</td>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <Select
                            value={issue.status}
                            onValueChange={(v) =>
                              void changeStatus(issue.fingerprint, v as DiagnosticIssueStatus)
                            }
                          >
                            <SelectTrigger className="h-8 w-32 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {DIAGNOSTIC_ISSUE_STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {STATUS_LABELS[s]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!openIssue} onOpenChange={(open) => !open && setOpenIssue(null)}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right text-sm">
              {openIssue?.message ?? "تفاصيل المشكلة"}
            </DialogTitle>
          </DialogHeader>
          {detailLoading ? (
            <div className="flex items-center justify-center py-10 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : detailError ? (
            <Alert variant="destructive">
              <AlertDescription>{detailError}</AlertDescription>
            </Alert>
          ) : detail.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">لا توجد أحداث مسجّلة.</p>
          ) : (
            <div className="space-y-3">
              {detail.map((event) => (
                <div key={event.id} className="rounded-xl border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <Badge variant={severityVariant(event.severity)}>
                      {SEVERITY_LABELS[event.severity] ?? event.severity}
                    </Badge>
                    <span>{formatDate(event.created_at)}</span>
                    <span>• {event.event_type}</span>
                    {event.route && <span>• {event.route}</span>}
                    {event.action && <span>• {event.action}</span>}
                  </div>
                  <p className="mt-2 text-sm text-foreground">{event.message}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
                    <div>الإصدار: {event.app_version ?? "—"}</div>
                    <div>المنصة: {event.platform ?? "—"}</div>
                    <div>النظام: {event.os_version ?? "—"}</div>
                    <div>الجهاز: {event.device_model ?? "—"}</div>
                    <div>الشبكة: {event.network_type ?? "—"}</div>
                    <div>متصل: {event.online === null ? "—" : event.online ? "نعم" : "لا"}</div>
                  </dl>
                  {event.stack && (
                    <pre
                      dir="ltr"
                      className="mt-2 max-h-56 overflow-auto rounded-lg bg-muted p-2 text-[11px] leading-relaxed text-muted-foreground"
                    >
                      {event.stack}
                    </pre>
                  )}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
