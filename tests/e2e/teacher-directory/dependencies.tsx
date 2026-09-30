import type { AnchorHTMLAttributes } from "react";
export function Link({ to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return <a {...props} href={to} />;
}
export const useRouterState = () => "/admin/teachers";
export const useNavigate = () => () => {};
export const useAuth = () => ({ isAdmin: true, signOut: async () => {} });
export const supabase = {};
