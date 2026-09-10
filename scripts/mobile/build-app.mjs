import { execFileSync } from "node:child_process";
import { cpSync, existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

// Build the original application. Never substitute apps/student-mobile here.
execFileSync(process.execPath, ["node_modules/vite/bin/vite.js", "build"], {
  stdio: "inherit",
  env: { ...process.env, TAMKEEN_MOBILE_BUILD: "1" },
});
const client = resolve("dist/client");
const output = resolve("dist-mobile");
if (!existsSync(`${client}/index.html`)) throw new Error("The full-app SPA shell is missing");
const html = readFileSync(`${client}/index.html`, "utf8");
if (!html.includes('type="module"')) throw new Error("The full-app client entry is missing");
rmSync(output, { recursive: true, force: true });
cpSync(client, output, { recursive: true });
console.log("Packaged the original student and teacher application in dist-mobile");
