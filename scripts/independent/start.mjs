import { readFileSync } from "node:fs";
import { TARGET_URL, TARGET_REF, PUBLIC_KEY, validateStagingOrigin } from "./config.mjs";
import { guardedFetch } from "./fetch-guard.mjs";

if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("Node.js 22+ required.");
const origin = validateStagingOrigin(process.env.TAMKEEN_STAGING_ORIGIN);
const release = JSON.parse(
  readFileSync(new URL("../../.output/public/independent-release.json", import.meta.url), "utf8"),
);
if (release.targetProject !== TARGET_REF || release.stagingOrigin !== origin)
  throw new Error("Build and runtime target/origin mismatch. Rebuild before starting.");
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
if (!key || !(key.startsWith("sb_secret_") || key.startsWith("eyJ")))
  throw new Error("Set the target Supabase server secret in the hosting secret settings.");
process.env.SUPABASE_URL = TARGET_URL;
process.env.VITE_SUPABASE_URL = TARGET_URL;
process.env.SUPABASE_PUBLISHABLE_KEY = PUBLIC_KEY;
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = PUBLIC_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = key;
process.env.TAMKEEN_INDEPENDENT_STAGING = "true";
process.env.NITRO_HOST = "0.0.0.0";
process.env.NITRO_PORT = process.env.PORT || "10000";
globalThis.fetch = guardedFetch(globalThis.fetch.bind(globalThis));
const headers = { apikey: key };
if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
const response = await fetch(`${TARGET_URL}/auth/v1/admin/users?page=1&per_page=1`, {
  headers,
  signal: AbortSignal.timeout(20_000),
});
await response.body?.cancel();
if (!response.ok)
  throw new Error(`Target server key check failed (HTTP ${response.status}); no server started.`);
console.log(`INDEPENDENT_TARGET_CONFIRMED ${TARGET_REF}`);
await import("../../.output/server/index.mjs");
