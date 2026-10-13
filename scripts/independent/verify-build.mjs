import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { TARGET_REF, TARGET_URL, validateStagingOrigin } from "./config.mjs";
export function verifyBuild(root, origin) {
  const proof = JSON.parse(readFileSync(resolve(root, "independent-release.json"), "utf8"));
  if (proof.targetProject !== TARGET_REF || proof.stagingOrigin !== validateStagingOrigin(origin))
    throw new Error("Build proof mismatch");
  let files = 0,
    targetFound = false;
  function visit(dir) {
    for (const item of readdirSync(dir, { withFileTypes: true })) {
      const path = resolve(dir, item.name);
      if (item.isDirectory()) visit(path);
      else if (item.name.endsWith(".js")) {
        files++;
        const source = readFileSync(path, "utf8");
        if (source.includes("zbdhxyuulyovihjgeqbn.supabase.co"))
          throw new Error(`Old database target in client asset: ${item.name}`);
        if (/ai\.gateway\.lovable\.dev|__lovableEvents|lovable-preview-auth/.test(source))
          throw new Error(`Old platform integration in client asset: ${item.name}`);
        if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(source))
          throw new Error(`Possible secret or privileged key in client asset: ${item.name}`);
        targetFound ||= source.includes(TARGET_URL);
      }
    }
  }
  // Include the native SPA and academy bundles, not just the web /assets directory.
  visit(root);
  if (!targetFound || !files) throw new Error("Expected target configuration missing.");
  return files;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = verifyBuild(resolve(".output/public"), process.env.TAMKEEN_STAGING_ORIGIN);
  console.log(`INDEPENDENT_CLIENT_TARGET_OK ${files} JavaScript assets`);
}
