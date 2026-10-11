import { spawn } from "node:child_process";
import { once } from "node:events";
import { readdirSync, readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { TARGET_URL, PUBLIC_KEY } from "./config.mjs";

// Local compiled-server smoke only. No account, secret, database write, or external call.
const origin = "http://127.0.0.1:4197";
const server = spawn(process.execPath, [".output/server/index.mjs"], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    NITRO_HOST: "127.0.0.1",
    PORT: "4197",
    NITRO_PORT: "4197",
    SUPABASE_URL: TARGET_URL,
    SUPABASE_PUBLISHABLE_KEY: PUBLIC_KEY,
    SUPABASE_SERVICE_ROLE_KEY: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stderr.on("data", (b) => (log += b));
const timer = setTimeout(() => server.kill(), 45000);
try {
  await new Promise((resolve, reject) => {
    server.stdout.on("data", (b) => {
      log += b;
      if (log.includes("Listening on:")) resolve();
    });
    server.on("exit", (code) =>
      reject(new Error(`Smoke server exited ${code}: ${log.slice(-1000)}`)),
    );
  });
  let routes = 0;
  for (const route of ["/auth", "/semesters/1", "/academy"]) {
    const r = await fetch(origin + route);
    assert.equal(r.status, 200, route);
    assert.equal(r.headers.get("X-Tamkeen-Environment"), "independent-staging");
    assert.ok(r.headers.get("content-security-policy")?.includes(TARGET_URL));
    await r.text();
    routes++;
  }
  const proof = await (await fetch(origin + "/independent-release.json")).json();
  assert.equal(proof.targetProject, "yjpirilbpqxtmnayruht");
  const assets = readdirSync(".output/public/assets").filter((x) => x.endsWith(".js"));
  for (let i = 0; i < assets.length; i += 10)
    await Promise.all(
      assets.slice(i, i + 10).map(async (name) => {
        const r = await fetch(origin + "/assets/" + name);
        assert.equal(r.status, 200, name);
        assert.deepEqual(
          Buffer.from(await r.arrayBuffer()),
          readFileSync(".output/public/assets/" + name),
          name,
        );
      }),
    );
  const denied = await fetch(
    origin + "/api/offline-pack/manifest/00000000-0000-4000-8000-000000000000",
  );
  await denied.text();
  assert.equal(denied.status, 401);
  console.log(
    JSON.stringify({
      htmlRoutes: routes,
      clientAssets: assets.length,
      unauthenticatedManifestStatus: denied.status,
      scope: "local compiled HTTP only",
    }),
  );
} finally {
  clearTimeout(timer);
  if (server.exitCode === null) {
    server.kill();
    await once(server, "exit");
  }
}
