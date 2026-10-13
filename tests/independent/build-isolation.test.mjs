import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { verifyBuild } from "../../scripts/independent/verify-build.mjs";

test("isolation scanner rejects old services or privileged keys in native and academy chunks", () => {
  const root = mkdtempSync(resolve(".build-isolation-test-"));
  const origin = "https://tamkeen-independent-test.onrender.com";
  try {
    writeFileSync(
      resolve(root, "independent-release.json"),
      JSON.stringify({
        targetProject: "yjpirilbpqxtmnayruht",
        stagingOrigin: origin,
      }),
    );
    for (const directory of ["assets", "native-shell/assets", "academy-offline/assets"])
      mkdirSync(resolve(root, directory), { recursive: true });
    writeFileSync(
      resolve(root, "assets/app.js"),
      'const url="https://yjpirilbpqxtmnayruht.supabase.co";',
    );
    assert.equal(verifyBuild(root, origin), 1);
    for (const folder of ["native-shell/assets", "academy-offline/assets"]) {
      const file = resolve(root, folder, "hidden.js");
      for (const content of [
        'const url="https://zbdhxyuulyovihjgeqbn.supabase.co";',
        'fetch("https://ai.gateway.lovable.dev");',
        'const key="sb_secret_TEST_ONLY_NOT_A_REAL_CREDENTIAL_1234";',
      ]) {
        writeFileSync(file, content);
        assert.throws(() => verifyBuild(root, origin));
      }
      rmSync(file);
    }
    assert.equal(verifyBuild(root, origin), 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
