import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

// Exercise the actual production artifact without credentials or database writes.
const reservation = net.createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [".output/server/index.mjs"], {
  env: {
    ...process.env,
    HOST: "127.0.0.1",
    PORT: String(port),
    SUPABASE_URL: "http://127.0.0.1:9",
    SUPABASE_PUBLISHABLE_KEY: "TEST_ONLY_PUBLIC_KEY",
    SUPABASE_SERVICE_ROLE_KEY: "",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", (chunk) => (output += chunk));
child.stderr.on("data", (chunk) => (output += chunk));
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(child.exitCode, null, `Server exited: ${output}`);
    try {
      const response = await fetch(`${origin}/privacy`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // Startup can briefly refuse connections.
    }
    await delay(200);
  }
  assert.ok(ready, `Server did not become ready: ${output}`);

  for (const path of ["/privacy", "/auth", "/academy", "/auth/callback"]) {
    const response = await fetch(`${origin}${path}`, {
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200, `${path}: ${output}`);
    assert.match(response.headers.get("content-type"), /text\/html/);
    const html = await response.text();
    assert.match(html, /<html/);
    const assets = [...new Set(html.match(/\/assets\/[^"'<>\s]+\.(?:js|css)/g))];
    assert.ok(assets.length, `${path} must reference built assets`);
    for (const asset of assets) {
      const result = await fetch(`${origin}${asset}`, {
        signal: AbortSignal.timeout(5000),
      });
      assert.equal(result.status, 200, asset);
      assert.doesNotMatch(result.headers.get("content-type") ?? "", /text\/html/);
    }
    console.log(`PASS ${path}: HTML and ${assets.length} assets`);
  }
} finally {
  child.kill("SIGTERM");
  if (child.exitCode === null) await once(child, "exit");
}
