import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  GraduationCap,
  MapPin,
  School,
  CheckCircle2,
  Clock,
  XCircle,
  CalendarDays,
  History,
  Settings,
  Gift,
} from "lucide-react";
import {
  FREE_ACCESS_BADGE,
  FREE_ACCESS_SHORT,
  STUDENT_FREE_ACCESS,
} from "@/lib/student-free-access";

type SubRow = {
  id: string;
  status: "pending" | "active" | "expired" | "cancelled" | "refunded";
  starts_at: string | null;
  expires_at: string | null;
  plan: { name: string | null } | null;
};

type PayReq = {
  id: string;
  status: "pending" | "approved" | "rejected" | "refunded" | "reversed";
  created_at: string;
};

function daysBetween(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.ceil(ms / 86_400_000);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "—";
  }
}

export function StudentProfileCard() {
  const { profile, user } = useAuth();
  const gradeKey = profile?.grade_uuid ?? (profile?.grade_id ? String(profile.grade_id) : null);

  const gradeQ = useQuery({
    enabled: !!gradeKey,
    queryKey: ["pcard-grade", gradeKey],
    queryFn: async () => {
      const { data } = await supabase
        .from("grades")
        .select("name")
        .eq("id", gradeKey!)
        .maybeSingle();
      return data as { name: string } | null;
    },
  });

  const trackQ = useQuery({
    enabled: !!profile?.curriculum_track_id,
    queryKey: ["pcard-track", profile?.curriculum_track_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("curriculum_tracks")
        .select("track_name")
        .eq("id", profile!.curriculum_track_id!)
        .maybeSingle();
      return data as { track_name: string } | null;
    },
  });

  const govQ = useQuery({
    enabled: !!profile?.governorate_id,
    queryKey: ["pcard-gov", profile?.governorate_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("governorates")
        .select("name")
        .eq("id", profile!.governorate_id!)
        .maybeSingle();
      return data as { name: string } | null;
    },
  });

  const subQ = useQuery({
    enabled: !!user?.id && !STUDENT_FREE_ACCESS,
    queryKey: ["pcard-sub", user?.id],
    queryFn: async (): Promise<SubRow | null> => {
      const { data } = await supabase
        .from("subscriptions")
        .select(
          "id,status,starts_at,expires_at,plan:subscription_plans!subscriptions_plan_id_fkey(name)",
        )
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as unknown as SubRow) ?? null;
    },
  });

  const payQ = useQuery({
    enabled: !!user?.id && !STUDENT_FREE_ACCESS,
    queryKey: ["pcard-lastpay", user?.id],
    queryFn: async (): Promise<PayReq | null> => {
      const { data } = await supabase
        .from("payment_requests")
        .select("id,status,created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as unknown as PayReq) ?? null;
    },
  });

  const govName = govQ.data?.name ?? profile?.governorate ?? null;
  const trackName = trackQ.data?.track_name ?? null;
  const gradeName = gradeQ.data?.name ?? null;

  const sub = subQ.data;
  const lastPay = payQ.data;
  const daysLeft = useMemo(() => daysBetween(sub?.expires_at ?? null), [sub?.expires_at]);

  // Resolve display state
  const subState: "active" | "expired" | "pending" | "none" =
    sub?.status === "active" && (daysLeft === null || daysLeft > 0)
      ? "active"
      : sub?.status === "pending" || lastPay?.status === "pending"
        ? "pending"
        : sub?.status === "expired" || sub?.status === "cancelled" || sub?.status === "refunded"
          ? "expired"
          : "none";

  const initial = (profile?.full_name ?? "ط").trim().charAt(0);

  return (
    <section
      className="rounded-2xl border border-border bg-gradient-to-br from-primary/8 via-card to-card p-4 shadow-card"
      aria-label="بطاقة الملف الشخصي"
    >
      {/* Header: avatar + name + motivation */}
      <div className="flex items-start gap-3">
        {profile?.avatar_url ? (
          <img
            src={profile.avatar_url}
            alt=""
            className="h-12 w-12 shrink-0 rounded-full border border-border object-cover"
          />
        ) : (
          <span
            aria-hidden
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-base font-bold text-primary"
          >
            {initial}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-bold text-foreground">
            مرحبًا {profile?.full_name ?? "بك"}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">جاهز تكمّل مذاكرتك اليوم؟</p>
        </div>
      </div>

      {/* Identity chips */}
      <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
        {gradeName && <Chip icon={<GraduationCap className="h-3 w-3" />}>{gradeName}</Chip>}
        {govName && <Chip icon={<MapPin className="h-3 w-3" />}>{govName}</Chip>}
        {profile?.school_name && (
          <Chip icon={<School className="h-3 w-3" />}>{profile.school_name}</Chip>
        )}
      </div>

      {/* Access / subscription block */}
      <div className="mt-4 rounded-xl border border-border bg-background/60 p-3">
        {STUDENT_FREE_ACCESS ? (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Gift className="h-4 w-4 text-emerald-600" aria-hidden />
              <span className="text-sm font-semibold text-foreground">{FREE_ACCESS_BADGE}</span>
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">{FREE_ACCESS_SHORT}</p>
          </div>
        ) : (
          <SubscriptionBlock
            state={subState}
            sub={sub ?? null}
            daysLeft={daysLeft}
            lastPay={lastPay ?? null}
          />
        )}
      </div>

      {/* Shortcuts */}
      <nav className="mt-4 grid grid-cols-2 gap-2" aria-label="اختصارات">
        <Shortcut
          to="/exams/history"
          icon={<History className="h-4 w-4" />}
          label="سجل الاختبارات"
        />
        <Shortcut to="/settings" icon={<Settings className="h-4 w-4" />} label="الإعدادات" />
      </nav>
    </section>
  );
}

function SubscriptionBlock({
  state,
  sub,
  daysLeft,
  lastPay,
}: {
  state: "active" | "expired" | "pending" | "none";
  sub: SubRow | null;
  daysLeft: number | null;
  lastPay: PayReq | null;
}) {
  if (state === "active" && sub) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <span className="text-sm font-semibold text-foreground">اشتراك نشط</span>
          {sub.plan?.name && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {sub.plan.name}
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[11px] text-muted-foreground">
          <Detail icon={<CalendarDays className="h-3 w-3" />} label="البداية">
            {fmtDate(sub.starts_at)}
          </Detail>
          <Detail icon={<CalendarDays className="h-3 w-3" />} label="الانتهاء">
            {fmtDate(sub.expires_at)}
          </Detail>
        </div>
        {daysLeft !== null && daysLeft >= 0 && (
          <p className="text-[11px] text-muted-foreground">
            متبقّي{" "}
            <span className="font-semibold text-foreground">
              {daysLeft.toLocaleString("ar-EG")}
            </span>{" "}
            يوم
          </p>
        )}
        <Link
          to="/subscription"
          className="inline-flex items-center justify-center rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          تفاصيل الاشتراك
        </Link>
      </div>
    );
  }

  if (state === "pending") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-semibold text-foreground">طلبك قيد المراجعة</span>
        </div>
        <p className="text-[11px] text-muted-foreground">سنُفعّل اشتراكك فور اعتماد إيصال الدفع.</p>
        <Link
          to="/payments"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          متابعة الطلب
        </Link>
      </div>
    );
  }

  if (state === "expired") {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm font-semibold text-foreground">اشتراكك منتهٍ</span>
        </div>
        {lastPay?.status === "rejected" && (
          <p className="text-[11px] text-destructive">تم رفض آخر طلب دفع. يمكنك إرسال طلب جديد.</p>
        )}
        <Link
          to="/subscription"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
        >
          تجديد الاشتراك
        </Link>
      </div>
    );
  }

  // none
  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">لا يوجد اشتراك نشط حاليًا</p>
      <p className="text-[11px] text-muted-foreground">
        فعّل اشتراكك للوصول الكامل لمحتوى المنهج والاختبارات.
      </p>
      <Link
        to="/subscription"
        className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
      >
        اشترك الآن
      </Link>
    </div>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-foreground">
      <span className="text-primary">{icon}</span>
      <span className="truncate max-w-[140px]">{children}</span>
    </span>
  );
}

function Detail({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-primary">{icon}</span>
      <span>
        {label}: <span className="font-medium text-foreground">{children}</span>
      </span>
    </div>
  );
}

function Shortcut({
  to,
  icon,
  label,
}: {
  to: "/exams/history" | "/settings";
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
