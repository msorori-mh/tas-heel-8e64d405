import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  buildRelease,
  resolveBuildSha,
  sourceFingerprint,
} from "../../scripts/release/build-release";

const roots: string[] = [];
function fixture(reverse = false) {
  const root = mkdtempSync(join(process.cwd(), ".release-test-"));
  roots.push(root);
  for (const dir of [
    "src",
    "public",
    "apps/teacher-academy/src",
    "apps/teacher-academy/public",
    "scripts/release",
  ]) {
    mkdirSync(join(root, dir), { recursive: true });
  }
  const entries = [
    ["package.json", '{"name":"TEST_ONLY"}'],
    ["package-lock.json", '{"lockfileVersion":3}'],
    ["vite.config.ts", "export default {};"],
    ["tsconfig.json", "{}"],
    ["src/a.ts", "export const a = 1;"],
    ["src/z.ts", "export const z = 2;"],
    ["public/icon.svg", "<svg/>"],
    ["scripts/release/build-release.ts", "// TEST_ONLY builder"],
  ];
  for (const [path, content] of reverse ? entries.reverse() : entries)
    writeFileSync(join(root, path), content);
  return root;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("portable release identity", () => {
  it("builds a real source identity without Git metadata or commit environment variables", () => {
    const root = fixture();
    const release = buildRelease(root, {});
    expect(release.sha).toBe("unknown");
    expect(release.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(Number.isFinite(Date.parse(release.builtAt))).toBe(true);
    expect(sourceFingerprint(root)).toBe(release.sourceSha256);
    const independent = createHash("sha256").update("tamkeen-web-source-v1\n");
    for (const row of release.sourceManifest.files) independent.update(JSON.stringify(row) + "\n");
    expect(independent.digest("hex")).toBe(release.sourceSha256);
    expect(
      release.sourceManifest.files.every(
        ([path, hash]) => !path.startsWith(".") && /^[0-9a-f]{64}$/.test(hash),
      ),
    ).toBe(true);
  });
  it("validates each supplied SHA before falling back, without inventing a commit", () => {
    const root = fixture();
    expect(
      resolveBuildSha(root, { GITHUB_SHA: "unknown", VITE_GIT_SHA: ` ${"A".repeat(40)} ` }),
    ).toBe("a".repeat(40));
    expect(resolveBuildSha(root, { GITHUB_SHA: "12345678", VITE_GIT_SHA: "main" })).toBe("unknown");
  });
  it("reads the current checkout commit but never inherits a parent checkout's commit", () => {
    const root = fixture();
    const git = (args: string[]) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim();
    git(["init", "--quiet"]);
    git(["add", "."]);
    git([
      "-c",
      "user.name=TEST_ONLY",
      "-c",
      "user.email=test@example.invalid",
      "commit",
      "-qm",
      "TEST_ONLY",
    ]);
    expect(resolveBuildSha(root, {})).toBe(git(["rev-parse", "HEAD"]));
    const archive = join(root, "nested-archive");
    mkdirSync(archive);
    expect(resolveBuildSha(archive, {})).toBe("unknown");
  });
  it("is reproducible across paths, file creation order, times, and unrelated metadata", () => {
    const a = fixture(),
      b = fixture(true);
    utimesSync(join(b, "src/a.ts"), new Date(0), new Date(0));
    for (const path of [".env", ".git/config", "dist/result.js", "docs/review.md"]) {
      mkdirSync(dirname(join(b, path)), { recursive: true });
      writeFileSync(join(b, path), "TEST_ONLY ignored metadata");
    }
    expect(sourceFingerprint(a)).toBe(sourceFingerprint(b));
  });
  it.each([
    "src/a.ts",
    "public/icon.svg",
    "package-lock.json",
    "vite.config.ts",
    "scripts/release/build-release.ts",
  ])("changes when %s changes", (path) => {
    const root = fixture(),
      before = sourceFingerprint(root);
    writeFileSync(join(root, path), "TEST_ONLY changed input");
    expect(sourceFingerprint(root)).not.toBe(before);
  });
  it("includes paths as well as bytes", () => {
    const root = fixture(),
      before = sourceFingerprint(root);
    rmSync(join(root, "src/a.ts"));
    writeFileSync(join(root, "src/renamed.ts"), "export const a = 1;");
    expect(sourceFingerprint(root)).not.toBe(before);
  });
  it("refuses incomplete inputs or symlinks instead of producing a misleading identity", () => {
    const root = fixture();
    rmSync(join(root, "package-lock.json"));
    expect(() => sourceFingerprint(root)).toThrow();
    writeFileSync(join(root, "package-lock.json"), "{}");
    symlinkSync(join(root, "package.json"), join(root, "src/linked.json"));
    expect(() => sourceFingerprint(root)).toThrow(/symlink/);
  });
});
