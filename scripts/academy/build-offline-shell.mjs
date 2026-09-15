import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { cp, mkdir, rm, readdir, writeFile, readFile } from "node:fs/promises";
// Public shell contains code only. Teacher content remains in account-scoped IndexedDB.
execFileSync(
  process.execPath,
  ["node_modules/vite/bin/vite.js", "build", "--config", "apps/teacher-academy/vite.config.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      ACADEMY_OFFLINE_SHELL: "1",
      VITE_ACADEMY_ENABLED: "true",
      VITE_ACADEMY_BASE_PATH: "/academy",
    },
  },
);
for (const target of ["public/academy-shell", "apps/teacher-academy/public/academy-shell"]) {
  await rm(target, { recursive: true, force: true });
  await mkdir(target, { recursive: true });
  await cp("dist-academy-shell", target, { recursive: true });
}

const assets = (await readdir("dist-academy-shell/assets"))
  .filter((name) => /\.(js|css)$/.test(name))
  .map((name) => `/academy-shell/assets/${name}`);
for (const target of ["public/academy-shell", "apps/teacher-academy/public/academy-shell"])
  await writeFile(`${target}/assets.json`, JSON.stringify(assets));

const revision = createHash("sha256")
  .update(await readFile("dist-academy-shell/index.html"))
  .digest("hex")
  .slice(0, 16);
for (const target of ["public/academy-shell", "apps/teacher-academy/public/academy-shell"])
  await writeFile(
    `${target}/revision.js`,
    `self.ACADEMY_SHELL_REVISION=${JSON.stringify(revision)};`,
  );
