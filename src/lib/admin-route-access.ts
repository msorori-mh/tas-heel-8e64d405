import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
export {
  canAccessAdminPath,
  CONTENT_MANAGER_ADMIN_PATHS,
  filterAdminSidebarLinks,
  FULL_ADMIN_ONLY_ADMIN_PATHS,
  isContentManagerAdminPath,
} from "./admin-route-policy";

export type AdminSection = "full" | "content";

export function useRequireAdminSection(section: AdminSection) {
  const { loading, isAdmin, isContentStaff } = useAuth();
  const navigate = useNavigate();
  const allowed = section === "full" ? isAdmin : isContentStaff;

  useEffect(() => {
    if (loading) return;
    if (section === "full") {
      if (isContentStaff && !isAdmin) {
        navigate({ to: "/admin/academic", replace: true });
        return;
      }
      if (!isAdmin) {
        navigate({ to: "/app", replace: true });
      }
      return;
    }
    if (!isContentStaff) {
      navigate({ to: "/app", replace: true });
    }
  }, [loading, section, isAdmin, isContentStaff, navigate]);

  return {
    loading,
    isAdmin,
    isContentStaff,
    allowed,
    enabled: !loading && allowed,
  };
}
