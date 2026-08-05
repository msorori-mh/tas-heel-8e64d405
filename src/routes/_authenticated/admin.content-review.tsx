import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useRequireAdminSection } from "@/lib/admin-route-access";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CheckCircle2, XCircle, Eye, ShieldCheck, Play, Sparkles, Filter, Lock } from "lucide-react";
import { InteractiveResourceViewer, InteractiveResourceItem } from "@/components/lessons/InteractiveResourceViewer";

export const Route = createFileRoute("/_authenticated/admin/content-review")({
  component: AdminContentReviewPage,
});

interface ReviewItem extends InteractiveResourceItem {
  status: "draft" | "in_review" | "approved" | "published" | "rejected" | "archived";
  grade_name: string;
  subject_name: string;
  lesson_title: string;
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
    alt_text_ar: "خريطة توضح أجزاء الخلية النباتية للجدار والبلاستيدات",
    version: 1,
    entry_file: "index.html",
    html_content: `
      <!DOCTYPE html>
      <html dir="rtl">
      <head><title>الخلية النباتية</title><style>body{font-family:sans-serif;background:#0f172a;color:#fff;text-align:center;padding:20px;}.box{border:2px solid #38bdf8;padding:15px;margin:10px auto;max-width:250px;border-radius:10px;background:#1e293b;}</style></head>
      <body>
        <div class="box">الخلية النباتية</div>
        <div class="box">الجدار الخلوي</div>
        <div class="box">البلاستيدات الخضراء</div>
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
  {
    id: "rev-02",
    resource_code: "EXP-G12-PHY-L004",
    resource_type: "practical_experiment_html",
    title_ar: "تجربة قانون أوم للكهرباء",
    description_ar: "محاكاة تفاعلية لحساب المقاومة وفرق الجهد",
    version: 1,
    entry_file: "index.html",
    html_content: `
      <!DOCTYPE html>
      <html dir="rtl">
      <head><title>قانون أوم</title><style>body{font-family:sans-serif;background:#022c22;color:#fff;text-align:center;padding:20px;}.exp{border:2px solid #34d399;padding:15px;margin:10px auto;max-width:300px;border-radius:10px;background:#064e3b;}</style></head>
      <body>
        <div class="exp">تجربة قانون أوم — Ohm's Law</div>
        <p>V = I × R</p>
      </body>
      </html>
    `,
    offline_enabled: true,
    status: "in_review",
    grade_name: "الصف الثاني عشر",
    subject_name: "الفيزياء",
    lesson_title: "الدوائر الكهربائية وقانون أوم",
    security_findings_count: 0,
  },
];

function AdminContentReviewPage() {
  const { loading, enabled } = useRequireAdminSection("content");
  const [items, setItems] = useState<ReviewItem[]>(DEMO_REVIEW_ITEMS);
  const [selectedId, setSelectedId] = useState<string>("rev-01");
  const [statusFilter, setStatusFilter] = useState<string>("all");

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

  const selectedItem = items.find((i) => i.id === selectedId) || items[0];

  const handleUpdateStatus = (id: string, newStatus: ReviewItem["status"]) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, status: newStatus } : item))
    );
  };

  const filteredItems = items.filter(
    (i) => statusFilter === "all" || i.status === statusFilter
  );

  return (
    <AdminLayout>
      <div className="mx-auto max-w-6xl space-y-6" dir="rtl">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-emerald-400 shrink-0" />
            <h1 className="text-2xl font-bold text-foreground">مركز مراجعة ونشر المحتوى التفاعلي</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            معاينة واختبار الخرائط الذهنية والتجارب العملية داخل بيئة العزل (Sandbox) وتدقيق الشروط الأمنية قبل النشر للطالب.
          </p>
        </header>

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
              </select>
            </div>

            <div className="space-y-2">
              {filteredItems.map((item) => (
                <Card
                  key={item.id}
                  className={`cursor-pointer transition-all border ${
                    selectedId === item.id
                      ? "border-emerald-500 bg-emerald-950/20"
                      : "border-border/40 hover:border-emerald-500/40"
                  }`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <Badge variant="outline" className="text-[10px]">
                        {item.resource_type === "mind_map_html" ? "خريطة ذهنية" : "تجربة عملية"}
                      </Badge>
                      <Badge
                        variant={
                          item.status === "published"
                            ? "default"
                            : item.status === "in_review"
                            ? "secondary"
                            : item.status === "rejected"
                            ? "destructive"
                            : "outline"
                        }
                        className="text-[10px]"
                      >
                        {item.status === "published"
                          ? "منشور للطالب"
                          : item.status === "in_review"
                          ? "قيد المراجعة"
                          : item.status === "rejected"
                          ? "مرفوض"
                          : item.status}
                      </Badge>
                    </div>

                    <h3 className="font-semibold text-xs leading-snug text-foreground">{item.title_ar}</h3>
                    <p className="text-[11px] text-muted-foreground">
                      {item.subject_name} — {item.lesson_title}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Main Review Area */}
          <div className="space-y-4 lg:col-span-2">
            {selectedItem && (
              <Card className="border-border/60">
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-base font-bold">{selectedItem.title_ar}</CardTitle>
                      <CardDescription className="text-xs">
                        الكود: {selectedItem.resource_code} | الإصدار: v{selectedItem.version}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedItem.status !== "published" && (
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1"
                          onClick={() => handleUpdateStatus(selectedItem.id, "published")}
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          اعتماد ونشر للطالب
                        </Button>
                      )}

                      {selectedItem.status === "published" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-amber-500 border-amber-500/40 gap-1"
                          onClick={() => handleUpdateStatus(selectedItem.id, "in_review")}
                        >
                          إلغاء النشر
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1"
                        onClick={() => handleUpdateStatus(selectedItem.id, "rejected")}
                      >
                        <XCircle className="h-4 w-4" />
                        رفض مع ذكر السبب
                      </Button>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Security Status Box */}
                  <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-300">
                      <ShieldCheck className="h-4 w-4 text-emerald-400" />
                      <span>تقرير الفحص الأمني التلقائي: لم يتم كشف أية انتهاكات أمنية (0 findings).</span>
                    </div>
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[10px]">
                      CSP Approved
                    </Badge>
                  </div>

                  {/* Sandboxed Viewer Component */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5 text-primary" />
                      المعاينة الحية داخل بيئة العزل (Student View Simulator)
                    </h4>
                    <InteractiveResourceViewer resource={selectedItem} />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </AdminLayout>
  );
}
