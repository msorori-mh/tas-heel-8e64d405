import test from "node:test";
import assert from "node:assert/strict";

import {
  AppInteractiveResourceBridge,
  buildPackageCsp,
  computePackageDeterministicHash,
  computeSha256,
  generatePreviewHtmlBundle,
  parseHtmlContent,
  resolvePackageAssets,
  runInteractiveResourceImportDryRun,
  scanCodeSecurity,
  validateManifest,
  validatePackagePreflight,
  validateSingleHtmlPackage,
  ValidationCodes,
} from "./content-import/html-package/index.ts";

test("1. Valid Mind Map HTML Package", async () => {
  const html = `
    <!DOCTYPE html>
    <html dir="rtl">
    <head><title>الخريطة الذهنية للحيوان</title><link rel="stylesheet" href="assets/style.css"></head>
    <body>
      <div id="app">الخلية الحيوانية</div>
      <script src="assets/app.js"></script>
    </body>
    </html>
  `;

  const files = [
    {
      path: "index.html",
      size: Buffer.byteLength(html),
      isDir: false,
      contentSha256: await computeSha256(html),
      mimeType: "text/html",
      buffer: Buffer.from(html),
    },
    {
      path: "manifest.json",
      size: 150,
      isDir: false,
      contentSha256: "abc",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          resource_code: "MM-G12-BIO-001",
          entry_file: "index.html",
          version: 1,
          resource_type: "mind_map_html",
          offline_enabled: true,
        })
      ),
    },
    {
      path: "assets/style.css",
      size: 50,
      isDir: false,
      contentSha256: "def",
      mimeType: "text/css",
      buffer: Buffer.from("body { background: #fff; }"),
    },
    {
      path: "assets/app.js",
      size: 100,
      isDir: false,
      contentSha256: "ghi",
      mimeType: "application/javascript",
      buffer: Buffer.from("console.log('mindmap');"),
    },
  ];

  const res = await validateSingleHtmlPackage("MM-G12-BIO-001", files);
  assert.equal(res.isValid, true);
  assert.equal(res.resourceCode, "MM-G12-BIO-001");
  assert.equal(res.offlineEligible, true);
});

test("2. Valid Practical Experiment HTML Package", async () => {
  const html = `<!DOCTYPE html><html><head><title>تجربة قانون أوم</title></head><body><h1>تجربة الفيزياء</h1></body></html>`;
  const files = [
    {
      path: "index.html",
      size: Buffer.byteLength(html),
      isDir: false,
      contentSha256: await computeSha256(html),
      mimeType: "text/html",
      buffer: Buffer.from(html),
    },
    {
      path: "manifest.json",
      size: 100,
      isDir: false,
      contentSha256: "123",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({
          resource_code: "EXP-G12-PHY-001",
          entry_file: "index.html",
          version: 1,
          resource_type: "practical_experiment_html",
          offline_enabled: true,
        })
      ),
    },
  ];

  const res = await validateSingleHtmlPackage("EXP-G12-PHY-001", files);
  assert.equal(res.isValid, true);
  assert.equal(res.manifest?.resource_type, "practical_experiment_html");
});

test("3. Missing index.html Detection", async () => {
  const files = [
    {
      path: "manifest.json",
      size: 50,
      isDir: false,
      contentSha256: "11",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ resource_code: "RES-01", entry_file: "index.html", version: 1, resource_type: "mind_map_html", offline_enabled: true })),
    },
  ];
  const res = await validateSingleHtmlPackage("RES-01", files);
  assert.equal(res.isValid, false);
  assert.ok(res.findings.some((f) => f.code === ValidationCodes.MISSING_INDEX_HTML));
});

test("4. Missing manifest.json Detection", async () => {
  const html = "<html><body>Test</body></html>";
  const files = [
    {
      path: "index.html",
      size: Buffer.byteLength(html),
      isDir: false,
      contentSha256: "22",
      mimeType: "text/html",
      buffer: Buffer.from(html),
    },
  ];
  const res = await validateSingleHtmlPackage("RES-02", files);
  assert.equal(res.isValid, false);
  assert.ok(res.findings.some((f) => f.code === ValidationCodes.MISSING_MANIFEST_JSON));
});

test("5. Missing Referenced Asset Detection", async () => {
  const html = `<html><head><link rel="stylesheet" href="missing.css"></head><body></body></html>`;
  const files = [
    {
      path: "index.html",
      size: Buffer.byteLength(html),
      isDir: false,
      contentSha256: "33",
      mimeType: "text/html",
      buffer: Buffer.from(html),
    },
    {
      path: "manifest.json",
      size: 50,
      isDir: false,
      contentSha256: "44",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ resource_code: "RES-03", entry_file: "index.html", version: 1, resource_type: "mind_map_html", offline_enabled: true })),
    },
  ];
  const res = await validateSingleHtmlPackage("RES-03", files);
  assert.equal(res.isValid, false);
  assert.ok(res.findings.some((f) => f.code === ValidationCodes.MISSING_REFERENCED_ASSET));
});

test("6. Security Scans: Remote script, stylesheet, image rejected", () => {
  const code = `
    const cdn = "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/react.min.js";
    const img = "http://example.com/image.png";
  `;
  const findings = scanCodeSecurity(code, "app.js");
  assert.ok(findings.some((f) => f.code === ValidationCodes.REMOTE_NETWORK_URL_DETECTED));
});

test("7. Security Scans: Forbidden iframe inside imported HTML", async () => {
  const html = `<html><body><iframe src="https://evil.com"></iframe></body></html>`;
  const scan = await parseHtmlContent(html, "index.html");
  assert.ok(scan.findings.some((f) => f.code === ValidationCodes.FORBIDDEN_IFRAME_ELEMENT));
});

test("8. Security Scans: javascript: URL rejected", async () => {
  const html = `<html><body><a href="javascript:alert(1)">Click</a></body></html>`;
  const scan = await parseHtmlContent(html, "index.html");
  assert.ok(scan.findings.some((f) => f.code === ValidationCodes.JAVASCRIPT_URL_DETECTED));
});

test("9. Security Scans: Inline Event Handler (onclick) rejected", async () => {
  const html = `<html><body><button onclick="doSomething()">Click</button></body></html>`;
  const scan = await parseHtmlContent(html, "index.html");
  assert.ok(scan.findings.some((f) => f.code === ValidationCodes.INLINE_EVENT_HANDLER_DETECTED));
});

test("10. Security Scans: eval and new Function rejected", () => {
  const code1 = "eval('console.log(1)');";
  const f1 = scanCodeSecurity(code1, "test.js");
  assert.ok(f1.some((f) => f.code === ValidationCodes.FORBIDDEN_API_EVAL));

  const code2 = "const fn = new Function('return 1');";
  const f2 = scanCodeSecurity(code2, "test.js");
  assert.ok(f2.some((f) => f.code === ValidationCodes.FORBIDDEN_API_FUNCTION_CTOR));
});

test("11. Security Scans: fetch / XHR / WebSocket rejected", () => {
  const code = "fetch('/api/data'); const socket = new WebSocket('ws://test');";
  const findings = scanCodeSecurity(code, "test.js");
  assert.ok(findings.some((f) => f.code === ValidationCodes.FORBIDDEN_API_NETWORK_FETCH));
});

test("12. Security Scans: ServiceWorker registration rejected", () => {
  const code = "navigator.serviceWorker.register('/sw.js');";
  const findings = scanCodeSecurity(code, "test.js");
  assert.ok(findings.some((f) => f.code === ValidationCodes.SERVICE_WORKER_NOT_ALLOWED));
});

test("13. Preflight: Path Traversal rejected", () => {
  const files = [
    { path: "../secret.txt", size: 10, isDir: false, contentSha256: "a", mimeType: "text/plain" },
  ];
  const res = validatePackagePreflight(files);
  assert.equal(res.isValid, false);
  assert.ok(res.findings.some((f) => f.code === ValidationCodes.PATH_TRAVERSAL_DETECTED));
});

test("14. Preflight: Case Insensitive Path Collision rejected", () => {
  const files = [
    { path: "Assets/style.css", size: 10, isDir: false, contentSha256: "a", mimeType: "text/css" },
    { path: "assets/STYLE.css", size: 10, isDir: false, contentSha256: "b", mimeType: "text/css" },
  ];
  const res = validatePackagePreflight(files);
  assert.equal(res.isValid, false);
  assert.ok(res.findings.some((f) => f.code === ValidationCodes.CASE_INSENSITIVE_PATH_COLLISION));
});

test("15. Preflight: Forbidden executable extension rejected", () => {
  const files = [
    { path: "assets/malware.exe", size: 10, isDir: false, contentSha256: "a", mimeType: "application/x-msdownload" },
  ];
  const res = validatePackagePreflight(files);
  assert.equal(res.isValid, false);
  assert.ok(res.findings.some((f) => f.code === ValidationCodes.FORBIDDEN_FILE_EXTENSION));
});

test("16. Deterministic SHA-256 Package Hash Consistency", async () => {
  const filesA = [
    { path: "b.txt", size: 5, isDir: false, contentSha256: "11", mimeType: "text/plain" },
    { path: "a.txt", size: 5, isDir: false, contentSha256: "22", mimeType: "text/plain" },
  ];
  const filesB = [
    { path: "a.txt", size: 5, isDir: false, contentSha256: "22", mimeType: "text/plain" },
    { path: "b.txt", size: 5, isDir: false, contentSha256: "11", mimeType: "text/plain" },
  ];
  const hashA = await computePackageDeterministicHash(filesA);
  const hashB = await computePackageDeterministicHash(filesB);
  assert.equal(hashA, hashB);
});

test("17. CSP Builder generates strict directives with inline script hashes", () => {
  const hashes = ["'sha256-abc=='", "'sha256-def=='"];
  const csp = buildPackageCsp(hashes);
  assert.ok(csp.includes("default-src 'none'"));
  assert.ok(csp.includes("connect-src 'none'"));
  assert.ok(csp.includes("'sha256-abc=='"));
  assert.ok(csp.includes("'sha256-def=='"));
});

test("18. App Bridge Nonce and Event Validation", () => {
  const bridge = new AppInteractiveResourceBridge("MM-G12-BIO-001", 1);
  const nonce = bridge.getSessionNonce();

  const validPayload = {
    resource_code: "MM-G12-BIO-001",
    resource_version: 1,
    session_nonce: nonce,
    event_type: "resource_ready",
    event_sequence: 1,
    timestamp: Date.now(),
  };

  const res1 = bridge.validateEventPayload(validPayload);
  assert.equal(res1.isValid, true);

  const forgedNoncePayload = { ...validPayload, session_nonce: "fake-nonce" };
  const res2 = bridge.validateEventPayload(forgedNoncePayload);
  assert.equal(res2.isValid, false);
  assert.equal(res2.finding?.code, ValidationCodes.NONCE_MISMATCH);
});

test("19. App Bridge Monotonic Event Sequence Verification", () => {
  const bridge = new AppInteractiveResourceBridge("EXP-01", 1);
  const nonce = bridge.getSessionNonce();

  const msg1 = { resource_code: "EXP-01", resource_version: 1, session_nonce: nonce, event_type: "resource_ready", event_sequence: 1, timestamp: Date.now() };
  const msg2 = { resource_code: "EXP-01", resource_version: 1, session_nonce: nonce, event_type: "interaction", event_sequence: 2, timestamp: Date.now() };
  const msgDuplicate = { resource_code: "EXP-01", resource_version: 1, session_nonce: nonce, event_type: "interaction", event_sequence: 2, timestamp: Date.now() };

  assert.equal(bridge.validateEventPayload(msg1).isValid, true);
  assert.equal(bridge.validateEventPayload(msg2).isValid, true);
  assert.equal(bridge.validateEventPayload(msgDuplicate).isValid, false);
});

test("20. Dry-Run Engine validates Excel row & ZIP packages", async () => {
  const rows = [
    {
      resource_code: "MM-G12-BIO-001",
      grade_code: "grade-12",
      subject_code: "bio-g12",
      lesson_code: "LES-001",
      resource_type: "mind_map_html" as const,
      title_ar: "خريطة الأنسجة",
      alt_text_ar: "خريطة تفاعلية للأنسجة النباتية",
      package_path: "MM-G12-BIO-001",
      entry_file: "index.html",
      sort_order: 1,
      version: 1,
      offline_enabled: true,
    },
  ];

  const html = "<html><head><title>Test</title></head><body>OK</body></html>";
  const packageMap = {
    "MM-G12-BIO-001": [
      { path: "index.html", size: Buffer.byteLength(html), isDir: false, contentSha256: "1", mimeType: "text/html", buffer: Buffer.from(html) },
      { path: "manifest.json", size: 50, isDir: false, contentSha256: "2", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ resource_code: "MM-G12-BIO-001", entry_file: "index.html", version: 1, resource_type: "mind_map_html", offline_enabled: true })) },
    ],
  };

  const report = await runInteractiveResourceImportDryRun(rows, packageMap);
  assert.equal(report.summary.totalRows, 1);
  assert.equal(report.summary.validRows, 1);
  assert.equal(report.summary.validPackages, 1);
});
