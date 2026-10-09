export const TARGET_REF = "yjpirilbpqxtmnayruht";
export const TARGET_URL = `https://${TARGET_REF}.supabase.co`;
export const PUBLIC_KEY = "sb_publishable_0jwJXT5ejTU8ChDH2feagg_FFPZQsgQ";
export const APP_ID = "app.studentamkeen.tamkeen.staging";
export function validateStagingOrigin(value) {
  if (!value) throw new Error("TAMKEEN_STAGING_ORIGIN is required.");
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.port ||
    ["studentamkeen.com", "www.studentamkeen.com", "localhost"].includes(url.hostname) ||
    /(?:^|\.)(?:supabase\.co|lovable\.app|lovableproject\.com|lovableproject-dev\.com)$/.test(
      url.hostname,
    )
  )
    throw new Error(
      "Use a separate HTTPS staging origin, never the production or database origin.",
    );
  return url.origin;
}
export function assertAllowedSupabaseUrl(input) {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (/(^|\.)supabase\.(co|in)$/.test(url.hostname) && url.origin !== TARGET_URL)
    throw new Error("INDEPENDENT_TARGET_MISMATCH");
}
