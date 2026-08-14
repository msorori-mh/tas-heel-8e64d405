#!/usr/bin/env node
/**
 * Builds the official operator pack: the nine content templates (01–09) plus
 * the four Arabic guides, zipped into one downloadable folder so the operator
 * needs no developer help.
 *
 * Usage: node scripts/build-operator-pack.mjs
 */
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const TEMPLATES_DIR = path.join(ROOT, "public/content-import-templates");
const DOCS_DIR = path.join(ROOT, "docs/import");
const OUT_DIR = path.join(ROOT, "public/operator-pack");
const STAGE = path.join(ROOT, ".tmp-operator-pack/tamkeen-content-operator-pack");

const GUIDES = [
  "NAMING-CONVENTION.md",
  "OFFICIAL-CONTENT-CODE-REGISTRY.md",
  "DATA-DICTIONARY-AR.md",
  "OPERATOR-RUNBOOK-AR.md",
];

rmSync(path.dirname(STAGE), { recursive: true, force: true });
mkdirSync(path.join(STAGE, "templates"), { recursive: true });
mkdirSync(path.join(STAGE, "guides"), { recursive: true });
mkdirSync(OUT_DIR, { recursive: true });

cpSync(TEMPLATES_DIR, path.join(STAGE, "templates"), { recursive: true });
for (const guide of GUIDES) {
  cpSync(path.join(DOCS_DIR, guide), path.join(STAGE, "guides", guide));
}

const zipPath = path.join(OUT_DIR, "tamkeen-content-operator-pack.zip");
rmSync(zipPath, { force: true });
execFileSync("zip", ["-r", "-q", zipPath, path.basename(STAGE)], {
  cwd: path.dirname(STAGE),
});
rmSync(path.dirname(STAGE), { recursive: true, force: true });

console.log(`operator pack written: ${path.relative(ROOT, zipPath)}`);
