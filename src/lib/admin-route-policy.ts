/** Admin paths allowed for content_manager (full admin sees everything). */
export const CONTENT_MANAGER_ADMIN_PATHS = [
  "/admin/academic",
  "/admin/subjects",
  "/admin/units",
  "/admin/lessons",
  "/admin/questions",
  "/admin/exam-templates",
  "/admin/import",
] as const;

export const FULL_ADMIN_ONLY_ADMIN_PATHS = [
  "/admin",
  "/admin/reports",
  "/admin/students",
  "/admin/users",
  "/admin/payment-methods",
  "/admin/payment-requests",
  "/admin/wallet-topups",
] as const;

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
  if (
    FULL_ADMIN_ONLY_ADMIN_PATHS.some(
      (blocked) => blocked !== "/admin" && (path === blocked || path.startsWith(`${blocked}/`)),
    )
  ) {
    return false;
  }
  return isContentManagerAdminPath(path);
}

type SidebarLink = {
  href:
    | "/admin"
    | "/admin/reports"
    | "/admin/students"
    | "/admin/users"
    | "/admin/academic"
    | "/admin/subjects"
    | "/admin/units"
    | "/admin/lessons"
    | "/admin/questions"
    | "/admin/exam-templates"
    | "/admin/import"
    | "/admin/payment-methods"
    | "/admin/payment-requests"
    | "/admin/wallet-topups";
  label: string;
  end?: boolean;
};

export function filterAdminSidebarLinks<T extends SidebarLink>(links: T[], isAdmin: boolean): T[] {
  if (isAdmin) return links;
  return links.filter(
    (link) => !FULL_ADMIN_ONLY_ADMIN_PATHS.some((blocked) => blocked === link.href),
  );
}
