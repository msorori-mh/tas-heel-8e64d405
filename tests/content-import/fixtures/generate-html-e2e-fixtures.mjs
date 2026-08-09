#!/usr/bin/env node
/**
 * Operational E2E fixture generator for HTML content import pipeline.
 *
 * Creates real XLSX manifests and real ZIP packages under:
 *   tests/content-import/fixtures/html-e2e/
 *
 * Generated files are intentionally transient and should NOT be committed.
 * Run this generator before executing the operational E2E test harness.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";
import ExcelJS from "exceljs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "html-e2e");

const RESOURCES = [
  {
    code: "TEST_MM_E2E_001",
    type: "mind_map_html",
    title: "TEST_ONLY_TAMKEEN_HTML_E2E Mind Map",
    sortOrder: 1,
  },
  {
    code: "TEST_EXP_E2E_001",
    type: "practical_experiment_html",
    title: "TEST_ONLY_TAMKEEN_HTML_E2E Experiment",
    sortOrder: 2,
  },
  {
    code: "TEST_SUM_E2E_001",
    type: "summary_html",
    title: "TEST_ONLY_TAMKEEN_HTML_E2E Summary",
    sortOrder: 3,
  },
];

const COMMON_CSS = `
body {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  direction: rtl;
  padding: 1rem;
  background: #ffffff;
  color: #111827;
}
h1 { color: #2563eb; }
`.trim();

function buildManifest({ code, type, version = 1, entryFile = "index.html", requiredFiles = [] }) {
  return JSON.stringify(
    {
      resource_code: code,
      resource_type: type,
      version,
      entry_file: entryFile,
      offline_enabled: true,
      required_files: requiredFiles,
      content_sha256: "", // Populated by pipeline after hash computation.
    },
    null,
    2,
  );
}

function buildIndexHtml({ code, type, title }) {
  return `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <h1>${title}</h1>
  <p data-resource-code="${code}">Resource type: ${type}</p>
  <p>TEST_ONLY_TAMKEEN_HTML_E2E operational fixture</p>
  <script src="app.js"></script>
</body>
</html>`;
}

function buildSafeJs({ code }) {
  return `// Safe inline script for ${code}
console.log("Operational E2E fixture loaded:", "${code}");
const data = { resourceCode: "${code}", loadedAt: new Date().toISOString() };
window.__HTML_E2E_FIXTURE__ = data;
`;
}

async function buildValidZip(resource, version = 1) {
  const zip = new JSZip();
  const folder = zip.folder("package");
  folder.file(
    "index.html",
    buildIndexHtml({ code: resource.code, type: resource.type, title: resource.title }),
  );
  folder.file("style.css", COMMON_CSS);
  folder.file("app.js", buildSafeJs({ code: resource.code }));
  folder.file(
    "manifest.json",
    buildManifest({
      code: resource.code,
      type: resource.type,
      version,
      requiredFiles: ["index.html", "style.css", "app.js"],
    }),
  );
  return zip.generateAsync({ type: "uint8array" });
}

async function buildV2Zip(resource) {
  const zip = new JSZip();
  const folder = zip.folder("package");
  folder.file(
    "index.html",
    buildIndexHtml({ code: resource.code, type: resource.type, title: `${resource.title} V2` })
      .replace("<p>TEST_ONLY_TAMKEEN_HTML_E2E operational fixture</p>", "<p>TEST_ONLY_TAMKEEN_HTML_E2E operational fixture — version 2</p>"),
  );
  folder.file("style.css", COMMON_CSS);
  folder.file("app.js", buildSafeJs({ code: resource.code }).replace("loadedAt:", "version: 2, loadedAt:"));
  folder.file(
    "manifest.json",
    buildManifest({
      code: resource.code,
      type: resource.type,
      version: 2,
      requiredFiles: ["index.html", "style.css", "app.js"],
    }),
  );
  return zip.generateAsync({ type: "uint8array" });
}

async function buildMalformedZip() {
  return new TextEncoder().encode("this is not a zip file");
}

async function buildMissingManifestZip(resource) {
  const zip = new JSZip();
  const folder = zip.folder("package");
  folder.file("index.html", buildIndexHtml({ code: resource.code, type: resource.type, title: resource.title }));
  folder.file("style.css", COMMON_CSS);
  return zip.generateAsync({ type: "uint8array" });
}

async function buildInvalidEntryZip(resource) {
  const zip = new JSZip();
  const folder = zip.folder("package");
  // Path traversal attempt inside the ZIP.
  folder.file("../../../etc/passwd", "root:x:0:0:root:/root:/bin/bash");
  folder.file("index.html", buildIndexHtml({ code: resource.code, type: resource.type, title: resource.title }));
  folder.file(
    "manifest.json",
    buildManifest({ code: resource.code, type: resource.type }),
  );
  return zip.generateAsync({ type: "uint8array" });
}

async function buildProhibitedJsZip(resource) {
  const zip = new JSZip();
  const folder = zip.folder("package");
  folder.file("index.html", buildIndexHtml({ code: resource.code, type: resource.type, title: resource.title }));
  folder.file("style.css", COMMON_CSS);
  folder.file(
    "app.js",
    `// Prohibited JS for ${resource.code}\nconst secret = eval("window.parent.document.cookie");\n`,
  );
  folder.file(
    "manifest.json",
    buildManifest({ code: resource.code, type: resource.type }),
  );
  return zip.generateAsync({ type: "uint8array" });
}

async function buildBlockingFindingZip(resource) {
  const zip = new JSZip();
  const folder = zip.folder("package");
  folder.file(
    "index.html",
    `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head><title>Blocked</title></head>
<body>
  <div data-answer="super_secret_answer">Question text</div>
</body>
</html>`,
  );
  folder.file(
    "manifest.json",
    buildManifest({ code: resource.code, type: resource.type }),
  );
  return zip.generateAsync({ type: "uint8array" });
}

async function buildInvalidSubtypeManifestZip(resource) {
  const zip = new JSZip();
  const folder = zip.folder("package");
  folder.file("index.html", buildIndexHtml({ code: resource.code, type: resource.type, title: resource.title }));
  folder.file(
    "manifest.json",
    JSON.stringify({
      resource_code: resource.code,
      resource_type: "interactive_html", // Invalid subtype.
      version: 1,
      entry_file: "index.html",
      offline_enabled: true,
      required_files: [],
      content_sha256: "",
    }),
  );
  return zip.generateAsync({ type: "uint8array" });
}

const XLSX_HEADERS = [
  "resource_code",
  "grade_code",
  "subject_code",
  "lesson_code",
  "resource_type",
  "title_ar",
  "description_ar",
  "alt_text_ar",
  "package_path",
  "entry_file",
  "sort_order",
  "version",
  "offline_enabled",
  "orientation",
  "height_mode",
  "completion_mode",
  "completion_event",
  "minimum_interaction_seconds",
];

function baseRow(resource) {
  return {
    resource_code: resource.code,
    grade_code: "TEST_GRADE_E2E_001",
    subject_code: "TEST_SUBJECT_E2E_001",
    lesson_code: "test-lesson-html-e2e-001",
    resource_type: resource.type,
    title_ar: resource.title,
    description_ar: "TEST_ONLY_TAMKEEN_HTML_E2E description",
    alt_text_ar: resource.type === "mind_map_html" ? "alt text" : "",
    package_path: "package",
    entry_file: "index.html",
    sort_order: resource.sortOrder,
    version: 1,
    offline_enabled: "true",
    orientation: "auto",
    height_mode: "viewport",
    completion_mode: "view",
    completion_event: "",
    minimum_interaction_seconds: 0,
  };
}

async function buildXlsx(rows, filename) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("resources");
  worksheet.addRow(XLSX_HEADERS);
  for (const row of rows) {
    worksheet.addRow(XLSX_HEADERS.map((h) => row[h] ?? ""));
  }
  const buffer = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buffer);
}

async function writeFixtures() {
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(join(OUT_DIR, "valid"), { recursive: true });
  await mkdir(join(OUT_DIR, "invalid"), { recursive: true });
  await mkdir(join(OUT_DIR, "v2"), { recursive: true });

  for (const resource of RESOURCES) {
    const zip = await buildValidZip(resource, 1);
    await writeFile(join(OUT_DIR, "valid", `${resource.code}.zip`), zip);
  }

  for (const resource of RESOURCES) {
    const v2Zip = await buildV2Zip(resource);
    await writeFile(join(OUT_DIR, "v2", `${resource.code}_v2.zip`), v2Zip);
  }

  const malformed = await buildMalformedZip();
  await writeFile(join(OUT_DIR, "invalid", "malformed-zip.zip"), malformed);

  const missingManifest = await buildMissingManifestZip(RESOURCES[0]);
  await writeFile(join(OUT_DIR, "invalid", "missing-manifest.zip"), missingManifest);

  const invalidEntry = await buildInvalidEntryZip(RESOURCES[0]);
  await writeFile(join(OUT_DIR, "invalid", "invalid-entry.zip"), invalidEntry);

  const prohibitedJs = await buildProhibitedJsZip(RESOURCES[0]);
  await writeFile(join(OUT_DIR, "invalid", "prohibited-js.zip"), prohibitedJs);

  const blockingFinding = await buildBlockingFindingZip(RESOURCES[0]);
  await writeFile(join(OUT_DIR, "invalid", "blocking-finding.zip"), blockingFinding);

  const invalidSubtype = await buildInvalidSubtypeManifestZip(RESOURCES[0]);
  await writeFile(join(OUT_DIR, "invalid", "invalid-subtype.zip"), invalidSubtype);

  const validRows = RESOURCES.map(baseRow);
  const validXlsx = await buildXlsx(validRows, "valid-resources.xlsx");
  await writeFile(join(OUT_DIR, "valid-resources.xlsx"), validXlsx);

  const duplicateCodeRows = [
    baseRow(RESOURCES[0]),
    { ...baseRow(RESOURCES[1]), resource_code: RESOURCES[0].code },
  ];
  const duplicateXlsx = await buildXlsx(duplicateCodeRows, "duplicate-code.xlsx");
  await writeFile(join(OUT_DIR, "invalid", "duplicate-code.xlsx"), duplicateXlsx);

  const malformedRowRows = [
    {
      ...baseRow(RESOURCES[0]),
      resource_type: "interactive_html", // Invalid subtype in XLSX row.
    },
  ];
  const malformedXlsx = await buildXlsx(malformedRowRows, "malformed-row.xlsx");
  await writeFile(join(OUT_DIR, "invalid", "malformed-row.xlsx"), malformedXlsx);

  console.log(`HTML E2E fixtures generated under ${OUT_DIR}`);
}

writeFixtures().catch((err) => {
  console.error("Fixture generation failed:", err);
  process.exit(1);
});
