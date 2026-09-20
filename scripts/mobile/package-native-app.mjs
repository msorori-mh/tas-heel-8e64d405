import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { prepareBundledUi } from "./prepare-bundled-ui.mjs";

assert.equal(
  process.env.TAMKEEN_NATIVE_APP,
  "1",
  "Build native SPA assets explicitly before Capacitor sync",
);
await prepareBundledUi("mobile/app-www");
await writeFile(
  "mobile/app-www/native-build.json",
  JSON.stringify(
    {
      sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
      shell: "normal-app-local-first-v2",
      apiOrigin: "https://studentamkeen.com",
      offlineLibraryFallback: false,
    },
    null,
    2,
  ),
);
