import type { AnchorHTMLAttributes } from "react";
export function Link({ to, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) {
  return <a {...props} href={to} />;
}
export const useRouterState = () => "/admin";
export const useNavigate =
  () =>
  ({ to }: { to: string }) => {
    window.location.hash = to;
  };
export const useAuth = () => ({
  isAdmin: !window.location.search.includes("content-staff"),
  signOut: async () => {
    throw new Error("TEST_ONLY sign-out failure");
  },
});
