import { useState, type ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Layers,
  HelpCircle,
  CreditCard,
  MessageSquare,
  Settings,
  ArrowRight,
  Menu,
  X,
  LogOut,
  ClipboardList,
  FileSpreadsheet,
  UserCog,
  Wallet,
  Landmark,
  Network,
} from "lucide-react";
import { TrendingDown, BarChart3 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { filterAdminSidebarLinks } from "@/lib/admin-route-access";
import { Button } from "@/components/ui/button";

type LinkItem = {
  href:
    | "/admin"
    | "/admin/students"
    | "/admin/users"
    | "/admin/academic"
    | "/admin/curriculum"
    | "/admin/subjects"
    | "/admin/units"
    | "/admin/lessons"
    | "/admin/questions"
    | "/admin/exam-templates"
    | "/admin/ministerial-exams"
    | "/admin/import"
    | "/admin/learning-insights/mistakes"
    | "/admin/learning-insights/performance"
    | "/admin/payment-methods"
    | "/admin/payment-requests"
    | "/admin/wallet-topups";
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
};

type DisabledItem = {
  label: string;
  icon: typeof LayoutDashboard;
};

const activeLinks: LinkItem[] = [
  { href: "/admin", label: "لوحة الإدارة", icon: LayoutDashboard, end: true },
  { href: "/admin/students", label: "الطلاب", icon: Users },
  { href: "/admin/users", label: "المستخدمون والصلاحيات", icon: UserCog },
  { href: "/admin/academic", label: "المحتوى الدراسي", icon: BookOpen },
  { href: "/admin/curriculum", label: "إدارة المناهج", icon: Network },
  { href: "/admin/subjects", label: "المواد", icon: BookOpen },
  { href: "/admin/units", label: "الوحدات", icon: Layers },
  { href: "/admin/lessons", label: "الدروس", icon: BookOpen },
  { href: "/admin/questions", label: "الأسئلة", icon: HelpCircle },
  { href: "/admin/exam-templates", label: "قوالب الاختبارات", icon: ClipboardList },
  { href: "/admin/ministerial-exams", label: "النماذج الوزارية", icon: ClipboardList },
  { href: "/admin/import", label: "الاستيراد", icon: FileSpreadsheet },
  { href: "/admin/learning-insights/mistakes", label: "تحليلات الأخطاء", icon: TrendingDown },
  { href: "/admin/learning-insights/performance", label: "تحليل الأداء الموحد", icon: BarChart3 },
  { href: "/admin/payment-methods", label: "طرق الدفع", icon: Landmark },
  { href: "/admin/payment-requests", label: "طلبات الدفع", icon: CreditCard },
  { href: "/admin/wallet-topups", label: "طلبات شحن المحفظة", icon: Wallet },
];

const upcomingLinks: DisabledItem[] = [
  { label: "رسائل التواصل", icon: MessageSquare },
  { label: "الإعدادات", icon: Settings },
];

interface AdminLayoutProps {
  children: ReactNode;
}

export function AdminLayout({ children }: AdminLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const visibleLinks = filterAdminSidebarLinks(activeLinks, isAdmin);
  const currentPath = useRouterState({
    select: (s) => s.location.pathname,
  });

  const isActive = (href: string, end?: boolean) =>
    end ? currentPath === href : currentPath === href || currentPath.startsWith(href + "/");

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen bg-background" dir="rtl">
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 right-0 z-50 w-64 border-l border-border bg-card transition-transform duration-300 md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-border px-4">
          <Link to="/app" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <BookOpen className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold text-foreground">لوحة الإدارة</span>
          </Link>
          <button
            className="md:hidden text-muted-foreground"
            onClick={() => setMobileOpen(false)}
            aria-label="إغلاق القائمة"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="p-3 space-y-1">
          {visibleLinks.map((link) => {
            const Icon = link.icon;
            const active = isActive(link.href, link.end);
            return (
              <Link
                key={link.href}
                to={link.href}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary hover:bg-primary/10"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}

          <div className="pt-3 mt-3 border-t border-border">
            <p className="px-3 pb-2 text-[11px] font-medium text-muted-foreground/70">
              قريبًا
            </p>
            {upcomingLinks.map((link) => {
              const Icon = link.icon;
              return (
                <div
                  key={link.label}
                  aria-disabled
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground/50 opacity-60 cursor-not-allowed select-none"
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{link.label}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">قريبًا</span>
                </div>
              );
            })}
          </div>
        </nav>

        <div className="absolute bottom-4 right-4 left-4 space-y-2">
          <Link to="/app">
            <Button variant="outline" size="sm" className="w-full gap-2">
              <ArrowRight className="h-4 w-4" />
              العودة للتطبيق
            </Button>
          </Link>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            className="w-full gap-2 text-destructive hover:text-destructive min-h-[44px]"
          >
            <LogOut className="h-4 w-4" />
            تسجيل الخروج
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/80 backdrop-blur-md px-4 md:px-6">
          <button
            className="md:hidden text-foreground"
            onClick={() => setMobileOpen(true)}
            aria-label="فتح القائمة"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h2 className="text-sm font-semibold text-foreground">إدارة منصة تمكين</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            aria-label="تسجيل الخروج"
            className="ms-auto gap-1.5 text-destructive hover:text-destructive min-h-[44px]"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">خروج</span>
          </Button>
        </header>

        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export default AdminLayout;
