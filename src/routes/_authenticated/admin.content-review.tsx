import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { useAuth } from "@/hooks/use-auth";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Filter,
  Lock,
  Loader2,
  RotateCcw,
  AlertCircle,
  Unplug,
} from "lucide-react";
import {
  getHtmlReviewQueueFn,
  approveHtmlResourceFn,
  rejectHtmlResourceFn,
  publishHtmlResourceFn,
  unpublishHtmlResourceFn,
  rollbackHtmlResourceFn,
  checkHtmlBackendEnabledFn,
} from "@/lib/api/html-workflow.functions";
import type { ReviewQueueItem } from "@/lib/server/html-pipeline/html-workflow.types";

export const Route = createFileRoute("/_authenticated/admin/content-review")({
  component: AdminContentReviewPage,
});

function AdminContentReviewPage() {
  const { loading, enabled } = useRequireAdminSection("content");
  const { isAdmin } = useAuth();
  const [items, setItems] = useState<ReviewQueueItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [backendEnabled, setBackendEnabled] = useState<boolean | null>(null);

  const runGetQueue = useServerFn(getHtmlReviewQueueFn);
  const runApprove = useServerFn(approveHtmlResourceFn);
  const runReject = useServerFn(rejectHtmlResourceFn);
  const runPublish = useServerFn(publishHtmlResourceFn);
  const runUnpublish = useServerFn(unpublishHtmlResourceFn);
  const runCheckBackend = useServerFn(checkHtmlBackendEnabledFn);

  const fetchQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueError(null);
    try {
      const queue = await runGetQueue();
      setItems(queue);
      if (queue.length > 0 && !selectedId) {
        setSelectedId(queue[0].resource_id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setQueueError(`فشل جلب طابور المراجعة: ${msg}`);
    } finally {
      setQueueLoading(false);
    }
  }, [selectedId, runGetQueue]);

  const checkBackend = useCallback(async () => {
    try {
      const result = await runCheckBackend();
      setBackendEnabled(result.backendEnabled);
    } catch {
      setBackendEnabled(false);
    }
  }, [runCheckBackend]);

  useEffect(() => {
    if (enabled) {
      void fetchQueue();
      void checkBackend();
    }
  }, [enabled, fetchQueue, checkBackend]);

  if (loading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          جاري التحميل…
        </div>
      </AdminLayout>
    );
  }

  if (!enabled) {
    return null;
  }

  const selectedItem = items.find((i) => i.resource_id === selectedId) || items[0] || null;
  const filteredItems = items.filter(
    (i) => statusFilter === "all" || i.lifecycle_status === statusFilter,
  );

  const handleAction = async (
    action: string,
    resourceId: string,
    versionId?: string,
  ) => {
    setActionLoading(action);
    setActionError(null);

    try {
      let result: { success: boolean; message: string; new_status: string };

      switch (action) {
        case "approve": {
          if (!versionId) throw new Error("versionId مطلوب للاعتماد");
          const res = await runApprove({ data: { resourceId, versionId } });
          result = { success: res.success, message: res.message, new_status: res.new_status };
          break;
        }
        case "reject": {
          if (!versionId) throw new Error("versionId مطلوب للرفض");
          const trimmedReason = rejectReason.trim();
          if (!trimmedReason) throw new Error("سبب الرفض مطلوب");
          const res = await runReject({
            data: {
              resourceId,
              versionId,
              reason: trimmedReason,
            },
          });
          result = { success: res.success, message: res.message, new_status: res.new_status };
          setShowRejectDialog(false);
          setRejectReason("");
          break;
        }
        case "publish": {
          const res = await runPublish({
            data: {
              resourceId,
              resourceVersionId: versionId,
            },
          });
          result = { success: res.success, message: res.message, new_status: res.new_status };
          break;
        }
        case "unpublish": {
          const res = await runUnpublish({ data: { resourceId } });
          result = { success: res.success, message: res.message, new_status: res.new_status };
          break;
        }
        default:
          throw new Error(`إجراء غير معروف: ${action}`);
      }

      if (!result.success) {
        setActionError(result.message);
      } else {
        await fetchQueue();
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(`فشل الإجراء: ${msg}`);
    } finally {
      setActionLoading(null);
    }
  };

  const statusLabel = (status: string): string => {
    const labels: Record<string, string> = {
      draft: "مسودة",
      in_review: "قيد المراجعة",
      approved: "معتمد",
      published: "منشور",
      rejected: "مرفوض",
      archived: "مؤرشف",
    };
    return labels[status] || status;
  };

  const statusBadgeVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
      case "published": return "default";
      case "in_review": return "secondary";
      case "rejected": return "destructive";
      case "approved": return "outline";
      default: return "outline";
    }
  };

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl space-y-6" dir="rtl">
        {/* Backend Status Banner */}
        {backendEnabled === false && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs font-semibold text-amber-200 flex items-center gap-2">
            <Lock className="h-5 w-5 text-amber-400 shrink-0" />
            <span>Backend pipeline غير مفعّل — طابور المراجعة فارغ. فعّل html_content_backend للعرض الفعلي.</span>
          </div>
        )}

        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-emerald-400 shrink-0" />
            <h1 className="text-2xl font-bold text-foreground">مراجعة المحتوى التفاعلي</h1>
            {backendEnabled && (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
                متصل بالخادم
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            مراجعة وإدارة المحتوى التفاعلي HTML عبر Trusted Server Pipeline.
          </p>
        </header>

        {/* Queue Error */}
        {queueError && (
          <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-5 w-5 shrink-0" />
            <span>{queueError}</span>
            <Button variant="outline" size="sm" className="mr-auto gap-1" onClick={fetchQueue}>
              <RotateCcw className="h-3 w-3" />
              إعادة المحاولة
            </Button>
          </div>
        )}

        {/* Action Error */}
        {actionError && (
          <div className="rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{actionError}</span>
            <Button variant="ghost" size="sm" className="mr-auto" onClick={() => setActionError(null)}>
              إغلاق
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Items Sidebar */}
          <div className="space-y-4 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                <Filter className="h-3.5 w-3.5" />
                تصفية حسب الحالة
              </span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-md border border-input bg-background px-2 py-1 text-xs"
              >
                <option value="all">جميع الحالات</option>
                <option value="in_review">قيد المراجعة</option>
                <option value="approved">معتمد</option>
                <option value="published">منشور</option>
                <option value="rejected">مرفوض</option>
                <option value="draft">مسودة</option>
              </select>
            </div>

            {queueLoading ? (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="rounded-lg border border-border/40 p-6 text-center text-sm text-muted-foreground">
                {backendEnabled === false
                  ? "Backend غير مفعّل"
                  : "لا توجد موارد في طابور المراجعة"}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredItems.map((item) => (
                  <Card
                    key={item.resource_id}
                    className={`cursor-pointer transition-all border ${
                      selectedId === item.resource_id
                        ? "border-emerald-500 bg-emerald-950/20"
                        : "border-border/40 hover:border-emerald-500/40"
                    }`}
                    onClick={() => setSelectedId(item.resource_id)}
                  >
                    <CardContent className="p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="text-[10px]">
                          {item.resource_type}
                        </Badge>
                        <Badge variant={statusBadgeVariant(item.lifecycle_status)} className="text-[10px]">
                          {statusLabel(item.lifecycle_status)}
                        </Badge>
                      </div>
                      <h3 className="font-semibold text-xs leading-snug text-foreground">
                        {item.title}
                      </h3>
                      <p className="text-[11px] text-muted-foreground">
                        {item.lesson_title}
                        {item.version_number ? ` — v${item.version_number}` : ""}
                      </p>
                      {item.security_findings_count > 0 && (
                        <p className="text-[10px] text-amber-400">
                          تنبيهات أمنية: {item.security_findings_count}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Main Review Area */}
          <div className="space-y-4 lg:col-span-2">
            {selectedItem ? (
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base font-bold">{selectedItem.title}</CardTitle>
                      <CardDescription className="text-xs">
                        الكود: {selectedItem.resource_code} | الإصدار: v{selectedItem.version_number ?? "?"} | الحالة: {statusLabel(selectedItem.lifecycle_status)}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {isAdmin && selectedItem.lifecycle_status === "in_review" && selectedItem.current_version_id && (
                        <>
                          <Button
                            size="sm"
                            className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
                            disabled={actionLoading !== null}
                            onClick={() => handleAction("approve", selectedItem.resource_id, selectedItem.current_version_id ?? undefined)}
                          >
                            {actionLoading === "approve" ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-4 w-4" />
                            )}
                            اعتماد
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="gap-1"
                            disabled={actionLoading !== null}
                            onClick={() => setShowRejectDialog(true)}
                          >
                            <XCircle className="h-4 w-4" />
                            رفض
                          </Button>
                        </>
                      )}

                      {isAdmin && selectedItem.lifecycle_status === "approved" && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
                          disabled={actionLoading !== null}
                          onClick={() => handleAction("publish", selectedItem.resource_id, selectedItem.current_version_id ?? undefined)}
                        >
                          {actionLoading === "publish" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-4 w-4" />
                          )}
                          نشر
                        </Button>
                      )}

                      {isAdmin && selectedItem.lifecycle_status === "published" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-amber-500 border-amber-500/40 gap-1"
                          disabled={actionLoading !== null}
                          onClick={() => handleAction("unpublish", selectedItem.resource_id)}
                        >
                          {actionLoading === "unpublish" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Unplug className="h-4 w-4" />
                          )}
                          إلغاء النشر
                        </Button>
                      )}
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Security Status */}
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-300">
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                      <span>
                        الفحص الأمني: {selectedItem.security_findings_count === 0
                          ? "لا توجد انتهاكات"
                          : `${selectedItem.security_findings_count} تنبيه(ات)`}
                      </span>
                    </div>
                    {selectedItem.content_sha256 && (
                      <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px] font-mono">
                        SHA: {selectedItem.content_sha256.slice(0, 12)}...
                      </Badge>
                    )}
                  </div>

                  {/* Metadata */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-border/40 p-3">
                      <p className="text-muted-foreground">الدرس</p>
                      <p className="font-semibold">{selectedItem.lesson_title}</p>
                    </div>
                    <div className="rounded-lg border border-border/40 p-3">
                      <p className="text-muted-foreground">النوع</p>
                      <p className="font-semibold">{selectedItem.resource_type}</p>
                    </div>
                    {selectedItem.submitted_at && (
                      <div className="rounded-lg border border-border/40 p-3">
                        <p className="text-muted-foreground">تاريخ الإرسال</p>
                        <p className="font-semibold">
                          {new Date(selectedItem.submitted_at).toLocaleDateString("ar")}
                        </p>
                      </div>
                    )}
                    {selectedItem.submitted_by && (
                      <div className="rounded-lg border border-border/40 p-3">
                        <p className="text-muted-foreground">أرسل بواسطة</p>
                        <p className="font-semibold font-mono text-[10px]">{selectedItem.submitted_by}</p>
                      </div>
                    )}
                  </div>

                  {/* Reject Dialog */}
                  {showRejectDialog && (
                    <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-3">
                      <p className="text-sm font-semibold text-destructive">سبب الرفض</p>
                      <textarea
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        rows={3}
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder="اكتب سبب الرفض..."
                      />
                      <div className="flex gap-2 justify-end">
                        <Button variant="outline" size="sm" onClick={() => setShowRejectDialog(false)}>
                          إلغاء
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={actionLoading !== null}
                          onClick={() => handleAction("reject", selectedItem.resource_id, selectedItem.current_version_id ?? undefined)}
                        >
                          {actionLoading === "reject" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                          تأكيد الرفض
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-lg border border-border/40 p-12 text-center text-muted-foreground">
                اختر مورداً من القائمة لعرض التفاصيل
              </div>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
