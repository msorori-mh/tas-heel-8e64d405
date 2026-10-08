import { build } from "esbuild";
await build({
  entryPoints: ["src/lib/onboarding/student-intro.ts"],
  bundle: true,
  format: "esm",
  target: "es2020",
  outfile: "mobile/www/student-intro.js",
});
