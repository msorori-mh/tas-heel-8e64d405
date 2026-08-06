import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  BookOpen,
  Bot,
  ClipboardList,
  GraduationCap,
  Home,
  LogOut,
  Settings,
  Shield,
  User,
  type LucideIcon,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

type NavItem = {
  label: string;
  to: string;
  icon: LucideIcon;
  match: (pathname: string) => boolean;
};

const PRIMARY_NAV: NavItem[] = [
  { label: "الرئيسية", to: "/app", icon: Home, match: (p) => p === "/app" },
  {
    label: "موادي",
    to: "/semesters",
    icon: BookOpen,
    match: (p) =>
      p.startsWith("/semesters") || p.startsWith("/subjects") || p.startsWith("/lessons"),
  },
  {
    label: "الاختبارات",
    to: "/exams/history",
    icon: ClipboardList,
    match: (p) => p.startsWith("/exams") || p.startsWith("/units"),
  },
  { label: "التقدم", to: "/progress", icon: BarChart3, match: (p) => p.startsWith("/progress") },
];

const MOBILE_NAV: NavItem[] = [
  ...PRIMARY_NAV,
  { label: "حسابي", to: "/settings", icon: User, match: (p) => p.startsWith("/settings") },
];

/**
 * Unified student app shell: RTL sidebar on desktop, compact top bar plus
 * bottom navigation on mobile. Presentation only.
 */
export function StudentShell({ children }: { children: React.ReactNode }) {
  const { signOut, isAdmin, isContentStaff } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/auth", search: { mode: "login" }, replace: true });
  };

  return (
    <div className="student-app-bg min-h-screen text-foreground" dir="rtl">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 right-0 z-40 hidden w-60 flex-col border-l border-border/60 bg-card/80 backdrop-blur-md lg:flex">
        <Link
          to="/app"
          className="flex items-center gap-2 px-4 py-5 font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-hero-gradient">
            <GraduationCap className="h-5 w-5 text-primary-foreground" />
          </span>
          <span className="text-base">تنوير</span>
        </Link>

        <nav aria-label="التنقل الرئيسي" className="flex-1 space-y-1 px-3">
          {PRIMARY_NAV.map((item) => (
            <SidebarLink key={item.to} item={item} active={item.match(pathname)} />
          ))}
          <SidebarLink
            item={{
              label: "المساعد الذكي",
              to: "/app",
              icon: Bot,
              match: () => false,
            }}
            active={false}
            hash="ai-assistant"
          />
        </nav>

        <div className="space-y-1 border-t border-border/60 p-3">
          {isContentStaff && (
            <SidebarLink
              item={{
                label: "الإدارة",
                to: isAdmin ? "/admin" : "/admin/academic",
                icon: Shield,
                match: (p) => p.startsWith("/admin"),
              }}
              active={pathname.startsWith("/admin")}
            />
          )}
          <SidebarLink
            item={{
              label: "الحساب والإعدادات",
              to: "/settings",
              icon: Settings,
              match: (p) => p.startsWith("/settings"),
            }}
            active={pathname.startsWith("/settings")}
          />
          <button
            type="button"
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <LogOut className="h-4 w-4 shrink-0" aria-hidden />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-card/90 backdrop-blur-md lg:hidden">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5">
          <Link
            to="/app"
            className="flex min-w-0 items-center gap-2 font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-hero-gradient">
              <GraduationCap className="h-4 w-4 text-primary-foreground" />
            </span>
            <span className="truncate text-sm">تنوير</span>
          </Link>
          <div className="flex shrink-0 items-center gap-1">
            {isContentStaff && (
              <Link
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                to={(isAdmin ? "/admin" : "/admin/academic") as any}
                aria-label="الإدارة"
                className="rounded-lg p-2 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Shield className="h-4 w-4" aria-hidden />
              </Link>
            )}
            <button
              type="button"
              aria-label="تسجيل الخروج"
              onClick={handleSignOut}
              className="rounded-lg p-2 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <LogOut className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-4 sm:px-6 lg:mr-60 lg:max-w-none lg:px-8 lg:pb-10 lg:pt-6">
        <div className="mx-auto w-full max-w-4xl">{children}</div>
      </main>

      {/* Mobile bottom navigation */}
      <nav
        aria-label="التنقل السفلي"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden"
      >
        <ul className="grid grid-cols-5">
          {MOBILE_NAV.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <li key={item.to}>
                <Link
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  to={item.to as any}
                  aria-current={active ? "page" : undefined}
                  className={`flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function SidebarLink({
  item,
  active,
  hash,
}: {
  item: NavItem;
  active: boolean;
  hash?: string;
}) {
  const Icon = item.icon;
  return (
    <Link
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      to={item.to as any}
      hash={hash}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? "bg-primary/10 font-semibold text-primary"
          : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      {item.label}
    </Link>
  );
}
