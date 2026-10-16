import test from "node:test";
import assert from "node:assert/strict";
import {
  getDeploymentConfig,
  assertDeploymentProof,
  TARGET_REF,
  APP_ID,
  PRODUCTION_APP_ID,
} from "../../scripts/independent/config.mjs";

const production = {
  TAMKEEN_DEPLOYMENT_ENV: "production",
  TAMKEEN_PRODUCTION_ORIGIN: "https://studentamkeen.com",
};
test("production requires an explicit mode, canonical HTTPS origin and separate settings", () => {
  assert.equal(getDeploymentConfig(production).appId, PRODUCTION_APP_ID);
  assert.equal(
    getDeploymentConfig({ TAMKEEN_STAGING_ORIGIN: "https://test.example" }).appId,
    APP_ID,
  );
  for (const origin of [
    undefined,
    "http://studentamkeen.com",
    "https://studentamkeen.com.evil.test",
    "https://u:p@studentamkeen.com",
    "https://www.studentamkeen.com",
    "https://studentamkeen.com/path",
    "https://studentamkeen.com/?token=x",
    "https://test.onrender.com",
  ])
    assert.throws(() => getDeploymentConfig({ ...production, TAMKEEN_PRODUCTION_ORIGIN: origin }));
  assert.throws(() =>
    getDeploymentConfig({ ...production, TAMKEEN_STAGING_ORIGIN: "https://test.example" }),
  );
  assert.throws(() => getDeploymentConfig({ ...production, TAMKEEN_DEPLOYMENT_ENV: "staging" }));
  assert.throws(() => getDeploymentConfig({ ...production, TAMKEEN_DEPLOYMENT_ENV: "prodution" }));
});
test("deployment proof cannot cross environments, app identities, targets or commits", () => {
  const deployment = getDeploymentConfig(production);
  const proof = {
    environment: "production",
    productionOrigin: deployment.origin,
    androidAppId: PRODUCTION_APP_ID,
    targetProject: TARGET_REF,
    sha: "a".repeat(40),
  };
  assert.doesNotThrow(() => assertDeploymentProof(proof, deployment, proof.sha));
  for (const change of [
    { environment: undefined },
    { environment: "staging" },
    { productionOrigin: "https://test.example" },
    { androidAppId: APP_ID },
    { targetProject: "zbdhxyuulyovihjgeqbn" },
    { sha: "b".repeat(40) },
  ])
    assert.throws(() => assertDeploymentProof({ ...proof, ...change }, deployment, proof.sha));
  const staging = getDeploymentConfig({ TAMKEEN_STAGING_ORIGIN: "https://test.example" });
  assert.throws(() => assertDeploymentProof(proof, staging));
  assert.doesNotThrow(() =>
    assertDeploymentProof(
      { targetProject: TARGET_REF, stagingOrigin: staging.origin, androidAppId: APP_ID },
      staging,
    ),
  );
});
