import { Link, useNavigate } from "@tanstack/react-router";
import { BookOpen, LogOut, Shield, Wallet } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

export function StudentNav() {
  const { signOut, isAdmin } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link to="/app" className="flex items-center gap-2 font-bold text-foreground">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-hero-gradient">
            <BookOpen className="h-4 w-4 text-primary-foreground" />
          </span>
          تنوير
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link
            to="/app"
            className="text-muted-foreground hover:text-foreground"
            activeProps={{ className: "text-primary font-semibold" }}
          >
            الرئيسية
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              activeProps={{ className: "text-primary font-semibold" }}
            >
              <Shield className="h-4 w-4" />
              الإدارة
            </Link>
          )}
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate({ to: "/auth", search: { mode: "login" }, replace: true });
            }}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4" /> خروج
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
  return (
    <div className={`rounded-xl border ${cls} px-4 py-6 text-center text-sm`}>{children}</div>
  );
}
