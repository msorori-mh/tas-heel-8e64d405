import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CheckCircle2, Clock, XCircle } from "lucide-react";

export function HomeSubscriptionBanner() {
  const { user } = useAuth();

  const subQ = useQuery({
    enabled: !!user?.id,
    queryKey: ["home-sub-banner", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("status, expires_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const payQ = useQuery({
    enabled: !!user?.id,
    queryKey: ["home-pay-banner", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("payment_requests")
        .select("status")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  const sub = subQ.data;
  const pay = payQ.data;

  if (sub?.status === "active") {
    const days =
      sub.expires_at
        ? Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / 86_400_000)
        : null;
    if (days !== null && days >= 0) {
      return (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-green-500/20 bg-green-500/5 px-3 py-2 text-[11px]">
          <span className="flex items-center gap-1.5 text-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
            اشتراك نشط — متبقّي {days.toLocaleString("ar-EG")} يوم
          </span>
          <Link to="/subscription" className="text-primary hover:underline">التفاصيل</Link>
        </div>
      );
    }
  }

  if (sub?.status === "pending" || pay?.status === "pending") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-[11px]">
        <span className="flex items-center gap-1.5 text-foreground">
          <Clock className="h-3.5 w-3.5 text-amber-600" />
          طلب الاشتراك قيد المراجعة
        </span>
        <Link to="/payments" className="text-primary hover:underline">متابعة</Link>
      </div>
    );
  }

  if (sub?.status === "expired" || sub?.status === "cancelled") {
    return (
      <div className="flex items-center justify-between gap-2 rounded-xl border border-destructive/20 bg-destructive/5 px-3 py-2 text-[11px]">
        <span className="flex items-center gap-1.5 text-foreground">
          <XCircle className="h-3.5 w-3.5 text-destructive" />
          اشتراكك منتهٍ — فعّل للوصول الكامل
        </span>
        <Link to="/subscription" className="text-primary hover:underline">تجديد</Link>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-[11px]">
      <span className="text-muted-foreground">لا يوجد اشتراك نشط</span>
      <Link to="/subscription" className="text-primary hover:underline">اشترك الآن</Link>
    </div>
  );
}
