import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve, relative } from "node:path";
import { createHash } from "node:crypto";

const root = process.cwd();
const source = resolve(root, ".output/public");
const output = resolve(root, "mobile/native-www");
const shell = readFileSync(resolve(source, "_shell.html"), "utf8");
if (!shell.includes("/native-shell/assets/") || !shell.includes("<head>")) {
  throw new Error("Build the independent SPA shell with TAMKEEN_NATIVE_SHELL=1 first.");
}
const release = JSON.parse(readFileSync(resolve(source, "independent-release.json"), "utf8"));
if (release.targetProject !== "yjpirilbpqxtmnayruht") throw new Error("Wrong native target.");
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
// Only public application assets enter the APK. No SSR code, secrets, cached API
// responses, or user data. Native storage remains the authority for saved lessons.
const allowed = /\.(?:js|css|png|svg|ico|jpg|jpeg|webp|woff2?|ttf)$/i;
const assets = {};
function visit(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      visit(path);
      continue;
    }
    const name = relative(source, path).replaceAll("\\", "/");
    if (!allowed.test(name) || /(?:^|\/)sw\.js$/.test(name)) continue;
    const bytes = readFileSync(path);
    if (/\.(?:js|css)$/.test(name) && /sb_secret_|zbdhxyuulyovihjgeqbn/.test(bytes.toString())) {
      throw new Error(`Forbidden credentials or source project in ${name}`);
    }
    mkdirSync(resolve(output, name, ".."), { recursive: true });
    cpSync(path, resolve(output, name));
    assets["/" + name] = createHash("sha256").update(bytes).digest("hex");
  }
}
visit(source);
const fontPackage = resolve(root, "node_modules/@fontsource/cairo");
mkdirSync(resolve(output, "native-shell/fonts"), { recursive: true });
let fontCss = "";
for (const weight of [400, 600, 700, 800]) {
  fontCss += readFileSync(resolve(fontPackage, `${weight}.css`), "utf8").replace(
    /\.\/files\/([^)'"\s]+)/g,
    (_, file) => {
      const name = "native-shell/fonts/" + file;
      const bytes = readFileSync(resolve(fontPackage, "files", file));
      writeFileSync(resolve(output, name), bytes);
      assets["/" + name] = createHash("sha256").update(bytes).digest("hex");
      return "/" + name;
    },
  );
}
writeFileSync(resolve(output, "native-shell/fonts/cairo.css"), fontCss);
assets["/native-shell/fonts/cairo.css"] = createHash("sha256").update(fontCss).digest("hex");
cpSync(resolve(fontPackage, "LICENSE"), resolve(output, "native-shell/fonts/LICENSE.txt"));
// RootShell owns the entry bootstrap so the HTML and React hydration tree match.
// Never inject unowned markup into the generated document.
const html = shell;
writeFileSync(resolve(output, "index.html"), html);
assets["/index.html"] = createHash("sha256").update(html).digest("hex");
writeFileSync(
  resolve(output, "native-shell-manifest.json"),
  JSON.stringify(
    {
      schema: 1,
      ...release,
      assets,
    },
    null,
    2,
  ),
);
console.log(`NATIVE_REACT_SHELL_PACKAGED ${Object.keys(assets).length} assets`);
