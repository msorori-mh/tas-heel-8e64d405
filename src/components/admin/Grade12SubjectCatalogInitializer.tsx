import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, RefreshCw, ShieldCheck, Sparkles, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

type CatalogItem = {
  code: string;
  name: string;
  sort_order: number;
  group_code: string | null;
  group_name: string | null;
  display_group: string;
  status: "MISSING" | "MATCHED" | "CONFLICT";
  active_target_links: number;
};

type CatalogStatus = {
  catalog_version: number;
  status: "READY" | "COMPLETE" | "CONFLICT";
  grade_name: string;
  tracks: Array<{ id: string; code: "aden" | "sanaa"; name: string }>;
  expected_subjects: number;
  expected_groups: number;
  expected_track_links: number;
  matched_subjects: number;
  missing_subjects: number;
  matched_track_links: number;
  missing_track_links: number;
  conflict_count: number;
  preview_sha256: string;
  items: CatalogItem[];
};

const GROUP_ORDER = [
  "القرآن الكريم وعلومه",
  "التربية الإسلامية",
  "اللغة العربية",
  "اللغة الإنجليزية",
  "الرياضيات",
  "الفيزياء",
  "الكيمياء",
  "الأحياء",
] as const;

async function loadStatus(): Promise<CatalogStatus> {
  const { data, error } = await (supabase as any).rpc(
    "admin_grade12_subject_catalog_status",
  );
  if (error) throw error;
  return data as CatalogStatus;
}

export function Grade12SubjectCatalogInitializer() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const statusQ = useQuery({
    enabled: isAdmin,
    queryKey: ["admin-grade12-subject-catalog-v1"],
    queryFn: loadStatus,
  });
  const status = statusQ.data;

  const groups = useMemo(() => {
    const byName = new Map<string, CatalogItem[]>();
    for (const item of status?.items ?? []) {
      const current = byName.get(item.display_group) ?? [];
      current.push(item);
      byName.set(item.display_group, current);
    }
    return GROUP_ORDER.map((name) => ({ name, items: byName.get(name) ?? [] }));
  }, [status]);

  if (!isAdmin) return null;

  const initialize = async () => {
    if (!status || status.status !== "READY" || submitting) return;
    setSubmitting(true);
    const { data, error } = await (supabase as any).rpc(
      "admin_initialize_grade12_subject_catalog",
      { _expected_preview_sha256: status.preview_sha256 },
    );
    setSubmitting(false);

    if (error) {
      const message = String(error.message ?? "");
      if (message.includes("GRADE12_CATALOG_STALE_PREVIEW")) {
        toast.error("تغيّرت البيانات بعد المعاينة. تم تحديث الحالة؛ راجعها ثم أعد المحاولة.");
        await statusQ.refetch();
      } else if (message.includes("GRADE12_CATALOG_CONFLICT")) {
        toast.error("يوجد تعارض في مادة أو كود قائم؛ لم يكتب النظام أي صف.");
        await statusQ.refetch();
      } else if (message.includes("FORBIDDEN_FULL_ADMIN_REQUIRED")) {
        toast.error("تهيئة الكتالوج متاحة لمدير كامل الصلاحيات فقط.");
      } else {
        toast.error(`تعذرت تهيئة المواد: ${message}`);
      }
      return;
    }

    const result = data as CatalogStatus & { created_subjects: number };
    toast.success(`تمت تهيئة ${result.created_subjects} مادة وربط الكتالوج بصنعاء وعدن.`);
    await statusQ.refetch();
    await queryClient.invalidateQueries({ queryKey: ["admin-subjects"] });
    await queryClient.invalidateQueries({ queryKey: ["admin-curriculum"] });
    await queryClient.invalidateQueries({ queryKey: ["subject-import-scope-options"] });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-primary/25 bg-primary/5 p-5" aria-labelledby="grade12-catalog-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 id="grade12-catalog-heading" className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="h-5 w-5 text-primary" />
            تهيئة مواد الصف الثالث الثانوي
          </h2>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            ينشئ النظام 14 مادة فعلية تحت 8 مجموعات رئيسية، ثم يربط كل مادة بمساري
            صنعاء وعدن. الأكواد آلية، وكتب الطالب والتمارين تضاف لاحقًا إلى المادة نفسها.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => statusQ.refetch()}
          disabled={statusQ.isFetching || submitting}
          className="gap-1.5"
        >
          {statusQ.isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          تحديث المعاينة
        </Button>
      </div>

      {statusQ.isLoading && (
        <div className="flex items-center justify-center gap-2 rounded-xl border bg-background p-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          جارٍ فحص الصف والمسارين والأكواد…
        </div>
      )}

      {statusQ.isError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          تعذر تحميل معاينة الكتالوج: {(statusQ.error as Error).message}
        </div>
      )}

      {status && (
        <>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border bg-background p-3">
              <p className="text-xs text-muted-foreground">المجموعات الرئيسية</p>
              <p className="mt-1 text-xl font-bold">{status.expected_groups}</p>
            </div>
            <div className="rounded-xl border bg-background p-3">
              <p className="text-xs text-muted-foreground">المواد الفعلية</p>
              <p className="mt-1 text-xl font-bold">{status.matched_subjects}/{status.expected_subjects}</p>
            </div>
            <div className="rounded-xl border bg-background p-3">
              <p className="text-xs text-muted-foreground">روابط صنعاء وعدن</p>
              <p className="mt-1 text-xl font-bold">{status.matched_track_links}/{status.expected_track_links}</p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {groups.map((group) => (
              <div key={group.name} className="rounded-xl border bg-background p-3">
                <p className="font-semibold">{group.name}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {group.items.length > 1
                    ? group.items.map((item) => item.name).join(" · ")
                    : "مادة واحدة؛ تعدد الكتب لا ينشئ مادة جديدة"}
                </p>
              </div>
            ))}
          </div>

          {status.status === "CONFLICT" && (
            <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              وُجد {status.conflict_count} تعارضًا في كود أو اسم قائم. التهيئة مقفلة ولم تُجرِ أي تعديل.
            </div>
          )}

          {status.status === "COMPLETE" && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              الكتالوج مكتمل: 14 مادة و28 رابط مسار. انتقل الآن إلى رفع كتب المواد ثم الوحدات والدروس.
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-primary/20 pt-4">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4" />
              العملية ذرية، محمية بصلاحية المدير الكامل، ومربوطة ببصمة المعاينة الحالية.
            </p>
            <Button
              type="button"
              onClick={initialize}
              disabled={status.status !== "READY" || submitting || statusQ.isFetching}
              className="gap-1.5"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {submitting ? "جارٍ إنشاء المواد…" : status.status === "COMPLETE" ? "تمت التهيئة" : "تهيئة المواد وربط المسارين"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

export default Grade12SubjectCatalogInitializer;
