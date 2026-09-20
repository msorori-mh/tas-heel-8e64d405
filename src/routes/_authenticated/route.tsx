import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { getNetworkState } from "@/lib/offline/network";
import { readStudentIdentity } from "@/lib/offline/student-shell-cache";
import { useConnectivity } from "@/hooks/use-connectivity";
import { ConnectionRequired } from "@/components/offline/ConnectionRequired";
import { getRestoredUser } from "@/lib/auth/restored-user";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StudentShell } from "@/components/student/StudentShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const user = (await getNetworkState()).online
      ? await getRestoredUser(supabase.auth)
      : (await readStudentIdentity())?.user;
    if (!user) throw redirect({ to: "/auth", search: { mode: "login" } });
    return { user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { loading, user, profile, profileComplete, isAdmin, isContentStaff } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdminArea = pathname.startsWith("/admin");
  const online = useConnectivity();

  useEffect(() => {
    if (loading) return;
    if (!user && online) {
      void navigate({ to: "/auth", search: { mode: "login" }, replace: true });
      return;
    }
    if (!profile && !isAdmin && !isContentStaff) return; // wait for profile load
    if (online && !profileComplete && !isAdmin && !isContentStaff) {
      navigate({ to: "/complete-profile", replace: true });
    }
  }, [loading, user, online, profile, profileComplete, isAdmin, isContentStaff, navigate]);

  // Admin pages render their own AdminLayout — no student shell.
  if (isAdminArea && online) {
    return (
      <div className="admin-app-bg min-h-screen text-foreground" dir="rtl">
        <Outlet />
      </div>
    );
  }

  return (
    <StudentShell>
      {!online &&
      !/^\/(app|semesters(?:\/[12])?|subjects\/[^/]+|lessons\/[^/]+|progress|settings)\/?$/.test(
        pathname,
      ) ? (
        <ConnectionRequired />
      ) : (
        <Outlet />
      )}
    </StudentShell>
  );
}
