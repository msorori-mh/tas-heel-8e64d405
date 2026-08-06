import { createFileRoute, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StudentShell } from "@/components/student/StudentShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { mode: "login" } });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { loading, profile, profileComplete, isAdmin, isContentStaff } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdminArea = pathname.startsWith("/admin");

  useEffect(() => {
    if (loading) return;
    if (!profile && !isAdmin && !isContentStaff) return; // wait for profile load
    if (!profileComplete && !isAdmin && !isContentStaff) {
      navigate({ to: "/complete-profile", replace: true });
    }
  }, [loading, profile, profileComplete, isAdmin, isContentStaff, navigate]);

  // Admin pages render their own AdminLayout — no student shell.
  if (isAdminArea) {
    return (
      <div className="admin-app-bg min-h-screen text-foreground" dir="rtl">
        <Outlet />
      </div>
    );
  }

  return (
    <StudentShell>
      <Outlet />
    </StudentShell>
  );
}

