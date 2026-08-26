import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";

/** Admin paths allowed for content_manager (full admin sees everything). */
export const CONTENT_MANAGER_ADMIN_PATHS = [
  "/admin/academic",
  "/admin/curriculum",
  "/admin/subjects",
  "/admin/units",
  "/admin/lessons",
  "/admin/textbooks",
  "/admin/questions",
  "/admin/exam-templates",
  "/admin/ministerial-exams",
  "/admin/import",
] as const;

export const FULL_ADMIN_ONLY_ADMIN_PATHS = [
  "/admin",
  "/admin/students",
  "/admin/users",
  "/admin/payment-methods",
  "/admin/payment-requests",
  "/admin/wallet-topups",
  "/admin/learning-insights",
] as const;

export type AdminSection = "full" | "content";

export function isContentManagerAdminPath(path: string): boolean {
  return CONTENT_MANAGER_ADMIN_PATHS.some(
    (allowed) => path === allowed || path.startsWith(`${allowed}/`),
  );
}

export function canAccessAdminPath(
  path: string,
  flags: { isAdmin: boolean; isContentStaff: boolean },
): boolean {
  if (flags.isAdmin) return true;
  if (!flags.isContentStaff) return false;
  if (path === "/admin" || path === "/admin/") return false;
  if (path.startsWith("/admin/students")) return false;
  if (path.startsWith("/admin/users")) return false;
  if (path.startsWith("/admin/payment-methods")) return false;
  if (path.startsWith("/admin/payment-requests")) return false;
  if (path.startsWith("/admin/wallet-topups")) return false;
  if (path.startsWith("/admin/learning-insights")) return false;
  return isContentManagerAdminPath(path);
}

type SidebarLink = {
  href:
    | "/admin"
    | "/admin/students"
    | "/admin/users"
    | "/admin/academic"
    | "/admin/curriculum"
    | "/admin/subjects"
    | "/admin/units"
    | "/admin/lessons"
    | "/admin/textbooks"
    | "/admin/questions"
    | "/admin/exam-templates"
    | "/admin/ministerial-exams"
    | "/admin/import"
    | "/admin/learning-insights/mistakes"
    | "/admin/learning-insights/performance"
    | "/admin/learning-insights/quick-review"
    | "/admin/payment-methods"
    | "/admin/payment-requests"
    | "/admin/wallet-topups";
  label: string;
  end?: boolean;
};

export function filterAdminSidebarLinks<T extends SidebarLink>(links: T[], isAdmin: boolean): T[] {
  if (isAdmin) return links;
  return links.filter(
    (link) =>
      link.href !== "/admin" &&
      link.href !== "/admin/students" &&
      link.href !== "/admin/users" &&
      link.href !== "/admin/payment-methods" &&
      link.href !== "/admin/payment-requests" &&
      link.href !== "/admin/wallet-topups" &&
      link.href !== "/admin/learning-insights/mistakes" &&
      link.href !== "/admin/learning-insights/performance" &&
      link.href !== "/admin/learning-insights/quick-review",
  );
}

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
