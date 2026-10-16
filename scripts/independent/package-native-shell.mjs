import { packageNativeShell } from "../mobile/package-shell.mjs";
import { TARGET_REF, getDeploymentConfig, assertDeploymentProof } from "./config.mjs";
import { readFileSync } from "node:fs";
const deployment = getDeploymentConfig();
assertDeploymentProof(
  JSON.parse(readFileSync(".output/public/independent-release.json", "utf8")),
  deployment,
);
packageNativeShell({
  releaseFile: "independent-release.json",
  expectedProject: TARGET_REF,
  expectedOrigin: deployment.origin,
  expectedAppId: deployment.appId,
});
