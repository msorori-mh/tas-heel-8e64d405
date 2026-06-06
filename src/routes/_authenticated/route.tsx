import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StudentNav } from "@/components/student/StudentNav";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { loading, profile, profileComplete, isAdmin } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!profile && !isAdmin) return; // wait for profile load
    if (!profileComplete && !isAdmin) {
      navigate({ to: "/complete-profile", replace: true });
    }
  }, [loading, profile, profileComplete, isAdmin, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground" dir="rtl">
      <StudentNav />
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
