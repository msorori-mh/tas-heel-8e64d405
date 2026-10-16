import { getDeploymentConfig, assertDeploymentProof } from "./config.mjs";
const deployment = getDeploymentConfig();
const { origin } = deployment;
const expected = process.env.TAMKEEN_EXPECTED_SHA;
if (!expected || !/^[0-9a-f]{40}$/.test(expected))
  throw new Error("An exact deployed commit SHA is required.");
const response = await fetch(`${origin}/independent-release.json`, {
  redirect: "error",
  cache: "no-store",
  signal: AbortSignal.timeout(15000),
});
if (!response.ok) throw new Error(`Deployment proof unavailable: HTTP ${response.status}`);
const proof = await response.json();
assertDeploymentProof(proof, deployment, expected);
const page = await fetch(`${origin}/auth`, {
  redirect: "error",
  cache: "no-store",
  signal: AbortSignal.timeout(15000),
});
await page.body?.cancel();
if (
  !page.ok ||
  page.headers.get("X-Tamkeen-Environment") !== `independent-${deployment.environment}`
)
  throw new Error("Independent web runtime check failed.");
console.log(`DEPLOYMENT_MATCHED ${expected}`);
