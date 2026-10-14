import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

// Verify the artifact consumed by the current web host, rather than accepting
// a successful compile whose browser files were emitted into another directory.
const root = resolve("dist");
const metadata = JSON.parse(await readFile(resolve(root, "nitro.json"), "utf8"));
assert.equal(metadata.publicDir, "client", "Web hosting requires dist/client");
assert.equal(metadata.serverEntry, "server/index.mjs");
assert.ok((await stat(resolve(root, metadata.serverEntry))).size > 0);

const serverFiles = await readdir(resolve(root, "server"));
const manifests = serverFiles.filter((file) => /^_tanstack-start-manifest.*\.mjs$/.test(file));
assert.equal(manifests.length, 1, "Expected one emitted browser asset manifest");
const manifest = await readFile(resolve(root, "server", manifests[0]), "utf8");
const urls = new Set([...manifest.matchAll(/"(\/assets\/[^"?]+)"/g)].map((match) => match[1]));
assert.ok(urls.size > 0, "Browser asset manifest must contain script URLs");
for (const url of urls) {
  assert.ok((await stat(resolve(root, "client", url.slice(1)))).size > 0, `Missing ${url}`);
}
const assets = await readdir(resolve(root, "client/assets"));
assert.ok(
  assets.some((file) => /^styles-.*\.css$/.test(file)),
  "Missing main stylesheet",
);
assert.ok((await stat(resolve(root, "client/manifest.webmanifest"))).size > 0);
console.log(
  `PASS: web host artifact contains all ${urls.size} referenced scripts, styles, manifest and server entry.`,
);
