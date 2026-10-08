import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { format, resolveConfig } from "prettier";
const outfile = "mobile/www/student-intro.js";
const result = await build({
  entryPoints: ["src/lib/onboarding/student-intro.ts"],
  bundle: true,
  format: "esm",
  target: "es2020",
  write: false,
});
const formatted = await format(result.outputFiles[0].text, {
  ...(await resolveConfig(outfile)),
  filepath: outfile,
});
if (process.argv.includes("--check")) {
  if ((await readFile(outfile, "utf8")) !== formatted) {
    throw new Error("Bundled student intro is stale. Run npm run build:student-intro.");
  }
} else {
  await writeFile(outfile, formatted);
}
