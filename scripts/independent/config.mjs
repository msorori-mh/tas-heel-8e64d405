export const TARGET_REF = "yjpirilbpqxtmnayruht";
export const TARGET_URL = `https://${TARGET_REF}.supabase.co`;
export const PUBLIC_KEY = "sb_publishable_0jwJXT5ejTU8ChDH2feagg_FFPZQsgQ";
export const APP_ID = "app.studentamkeen.tamkeen.staging";
export const PRODUCTION_APP_ID = "app.studentamkeen.tamkeen";
export function validateProductionOrigin(value) {
  if (value !== "https://studentamkeen.com" && value !== "https://studentamkeen.com/")
    throw new Error("TAMKEEN_PRODUCTION_ORIGIN must be https://studentamkeen.com.");
  return "https://studentamkeen.com";
}
export function getDeploymentConfig(env = process.env) {
  const environment = env.TAMKEEN_DEPLOYMENT_ENV || "staging";
  if (environment !== "staging" && environment !== "production")
    throw new Error("Unknown independent deployment environment.");
  if (environment === "production") {
    if (env.TAMKEEN_STAGING_ORIGIN)
      throw new Error("Remove TAMKEEN_STAGING_ORIGIN from the production service.");
    return {
      environment,
      origin: validateProductionOrigin(env.TAMKEEN_PRODUCTION_ORIGIN),
      appId: PRODUCTION_APP_ID,
    };
  }
  if (env.TAMKEEN_PRODUCTION_ORIGIN)
    throw new Error("Production origin is not allowed in the staging service.");
  return { environment, origin: validateStagingOrigin(env.TAMKEEN_STAGING_ORIGIN), appId: APP_ID };
}
export function assertDeploymentProof(proof, deployment, expectedSha) {
  const field = deployment.environment === "production" ? "productionOrigin" : "stagingOrigin";
  if (
    proof.targetProject !== TARGET_REF ||
    (proof.environment ?? "staging") !== deployment.environment ||
    proof[field] !== deployment.origin ||
    proof.androidAppId !== deployment.appId ||
    (expectedSha !== undefined && proof.sha !== expectedSha)
  )
    throw new Error("Build and runtime deployment proof mismatch.");
}
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
  if (
    /(^|\.)(lovable\.dev|lovable\.app|lovableproject\.com|lovableproject-dev\.com|gptengineer\.run|gpt-eng\.com)$/.test(
      url.hostname,
    )
  )
    throw new Error("INDEPENDENT_PLATFORM_DEPENDENCY_BLOCKED");
  if (/(^|\.)supabase\.(co|in)$/.test(url.hostname) && url.origin !== TARGET_URL)
    throw new Error("INDEPENDENT_TARGET_MISMATCH");
}
