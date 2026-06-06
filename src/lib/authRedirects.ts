/**
 * Centralized helper for building auth redirect URLs.
 *
 * Currently web-only: returns `${window.location.origin}${path}`.
 *
 * Extension points (do NOT implement here yet — future phases):
 *  - Phase 4.3.4/4.3.5: Capacitor / Android App Links
 *      e.g. detect `window.Capacitor?.isNativePlatform()` and return a custom
 *      scheme like `app.thanawi://auth/callback` or an https App Link domain.
 *  - Phase 4.3.2: dedicated `/auth/callback` route for OAuth.
 *
 * Keep this file as the single source of truth for auth redirect URLs so the
 * future platform-aware logic only needs to change in one place.
 */
export function getAuthRedirectUrl(path: string = ""): string {
  const origin =
    typeof window !== "undefined" && window.location
      ? window.location.origin
      : "";
  if (!path) return origin;
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}
