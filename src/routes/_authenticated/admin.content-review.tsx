import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, XCircle, Eye, ShieldCheck, Play, Sparkles, Filter, Lock, Loader2, RefreshCw } from "lucide-react";
import { InteractiveResourceViewer, InteractiveResourceItem } from "@/components/lessons/InteractiveResourceViewer";
import { CONTENT_FEATURE_FLAGS } from "@/lib/content-onboarding/feature-flags";
import {
  approveResourceVersion,
  rejectResourceVersion,
  publishResourceVersion,
  unpublishResourceVersion,
  rollbackPublishedResourceVersion,
} from "@/lib/content-onboarding/rpc-client";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/content-review")({
  component: AdminContentReviewPage,
});

interface ReviewItem extends InteractiveResourceItem {
  status: "draft" | "in_review" | "approved" | "published" | "rejected" | "archived";
  grade_name: string;
  subject_name: string;
  lesson_title: string;
  lock_version: number;
  current_draft_version_id?: string;
  approved_version_id?: string;
  published_version_id?: string;
  rejection_reason?: string;
  security_findings_count: number;
}

const DEMO_REVIEW_ITEMS: ReviewItem[] = [
  {
    id: "rev-01",
    resource_code: "MM-G12-BIO-L001",
    resource_type: "mind_map_html",
    title_ar: "الخريطة الذهنية التفاعلية للخلية النباتية",
    description_ar: "خريطة تفاعلية تدعم التكبير والتصغير لتركيب الخلية",
    version: 1,
    lock_version: 1,
    entry_file: "index.html",
    html_content: `
      <!DOCTYPE html>
      <html dir="rtl">
      <head><title>الخلية النباتية</title><style>body{font-family:sans-serif;background:#0f172a;color:#fff;text-align:center;padding:20px;}.box{border:2px solid #38bdf8;padding:15px;margin:10px auto;max-width:250px;border-radius:10px;background:#1e293b;}</style></head>
      <body>
        <div class="box">الخلية النباتية (معاينة تجريبية)</div>
      </body>
      </html>
    `,
    offline_enabled: true,
    status: "in_review",
    grade_name: "الصف الثاني عشر",
    subject_name: "الأحياء",
    lesson_title: "تركيب الخلية النباتية ووظائف المكونات",
    security_findings_count: 0,
  },
];

function AdminContentReviewPage() {
  const { loading: accessLoading, enabled: adminEnabled } = useRequireAdminSection("content");
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isBackendActive = CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_BACKEND;

  const fetchPendingReviews = async () => {
    setLoading(true);
    setErrorMsg(null);

    if (!isBackendActive) {
      setItems(DEMO_REVIEW_ITEMS);
      setSelectedId(DEMO_REVIEW_ITEMS[0].id);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("lesson_resources")
        .select(`
          id, resource_code, resource_type, title, description, status, lock_version,
          current_draft_version_id, approved_version_id, published_version_id,
          lessons ( title )
        `)
        .in("status", ["in_review", "approved", "published", "rejected"]);

      if (error) {
        throw new Error(error.message);
      }

      const mapped: ReviewItem[] = (data || []).map((r: any) => ({
        id: r.id,
        resource_code: r.resource_code || r.id,
        resource_type: r.resource_type,
        title_ar: r.title,
        description_ar: r.description || "",
        version: 1,
        lock_version: r.lock_version || 1,
        entry_file: "index.html",
        html_content: "<!-- Signed iframe content loaded on demand -->",
        offline_enabled: true,
        status: r.status,
        grade_name: "الصف العام",
        subject_name: "المادة العامة",
        lesson_title: r.lessons?.title || "درس عام",
        security_findings_count: 0,
        current_draft_version_id: r.current_draft_version_id,
        approved_version_id: r.approved_version_id,
        published_version_id: r.published_version_id,
      }));

      setItems(mapped);
      if (mapped.length > 0) {
        setSelectedId(mapped[0].id);
      }
    } catch (err: any) {
      setErrorMsg(`تعذر تحميل قائمة المراجعة الخادمية: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminEnabled) {
      fetchPendingReviews();
    }
  }, [adminEnabled, isBackendActive]);

  if (accessLoading) {
    return (
      <AdminLayout>
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          جاري التحميل…
        </div>
      </AdminLayout>
    );
  }

  if (!adminEnabled) {
    return null;
  }

  const selectedItem = items.find((i) => i.id === selectedId) || items[0];

  const handleApprove = async () => {
    if (!selectedItem) return;
    if (!isBackendActive) {
      setErrorMsg("الاعتماد الفعلي معطل عبر Feature Flag backend.");
      return;
    }

    setActionLoading(true);
    setErrorMsg(null);

    const versionId = selectedItem.current_draft_version_id || selectedItem.approved_version_id;
    if (!versionId) {
      setErrorMsg("لا توجد نسخة مرتبطة بهذا المورد للاعتماد.");
      setActionLoading(false);
      return;
    }

    const res = await approveResourceVersion(selectedItem.id, versionId, selectedItem.lock_version);
    if (!res.success) {
      setErrorMsg(`فشل اعتماد المورد: ${res.error?.message} (تحقق من CAS lock_version)`);
    } else {
      await fetchPendingReviews();
    }
    setActionLoading(false);
  };

  const handleReject = async () => {
    if (!selectedItem) return;
    if (!isBackendActive) {
      setErrorMsg("الرفض الفعلي معطل عبر Feature Flag backend.");
      return;
    }

    setActionLoading(true);
    setErrorMsg(null);

    const versionId = selectedItem.current_draft_version_id || selectedItem.approved_version_id;
    if (!versionId) {
      setErrorMsg("لا توجد نسخة مرتبطة بهذا المورد للرفض.");
      setActionLoading(false);
      return;
    }

    const res = await rejectResourceVersion(selectedItem.id, versionId, "رفض بواسطة مسؤول المحتوى الخادمي", selectedItem.lock_version);
    if (!res.success) {
      setErrorMsg(`فشل رفض المورد: ${res.error?.message}`);
    } else {
      await fetchPendingReviews();
    }
    setActionLoading(false);
  };

  const handlePublish = async () => {
    if (!selectedItem) return;
    if (!CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_PUBLISH) {
      setErrorMsg("النشر الفعلي معطل عبر Feature Flag backend.");
      return;
    }

    setActionLoading(true);
    setErrorMsg(null);

    const versionId = selectedItem.approved_version_id;
    if (!versionId) {
      setErrorMsg("يجب اعتماد النسخة أولاً قبل النشر.");
      setActionLoading(false);
      return;
    }

    const res = await publishResourceVersion(selectedItem.id, versionId, selectedItem.lock_version);
    if (!res.success) {
      setErrorMsg(`فشل نشر المورد: ${res.error?.message}`);
    } else {
      await fetchPendingReviews();
    }
    setActionLoading(false);
  };

  return (
    <AdminLayout>
      <div className="space-y-6" dir="rtl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">طابور مراجعة واعتماد محتوى HTML التفاعلي</h1>
            <p className="text-xs text-muted-foreground">
              مراجعة الخرائط الذهنية والتجارب التفاعلية قبل النشر الفعلي في قائمة الدروس.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={isBackendActive ? "default" : "secondary"}>
              {isBackendActive ? "Backend Operational Mode" : "Simulator UI Mode"}
            </Badge>
            <Button variant="outline" size="sm" onClick={fetchPendingReviews} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {errorMsg && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[30vh] items-center justify-center text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            جاري تحميل طابور المراجعة…
          </div>
        ) : items.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground text-sm">
            لا توجد عناصر تنتظر المراجعة حالياً.
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* List */}
            <Card className="lg:col-span-1">
              <CardHeader className="p-4">
                <CardTitle className="text-sm">العناصر قيد المراجعة ({items.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-2 space-y-2">
                {items.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`w-full text-right p-3 rounded-lg border text-xs transition-all ${
                      selectedItem?.id === item.id ? "border-primary bg-primary/10" : "border-border/50 hover:bg-muted/30"
                    }`}
                  >
                    <div className="font-semibold text-foreground truncate">{item.title_ar}</div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{item.resource_code}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {item.status} (v{item.lock_version})
                      </Badge>
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            {/* Item Detail & Actions */}
            {selectedItem && (
              <Card className="lg:col-span-2 space-y-4 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                  <div>
                    <h3 className="text-base font-bold text-foreground">{selectedItem.title_ar}</h3>
                    <p className="text-xs text-muted-foreground">{selectedItem.resource_code} — Lock v{selectedItem.lock_version}</p>
                  </div>
                  <Badge variant={selectedItem.status === "published" ? "default" : "secondary"}>
                    {selectedItem.status}
                  </Badge>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleReject}
                    disabled={actionLoading || selectedItem.status !== "in_review" || !isBackendActive}
                    className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  >
                    <XCircle className="ml-1.5 h-4 w-4" />
                    رفض النسخة
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleApprove}
                    disabled={actionLoading || selectedItem.status !== "in_review" || !isBackendActive}
                  >
                    <CheckCircle2 className="ml-1.5 h-4 w-4 text-emerald-400" />
                    اعتماد النسخة (Approve)
                  </Button>

                  <Button
                    variant="default"
                    size="sm"
                    onClick={handlePublish}
                    disabled={actionLoading || selectedItem.status !== "approved" || !CONTENT_FEATURE_FLAGS.ENABLE_HTML_CONTENT_PUBLISH}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  >
                    <ShieldCheck className="ml-1.5 h-4 w-4" />
                    نشر النسخة (Publish)
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
