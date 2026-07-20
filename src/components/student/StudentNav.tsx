import { Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, LogOut, Shield, Settings } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function StudentNav() {
  const { signOut, isAdmin, isContentStaff } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 border-b border-primary/10 bg-card/95 backdrop-blur-md shadow-elevated">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-2 px-2 sm:px-4">
        <Link
          to="/app"
          aria-label="تنوير — الصفحة الرئيسية"
          className="flex shrink-0 items-center gap-2 font-bold text-foreground focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-hero-gradient">
            <BookOpen className="h-4 w-4 text-primary-foreground" />
          </span>
          <span className="hidden min-[360px]:inline">تنوير</span>
        </Link>
        <nav
          aria-label="التنقل الرئيسي"
          className="flex min-w-0 items-center gap-1 text-sm sm:gap-3"
        >
          <Link
            to="/app"
            className="rounded-md px-1.5 py-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2"
            activeProps={{ className: "text-primary font-semibold" }}
          >
            الرئيسية
          </Link>
          {isContentStaff && (
            <Link
              to={isAdmin ? "/admin" : "/admin/academic"}
              aria-label="الإدارة"
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2"
              activeProps={{ className: "text-primary font-semibold" }}
            >
              <Shield className="h-4 w-4" aria-hidden />
              <span className="hidden sm:inline">الإدارة</span>
            </Link>
          )}
          <Link
            to="/settings"
            aria-label="الإعدادات"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2"
            activeProps={{ className: "text-primary font-semibold" }}
          >
            <Settings className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">الإعدادات</span>
          </Link>
          <button
            type="button"
            aria-label="تسجيل الخروج"
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth", search: { mode: "login" }, replace: true });
            }}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-2"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </nav>
      </div>
    </header>
  );
}

export function StateMessage({
  variant = "info",
  children,
}: {
  variant?: "info" | "error" | "loading";
  children: React.ReactNode;
}) {
  const cls =
    variant === "error"
      ? "border-destructive/30 bg-destructive/10 text-destructive"
      : variant === "loading"
        ? "border-border bg-muted text-muted-foreground"
        : "border-border bg-card text-muted-foreground";
  return <div className={`rounded-xl border ${cls} px-4 py-6 text-center text-sm`}>{children}</div>;
}
