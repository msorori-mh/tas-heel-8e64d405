import { useWorkspaceHome } from "@/hooks/use-workspace-home";
import { rememberWorkspace } from "@/lib/auth/workspace";
import {
  createFileRoute,
  Outlet,
  redirect,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { getNetworkState } from "@/lib/offline/network";
import { readStudentIdentity, forgetStudentIdentity } from "@/lib/offline/student-shell-cache";
import { setActiveOfflineOwner } from "@/lib/offline/offline-state-store";
import { useConnectivity } from "@/hooks/use-connectivity";
import { ConnectionRequired } from "@/components/offline/ConnectionRequired";
import { getRestoredUser } from "@/lib/auth/restored-user";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { StudentShell } from "@/components/student/StudentShell";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const saved = await readStudentIdentity();
    let user = saved?.user ?? null;
    if ((await getNetworkState()).online) {
      try {
        user = await getRestoredUser(supabase.auth);
        if (!user) {
          await forgetStudentIdentity();
          await setActiveOfflineOwner(null);
        }
      } catch {
        // A transport/backend outage may retain offline access. A definitive
        // authentication rejection above must never restore the saved identity.
      }
    }
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
  const needsDestination = !loading && !!user && !profileComplete && !isAdmin && !isContentStaff;
  const { destination, error } = useWorkspaceHome(user?.id, profileComplete, needsDestination);

  useEffect(() => {
    if (loading) return;
    if (!user && online) {
      void navigate({ to: "/auth", search: { mode: "login" }, replace: true });
      return;
    }
    if (destination) void navigate({ to: destination, replace: true });
    else if (user && profileComplete && !isAdminArea) rememberWorkspace(user.id, "student");
  }, [loading, user, online, profileComplete, isAdminArea, destination, navigate]);

  if (needsDestination)
    return (
      <main className="p-6" dir="rtl">
        {error ? (
          <>
            <p>تعذّر فتح مساحتك.</p>
            <a href="/academy">مساحة المعلم</a> · <a href="/complete-profile">مساحة الطالب</a>
          </>
        ) : (
          "جارٍ فتح مساحتك…"
        )}
      </main>
    );

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
