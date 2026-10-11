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

// Capacitor's remote-origin errorPath serves the error HTML locally, but
// sibling URLs can still be proxied to the remote origin. Embed the tour so
// the cold-start entry never needs a request for student-intro.js.
const inline = await build({
  entryPoints: ["src/lib/onboarding/student-intro.ts"],
  bundle: true,
  format: "iife",
  globalName: "TamkeenStudentIntro",
  target: "es2020",
  write: false,
});
const htmlPath = "mobile/www/index.html";
const html = await readFile(htmlPath, "utf8");
const inlineCode = await format(inline.outputFiles[0].text, {
  ...(await resolveConfig(outfile)),
  filepath: outfile,
});
const script = `<script id="tamkeen-student-intro-bundle">\n${inlineCode}</script>`;
const marker = /<script id="tamkeen-student-intro-bundle">[\s\S]*?<\/script>/;
if (!marker.test(html)) throw new Error("Missing bundled introduction script marker.");
const updated = html.replace(marker, () => script);
if (process.argv.includes("--check")) {
  if (html !== updated)
    throw new Error("Embedded student intro is stale. Run npm run build:student-intro.");
} else {
  await writeFile(htmlPath, updated);
}
