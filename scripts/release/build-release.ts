import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { join, resolve } from "node:path";

// Versioned, portable fingerprint of web source, assets and build configuration.
// Git metadata, credentials, dependencies and generated build output are excluded.
const directories = [
  "src",
  "public",
  "apps/teacher-academy/src",
  "apps/teacher-academy/public",
  "scripts/release",
];
const requiredFiles = ["package.json", "package-lock.json", "vite.config.ts", "tsconfig.json"];
const optionalFiles = [
  "bun.lock",
  "components.json",
  "apps/teacher-academy/vite.config.ts",
  "apps/teacher-academy/tsconfig.json",
  "apps/teacher-academy/index.html",
];

export function sourceFingerprint(root: string): string {
  const files: string[] = [];
  const visit = (path: string) => {
    const stat = lstatSync(join(root, path));
    if (stat.isSymbolicLink()) throw new Error(`Release input must not be a symlink: ${path}`);
    if (stat.isDirectory()) {
      for (const name of readdirSync(join(root, path)).sort()) visit(`${path}/${name}`);
    } else if (stat.isFile()) {
      files.push(path);
    } else {
      throw new Error(`Unsupported release input: ${path}`);
    }
  };
  for (const path of [...directories, ...requiredFiles]) visit(path);
  for (const path of optionalFiles) if (existsSync(join(root, path))) visit(path);

  const hash = createHash("sha256").update("tamkeen-web-source-v1\n");
  for (const path of files.sort()) {
    const digest = createHash("sha256")
      .update(readFileSync(join(root, path)))
      .digest("hex");
    hash.update(JSON.stringify([path, digest]) + "\n");
  }
  return hash.digest("hex");
}

export function resolveBuildSha(root: string, env: NodeJS.ProcessEnv = process.env): string {
  for (const candidate of [env.GITHUB_SHA, env.VITE_GIT_SHA]) {
    if (candidate && /^[0-9a-f]{40}$/i.test(candidate.trim()))
      return candidate.trim().toLowerCase();
  }
  try {
    const git = (args: string[]) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    // An archive inside another checkout must not inherit its parent's identity.
    if (realpathSync(git(["rev-parse", "--show-toplevel"])) !== realpathSync(resolve(root))) {
      return "unknown";
    }
    const sha = git(["rev-parse", "HEAD"]);
    return /^[0-9a-f]{40}$/i.test(sha) ? sha.toLowerCase() : "unknown";
  } catch {
    return "unknown";
  }
}

export function buildRelease(root: string, env: NodeJS.ProcessEnv = process.env) {
  return Object.freeze({
    sha: resolveBuildSha(root, env),
    sourceSha256: sourceFingerprint(root),
    builtAt: new Date().toISOString(),
  });
}
