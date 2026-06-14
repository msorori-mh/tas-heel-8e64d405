import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Trash2,
  ShieldAlert,
  Loader2,
  User as UserIcon,
  CreditCard,
  BookOpen,
  Wallet as WalletIcon,
  LifeBuoy,
  Lock,
  Info,
  LogOut,
  GraduationCap,
  Compass,
  MapPin,
  School,
  CheckCircle2,
  Clock,
  XCircle,
  CalendarDays,
  Receipt,
  History,
  Mail,
  FileText,
  HelpCircle,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { deleteMyAccount } from "@/lib/account.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  component: SettingsPage,
});

const APP_VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "1.0.0";

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

function daysBetween(iso: string | null): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  return Math.ceil(ms / 86_400_000);
}

function SettingsPage() {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const callDelete = useServerFn(deleteMyAccount);

  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const canSubmit =
    !submitting && password.length > 0 && confirmText === "DELETE";

  const gradeKey = profile?.grade_uuid ?? (profile?.grade_id ? String(profile.grade_id) : null);

  // Reuse the same query keys as StudentProfileCard so cache is shared.
  const gradeQ = useQuery({
    enabled: !!gradeKey,
    queryKey: ["pcard-grade", gradeKey],
    queryFn: async () => {
      const { data } = await supabase
        .from("grades").select("name").eq("id", gradeKey!).maybeSingle();
      return data as { name: string } | null;
    },
  });

  const trackQ = useQuery({
    enabled: !!profile?.curriculum_track_id,
    queryKey: ["pcard-track", profile?.curriculum_track_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("curriculum_tracks").select("track_name")
        .eq("id", profile!.curriculum_track_id!).maybeSingle();
      return data as { track_name: string } | null;
    },
  });

  const govQ = useQuery({
    enabled: !!profile?.governorate_id,
    queryKey: ["pcard-gov", profile?.governorate_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("governorates").select("name")
        .eq("id", profile!.governorate_id!).maybeSingle();
      return data as { name: string } | null;
    },
  });

  const subQ = useQuery({
    enabled: !!user?.id,
    queryKey: ["pcard-sub", user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscriptions")
        .select("id,status,starts_at,expires_at,plan:subscription_plans!subscriptions_plan_id_fkey(name)")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as {
        id: string;
        status: "pending" | "active" | "expired" | "cancelled" | "refunded";
        starts_at: string | null;
        expires_at: string | null;
        plan: { name: string | null } | null;
      } | null;
    },
  });

  const paymentsQ = useQuery({
    enabled: !!user?.id,
    queryKey: ["settings-payments-summary", user?.id],
    queryFn: async () => {
      const { data, count } = await supabase
        .from("payment_requests")
        .select("id,status,created_at", { count: "exact" })
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(1);
      return {
        last: (data?.[0] ?? null) as
          | { id: string; status: string; created_at: string }
          | null,
        total: count ?? 0,
      };
    },
  });

  const studyQ = useQuery({
    queryKey: ["settings-study-counts"],
    queryFn: async () => {
      const [subjects, units, lessons] = await Promise.all([
        supabase.from("subjects").select("id", { count: "exact", head: true }),
        supabase.from("units").select("id", { count: "exact", head: true }),
        supabase.from("lessons").select("id", { count: "exact", head: true }),
      ]);
      return {
        subjects: subjects.count ?? 0,
        units: units.count ?? 0,
        lessons: lessons.count ?? 0,
      };
    },
  });

  const sub = subQ.data;
  const daysLeft = useMemo(() => daysBetween(sub?.expires_at ?? null), [sub?.expires_at]);
  const subState: "active" | "expired" | "pending" | "none" =
    sub?.status === "active" && (daysLeft === null || daysLeft > 0)
      ? "active"
      : sub?.status === "pending"
      ? "pending"
      : sub?.status === "expired" || sub?.status === "cancelled" || sub?.status === "refunded"
      ? "expired"
      : "none";

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await callDelete({ data: { password, confirmation: "DELETE" } });
      toast.success("تم حذف حسابك بنجاح.");
      await queryClient.cancelQueries();
      queryClient.clear();
      await supabase.auth.signOut();
      navigate({ to: "/auth", search: { mode: "login" }, replace: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "تعذر إكمال العملية.";
      toast.error(msg);
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      queryClient.clear();
      navigate({ to: "/auth", search: { mode: "login" }, replace: true });
    } catch {
      setSigningOut(false);
      toast.error("تعذر تسجيل الخروج.");
    }
  }

  const govName = govQ.data?.name ?? profile?.governorate ?? null;
  const trackName = trackQ.data?.track_name ?? null;
  const gradeName = gradeQ.data?.name ?? null;
  const initial = (profile?.full_name ?? "ط").trim().charAt(0);
  const lastPay = paymentsQ.data?.last ?? null;
  const totalPays = paymentsQ.data?.total ?? 0;

  return (
    <div className="space-y-4" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold text-foreground">الإعدادات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          إدارة حسابك ومعلوماتك في منصة تنوير.
        </p>
      </header>

      <Accordion type="multiple" defaultValue={["profile"]} className="space-y-3">
        {/* الملف الشخصي */}
        <SectionItem value="profile" icon={<UserIcon className="h-4 w-4" />} title="الملف الشخصي">
          <div className="flex items-start gap-3">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="h-14 w-14 shrink-0 rounded-full border border-border object-cover"
              />
            ) : (
              <span
                aria-hidden
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/15 text-lg font-bold text-primary"
              >
                {initial}
              </span>
            )}
            <div className="min-w-0 flex-1 space-y-2">
              {profile?.full_name && (
                <p className="text-sm font-semibold text-foreground">{profile.full_name}</p>
              )}
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {gradeName && <Chip icon={<GraduationCap className="h-3 w-3" />}>{gradeName}</Chip>}
                {trackName && <Chip icon={<Compass className="h-3 w-3" />}>{trackName}</Chip>}
                {govName && <Chip icon={<MapPin className="h-3 w-3" />}>{govName}</Chip>}
                {profile?.school_name && (
                  <Chip icon={<School className="h-3 w-3" />}>{profile.school_name}</Chip>
                )}
              </div>
            </div>
          </div>
        </SectionItem>

        {/* الاشتراك */}
        <SectionItem value="sub" icon={<CreditCard className="h-4 w-4" />} title="الاشتراك">
          <div className="space-y-3">
            {subState === "active" && sub ? (
              <>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="text-sm font-semibold text-foreground">اشتراك نشط</span>
                  {sub.plan?.name && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                      {sub.plan.name}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
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
              </>
            ) : subState === "pending" ? (
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-600" />
                <span className="text-sm font-semibold text-foreground">طلبك قيد المراجعة</span>
              </div>
            ) : subState === "expired" ? (
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-destructive" />
                <span className="text-sm font-semibold text-foreground">اشتراكك منتهٍ</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">لا يوجد اشتراك نشط حاليًا.</p>
            )}
            <Link
              to="/subscription"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              إدارة الاشتراك
            </Link>
          </div>
        </SectionItem>

        {/* الدراسة والتعلم */}
        <SectionItem value="study" icon={<BookOpen className="h-4 w-4" />} title="الدراسة والتعلم">
          <div className="grid grid-cols-3 gap-2">
            <StatCard label="المواد" value={studyQ.data?.subjects ?? 0} />
            <StatCard label="الوحدات" value={studyQ.data?.units ?? 0} />
            <StatCard label="الدروس" value={studyQ.data?.lessons ?? 0} />
          </div>
        </SectionItem>

        {/* المدفوعات والمحفظة */}
        <SectionItem value="pay" icon={<WalletIcon className="h-4 w-4" />} title="المدفوعات والمحفظة">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-border bg-background p-2">
                <p className="text-muted-foreground">عدد الطلبات</p>
                <p className="mt-0.5 font-semibold text-foreground">
                  {totalPays.toLocaleString("ar-EG")}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-background p-2">
                <p className="text-muted-foreground">آخر حالة</p>
                <p className="mt-0.5 font-semibold text-foreground">
                  {lastPay ? translateStatus(lastPay.status) : "—"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <QuickLink to="/payments/new" icon={<Receipt className="h-4 w-4" />} label="طلب جديد" />
              <QuickLink to="/payments" icon={<History className="h-4 w-4" />} label="سجل الطلبات" />
              <QuickLink to="/wallet" icon={<WalletIcon className="h-4 w-4" />} label="المحفظة" />
            </div>
          </div>
        </SectionItem>

        {/* الدعم والمساعدة */}
        <SectionItem value="help" icon={<LifeBuoy className="h-4 w-4" />} title="الدعم والمساعدة">
          <div className="grid grid-cols-2 gap-2">
            <SupportLink to="/contact" icon={<Mail className="h-4 w-4" />} label="تواصل معنا" />
            <SupportLink to="/contact" icon={<HelpCircle className="h-4 w-4" />} label="الأسئلة الشائعة" />
            <SupportLink to="/privacy" icon={<ShieldAlert className="h-4 w-4" />} label="سياسة الخصوصية" />
            <SupportLink to="/terms" icon={<FileText className="h-4 w-4" />} label="الشروط والأحكام" />
          </div>
        </SectionItem>

        {/* الأمان والحساب */}
        <SectionItem value="security" icon={<Lock className="h-4 w-4" />} title="الأمان والحساب">
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3 text-sm">
              <span className="text-muted-foreground">البريد الإلكتروني</span>
              <span className="font-medium text-foreground" dir="ltr">{user?.email ?? "—"}</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              تسجيل الخروج
            </Button>

            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-destructive">
                    منطقة الخطر — حذف الحساب
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    حذف حسابك إجراء نهائي. سيتم حذف جميع بياناتك بشكل لا يمكن استرجاعه.
                  </p>

                  {!open ? (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 gap-2 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setOpen(true)}
                    >
                      <Trash2 className="h-4 w-4" />
                      حذف حسابي
                    </Button>
                  ) : (
                    <form onSubmit={handleDelete} className="mt-4 space-y-3">
                      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                        <p className="text-xs leading-relaxed text-destructive">
                          هذا الإجراء لا يمكن التراجع عنه. أكّد كلمة المرور واكتب{" "}
                          <span className="font-mono font-bold">DELETE</span> للمتابعة.
                        </p>
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="pw" className="text-xs">كلمة المرور الحالية</Label>
                        <Input
                          id="pw"
                          type="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          disabled={submitting}
                          required
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label htmlFor="confirm" className="text-xs">
                          اكتب <span className="font-mono">DELETE</span> للتأكيد
                        </Label>
                        <Input
                          id="confirm"
                          type="text"
                          inputMode="text"
                          autoComplete="off"
                          value={confirmText}
                          onChange={(e) => setConfirmText(e.target.value)}
                          disabled={submitting}
                          dir="ltr"
                          required
                        />
                      </div>

                      <div className="flex flex-wrap gap-2 pt-1">
                        <Button
                          type="submit"
                          variant="destructive"
                          size="sm"
                          disabled={!canSubmit}
                          className="gap-2"
                        >
                          {submitting ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              جارٍ الحذف…
                            </>
                          ) : (
                            <>
                              <Trash2 className="h-4 w-4" />
                              تأكيد حذف الحساب
                            </>
                          )}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setOpen(false);
                            setPassword("");
                            setConfirmText("");
                          }}
                          disabled={submitting}
                        >
                          إلغاء
                        </Button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
        </SectionItem>

        {/* معلومات التطبيق */}
        <SectionItem value="about" icon={<Info className="h-4 w-4" />} title="معلومات التطبيق">
          <div className="space-y-1 text-sm">
            <p className="font-semibold text-foreground">تنوير</p>
            <p className="text-xs text-muted-foreground">
              منصة تعليمية لطلاب المرحلة الثانوية.
            </p>
            <p className="text-xs text-muted-foreground">
              الإصدار: <span className="font-medium text-foreground" dir="ltr">{APP_VERSION}</span>
            </p>
          </div>
        </SectionItem>
      </Accordion>
    </div>
  );
}

function translateStatus(s: string): string {
  switch (s) {
    case "pending": return "قيد المراجعة";
    case "approved": return "مقبول";
    case "rejected": return "مرفوض";
    case "refunded": return "مُسترد";
    case "reversed": return "ملغى";
    default: return s;
  }
}

function SectionItem({
  value, icon, title, children,
}: { value: string; icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <AccordionItem
      value={value}
      className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden"
    >
      <AccordionTrigger className="px-4 py-3 hover:no-underline">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            {icon}
          </span>
          <span className="text-sm font-semibold text-foreground">{title}</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4 pt-1">{children}</AccordionContent>
    </AccordionItem>
  );
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 text-foreground">
      <span className="text-primary">{icon}</span>
      <span className="truncate max-w-[160px]">{children}</span>
    </span>
  );
}

function Detail({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-primary">{icon}</span>
      <span>{label}: <span className="font-medium text-foreground">{children}</span></span>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-2 text-center">
      <p className="text-lg font-bold text-foreground">{value.toLocaleString("ar-EG")}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}

function QuickLink({
  to, icon, label,
}: { to: "/payments/new" | "/payments" | "/wallet"; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
    >
      <span className="text-primary">{icon}</span>
      {label}
    </Link>
  );
}

function SupportLink({
  to, icon, label,
}: { to: "/contact" | "/privacy" | "/terms"; icon: React.ReactNode; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-muted"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </Link>
  );
}
