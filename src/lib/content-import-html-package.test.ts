import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  AppInteractiveResourceBridge,
  buildPackageCsp,
  computePackageDeterministicHash,
  computeSha256,
  computeSha256Base64,
  generatePreviewHtmlBundle,
  parseHtmlContent,
  resolvePackageAssets,
  runInteractiveResourceImportDryRun,
  scanCodeSecurity,
  validateManifest,
  validatePackagePreflight,
  validateSingleHtmlPackage,
  ValidationCodes,
  normalizeUrlString,
  isUrlSafe,
  scanJavaScriptContent,
  scanCssContent,
  validateFileMimeAndBytes,
  parseMasterZipBuffer,
  evaluateRuntimeCapability,
} from "./content-import/html-package/index.ts";

test("1. Route registration: /admin/import exists in routeTree.gen.ts", () => {
  const routeTreePath = path.resolve("src/routeTree.gen.ts");
  const routeTreeContent = fs.readFileSync(routeTreePath, "utf-8");

  assert.ok(
    !routeTreeContent.includes("admin/content-review"),
    "The separate review route is retired; publishing happens in /admin/import"
  );

  assert.ok(
    routeTreeContent.includes("admin/import") || routeTreeContent.includes("AuthenticatedAdminImportRoute"),
    "Route tree manifest must contain /admin/import"
  );
});

test("2. CSP Base64 hash format: sha256-<BASE64> and exact bytes calculation", async () => {
  const scriptContent = "console.log('hello csp');";
  const hash = await computeSha256Base64(scriptContent);
  assert.ok(hash.startsWith("'sha256-"), "CSP hash must start with 'sha256-");
  assert.ok(hash.endsWith("'"), "CSP hash must end with '");
  assert.ok(!/[0-9a-f]{64}/.test(hash.slice(8, -1)), "CSP hash must be Base64, not hex");
});

test("3. CSP Builder includes bridge script hash and Base64 inline script hashes", async () => {
  const scriptHash = await computeSha256Base64("alert(1)");
  const csp = await buildPackageCsp([scriptHash], "MM-01", 1, "nonce-123");
  assert.ok(csp.includes("default-src 'none'"));
  assert.ok(csp.includes("connect-src 'none'"));
  assert.ok(csp.includes("frame-src 'none'"));
  assert.ok(csp.includes("object-src 'none'"));
  assert.ok(csp.includes("base-uri 'none'"));
  assert.ok(csp.includes("form-action 'none'"));
  assert.ok(csp.includes(scriptHash));
});

test("4. URL Normalization: percent-encoded javascript URLs rejected (java%73cript:)", () => {
  const check = isUrlSafe("java%73cript:alert(1)");
  assert.equal(check.safe, false);
});

test("5. URL Normalization: HTML entity encoded javascript URLs rejected (java&#x73;cript:)", () => {
  const check = isUrlSafe("java&#x73;cript:alert(1)");
  assert.equal(check.safe, false);
});

test("6. Structural Parser: Unquoted event handler rejected (onerror=alert(1))", async () => {
  const html = `<img src=x onerror=alert(1)>`;
  const scan = await parseHtmlContent(html, "index.html");
  assert.ok(scan.findings.some((f) => f.code === ValidationCodes.INLINE_EVENT_HANDLER_DETECTED));
});

test("7. Structural Parser: Mixed-case event handler rejected (ONERROR= / OnErRoR=)", async () => {
  const html = `<div OnErRoR="alert(1)">Test</div>`;
  const scan = await parseHtmlContent(html, "index.html");
  assert.ok(scan.findings.some((f) => f.code === ValidationCodes.INLINE_EVENT_HANDLER_DETECTED));
});

test("8. Structural Parser: Meta refresh tag rejected (<meta http-equiv=\"refresh\">)", async () => {
  const html = `<html><head><meta http-equiv="refresh" content="0;url=http://evil.com"></head></html>`;
  const scan = await parseHtmlContent(html, "index.html");
  assert.ok(scan.findings.some((f) => f.code === ValidationCodes.FORBIDDEN_META_REFRESH));
});

test("9. Structural Parser: Base href element rejected (<base href=...>", async () => {
  const html = `<html><head><base href="https://evil.com/"></head></html>`;
  const scan = await parseHtmlContent(html, "index.html");
  assert.ok(scan.findings.some((f) => f.code === ValidationCodes.FORBIDDEN_BASE_ELEMENT));
});

test("10. Structural Parser: <object> and <embed> elements rejected", async () => {
  const html = `<html><body><object data="evil.swf"></object><embed src="evil.swf"></body></html>`;
  const scan = await parseHtmlContent(html, "index.html");
  assert.ok(scan.findings.some((f) => f.code === ValidationCodes.FORBIDDEN_OBJECT_EMBED_ELEMENT));
});

test("11. JS Scanner: navigator.sendBeacon rejected", () => {
  const code = "navigator.sendBeacon('/log', data);";
  const findings = scanJavaScriptContent(code, "test.js");
  assert.ok(findings.some((f) => f.code === ValidationCodes.FORBIDDEN_API_NETWORK_FETCH));
});

test("12. JS Scanner: Worker / SharedWorker / ServiceWorker rejected", () => {
  const code = "const w = new Worker('w.js'); const sw = navigator.serviceWorker.register('/sw.js');";
  const findings = scanJavaScriptContent(code, "test.js");
  assert.ok(findings.some((f) => f.code === ValidationCodes.SERVICE_WORKER_NOT_ALLOWED));
});

test("13. JS Scanner: RTCPeerConnection (WebRTC) rejected", () => {
  const code = "const pc = new RTCPeerConnection();";
  const findings = scanJavaScriptContent(code, "test.js");
  assert.ok(findings.some((f) => f.code === ValidationCodes.FORBIDDEN_WEBRTC));
});

test("14. JS Scanner: Dynamic import() rejected", () => {
  const code = "import('./module.js').then(m => m.run());";
  const findings = scanJavaScriptContent(code, "test.js");
  assert.ok(findings.some((f) => f.code === ValidationCodes.FORBIDDEN_DYNAMIC_IMPORT));
});

test("15. JS Scanner: Blob script / createObjectURL creation rejected", () => {
  const code = "const url = URL.createObjectURL(new Blob(['alert(1)']));";
  const findings = scanJavaScriptContent(code, "test.js");
  assert.ok(findings.some((f) => f.code === ValidationCodes.FORBIDDEN_BLOB_SCRIPT_CREATION));
});

test("16. Structural Parser: srcdoc attribute rejected", async () => {
  const html = `<iframe srcdoc="<script>alert(1)</script>"></iframe>`;
  const scan = await parseHtmlContent(html, "index.html");
  assert.ok(scan.findings.some((f) => f.code === ValidationCodes.FORBIDDEN_SRCDOC_ATTRIBUTE));
});

test("17. Structural Parser: Dangerous srcset URL rejected", async () => {
  const html = `<img src="a.png" srcset="http://evil.com/b.png 2x">`;
  const scan = await parseHtmlContent(html, "index.html");
  assert.ok(scan.findings.some((f) => f.code === ValidationCodes.REMOTE_NETWORK_URL_DETECTED));
});

test("18. SVG active content rejected (<svg><script>)", async () => {
  const html = `<svg><script>alert('svg xss')</script></svg>`;
  const scan = await parseHtmlContent(html, "index.html");
  assert.ok(scan.findings.some((f) => f.code === ValidationCodes.FORBIDDEN_SVG_ACTIVE_CONTENT));
});

test("19. MathML active link rejected (<math><maction>)", async () => {
  const html = `<math><maction actiontype="toggle"><mi>x</mi></maction></math>`;
  const scan = await parseHtmlContent(html, "index.html");
  assert.ok(scan.findings.some((f) => f.code === ValidationCodes.FORBIDDEN_MATHML_ACTIVE_CONTENT));
});

test("20. CSS Scanner: @import rule rejected", () => {
  const css = `@import url('http://evil.com/style.css');`;
  const findings = scanCssContent(css, "style.css");
  assert.ok(findings.some((f) => f.code === ValidationCodes.CSS_IMPORT_NOT_ALLOWED));
});

test("21. CSS Scanner: External url(...) rejected", () => {
  const css = `body { background: url('https://evil.com/bg.png'); }`;
  const findings = scanCssContent(css, "style.css");
  assert.ok(findings.some((f) => f.code === ValidationCodes.FORBIDDEN_CSS_EXTERNAL_URL));
});

test("22. Preflight: Canonical path traversal (%2e%2e/) rejected", () => {
  const files = [
    { path: "%2e%2e/secret.txt", size: 10, isDir: false, contentSha256: "a", mimeType: "text/plain" },
  ];
  const res = validatePackagePreflight(files);
  assert.equal(res.isValid, false);
  assert.ok(res.findings.some((f) => f.code === ValidationCodes.PATH_TRAVERSAL_DETECTED));
});

test("23. MIME Validation: Magic bytes mismatch rejected (fake PNG)", () => {
  const fakePngBuffer = new TextEncoder().encode("NOT_A_PNG_HEADER_BYTES");
  const res = validateFileMimeAndBytes("image.png", fakePngBuffer);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.MIME_MISMATCH_DETECTED);
});

test("24. MIME Validation: Valid PNG magic bytes accepted", () => {
  const validPngBuffer = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const res = validateFileMimeAndBytes("image.png", validPngBuffer);
  assert.equal(res.isValid, true);
});

test("25. Message Bridge: Invalid event source rejection", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const fakeWin = {} as WindowProxy;
  const targetWin = {} as WindowProxy;

  const validPayload = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "resource_ready",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: {},
  };

  const res = bridge.validateEventPayload(validPayload, fakeWin, targetWin);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.INVALID_EVENT_SOURCE);
});

test("26. Message Bridge: Payload byte-size limit (>10KB) rejected", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const win = {} as WindowProxy;
  const largePayload = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click", target: "x".repeat(15000) },
  };

  const res = bridge.validateEventPayload(largePayload, win, win);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.PAYLOAD_SIZE_LIMIT_EXCEEDED);
});

test("27. Message Bridge: Rate limit (>20 events/sec) rejected", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const nonce = bridge.getSessionNonce();
  const win = {} as WindowProxy;

  for (let seq = 1; seq <= 20; seq++) {
    const msg = {
      resource_code: "RES-01",
      resource_version: 1,
      session_nonce: nonce,
      event_type: "interaction",
      event_sequence: seq,
      timestamp: Date.now(),
      payload: { interaction_type: "click" },
    };
    assert.equal(bridge.validateEventPayload(msg, win, win).isValid, true);
  }

  // 21st message should fail rate limit
  const msg21 = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: nonce,
    event_type: "interaction",
    event_sequence: 21,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };
  const res21 = bridge.validateEventPayload(msg21, win, win);
  assert.equal(res21.isValid, false);
  assert.equal(res21.finding?.code, ValidationCodes.EVENT_RATE_LIMIT_EXCEEDED);
});

test("28. Capacitor Capability Gate: Disabled fail-closed on mock native platform", () => {
  // Simulate Capacitor environment on global window
  const originalWin = (globalThis as any).window;
  try {
    (globalThis as any).window = {
      Capacitor: { isNativePlatform: () => true },
      document: {},
      location: {},
    };
    const cap = evaluateRuntimeCapability();
    assert.equal(cap.allowed, false);
    assert.ok(cap.userMessage?.includes("المحتوى التفاعلي متاح حالياً في نسخة الويب"));
  } finally {
    (globalThis as any).window = originalWin;
  }
});

test("29. ZIP Ingestion: Master ZIP empty buffer rejected", async () => {
  const res = await parseMasterZipBuffer(new Uint8Array(0));
  assert.equal(res.isValid, false);
  assert.equal(res.findings[0].code, ValidationCodes.ZIP_INGESTION_FAILED);
});

test("30. Deterministic SHA-256 Package Hash differs on 1 byte change", async () => {
  const filesA = [
    { path: "index.html", size: 10, isDir: false, contentSha256: "hash1", mimeType: "text/html" },
  ];
  const filesB = [
    { path: "index.html", size: 10, isDir: false, contentSha256: "hash2", mimeType: "text/html" },
  ];

  const hashA = await computePackageDeterministicHash(filesA);
  const hashB = await computePackageDeterministicHash(filesB);
  assert.notEqual(hashA, hashB);
});

test("31. CSP Bridge exact bytes: srcDoc extracted script SHA-256 matches CSP literally and differs on 1 byte change", async () => {
  const nonce = "test-nonce-123";
  const csp = await buildPackageCsp([], "RES-TEST", 1, nonce);
  const srcDoc = generatePreviewHtmlBundle(
    "<html><head></head><body></body></html>",
    [],
    csp,
    "RES-TEST",
    1,
    nonce
  );

  const match = srcDoc.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, "srcDoc must contain an inline <script> element for bridge");
  const extractedScript = match[1];

  const computedHash = await computeSha256Base64(extractedScript);
  assert.ok(
    csp.includes(computedHash),
    `CSP header (${csp}) must literally include extracted bridge script hash (${computedHash})`
  );

  const alteredScript = extractedScript + " ";
  const alteredHash = await computeSha256Base64(alteredScript);
  assert.equal(
    csp.includes(alteredHash),
    false,
    "Changing 1 byte in bridge script must alter SHA-256 hash so it no longer matches CSP"
  );
});

test("32. Message Bridge: Stale timestamp rejected (< session start)", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const nonce = bridge.getSessionNonce();
  const win = {} as WindowProxy;
  const payload = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: nonce,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now() - 100000,
    payload: { interaction_type: "click" },
  };
  const res = bridge.validateEventPayload(payload, win, win);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.INVALID_EVENT_SCHEMA);
});

test("33. Message Bridge: Future timestamp rejected (> 60s in future)", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const nonce = bridge.getSessionNonce();
  const win = {} as WindowProxy;
  const payload = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: nonce,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now() + 120000,
    payload: { interaction_type: "click" },
  };
  const res = bridge.validateEventPayload(payload, win, win);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.INVALID_EVENT_SCHEMA);
});

test("34. Message Bridge: UTF-8 multi-byte payload (> 10KB in bytes) rejected", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const nonce = bridge.getSessionNonce();
  const win = {} as WindowProxy;
  const largeArabicData = "اختبار خريطة ذهنية 🧬 ".repeat(400);
  const payload = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: nonce,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click", target: largeArabicData },
  };

  const res = bridge.validateEventPayload(payload, win, win);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.PAYLOAD_SIZE_LIMIT_EXCEEDED);
});

test("35. Message Bridge: Array payload rejected as invalid schema", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const win = {} as WindowProxy;
  const res = bridge.validateEventPayload([1, 2, 3], win, win);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.INVALID_EVENT_SCHEMA);
});

test("36. Message Bridge: Nonce mismatch rejected", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const win = {} as WindowProxy;
  const payload = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: "wrong-nonce-val",
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };
  const res = bridge.validateEventPayload(payload, win, win);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.NONCE_MISMATCH);
});

test("37. Message Bridge: Sequence replay and out-of-order rejected", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const nonce = bridge.getSessionNonce();
  const win = {} as WindowProxy;

  const msg1 = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: nonce,
    event_type: "interaction",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };
  assert.equal(bridge.validateEventPayload(msg1, win, win).isValid, true);

  // Duplicate sequence 1
  const resDup = bridge.validateEventPayload(msg1, win, win);
  assert.equal(resDup.isValid, false);
  assert.equal(resDup.finding?.code, ValidationCodes.INVALID_EVENT_SCHEMA);

  // Non-positive sequence 0
  const msg0 = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: nonce,
    event_type: "interaction",
    event_sequence: 0,
    timestamp: Date.now(),
    payload: { interaction_type: "click" },
  };
  const res0 = bridge.validateEventPayload(msg0, win, win);
  assert.equal(res0.isValid, false);
  assert.equal(res0.finding?.code, ValidationCodes.INVALID_EVENT_SCHEMA);
});

test("38. URL Normalization fail-closed: java%73cript:, java%2573cript:, java%252573cript:, java%25252573cript:, java%2525252573cript: all rejected", () => {
  const attackVectors = [
    "java%73cript:alert(1)",
    "java%2573cript:alert(1)",
    "java%252573cript:alert(1)",
    "java%25252573cript:alert(1)",
    "java%2525252573cript:alert(1)",
  ];

  for (const url of attackVectors) {
    const check = isUrlSafe(url);
    assert.equal(check.safe, false, `URL vector must be rejected as unsafe: ${url}`);
  }
});

test("39. URL Normalization fail-closed: HTML entities + percent encoding and control whitespace rejected", () => {
  const check1 = isUrlSafe("java%26%23x73%3Bcript:alert(1)");
  assert.equal(check1.safe, false);

  const check2 = isUrlSafe("java%0a%0d%09script:alert(1)");
  assert.equal(check2.safe, false);
});

test("40. URL Normalization fail-closed: Ambiguous deep encoding or malformed percent sequence rejected", () => {
  const checkMalformed = isUrlSafe("java%7script:alert(1)");
  assert.equal(checkMalformed.safe, false);

  const checkAmbiguous = isUrlSafe("path/file%252525252525252525.png");
  assert.equal(checkAmbiguous.safe, false);
});

test("41. Source binding: missing expectedWindow -> REJECT", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const win = {} as WindowProxy;
  const msg = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "resource_ready",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: {},
  };
  const res = bridge.validateEventPayload(msg, win, undefined);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.INVALID_EVENT_SOURCE);
});

test("42. Source binding: null expectedWindow -> REJECT", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const win = {} as WindowProxy;
  const msg = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "resource_ready",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: {},
  };
  const res = bridge.validateEventPayload(msg, win, null);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.INVALID_EVENT_SOURCE);
});

test("43. Source binding: wrong event.source -> REJECT", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const fakeWin = {} as WindowProxy;
  const targetWin = {} as WindowProxy;
  const msg = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "resource_ready",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: {},
  };
  const res = bridge.validateEventPayload(msg, fakeWin, targetWin);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.INVALID_EVENT_SOURCE);
});

test("44. Source binding: correct active iframe window -> PASS", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const activeWin = {} as WindowProxy;
  const msg = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "resource_ready",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: {},
  };
  const res = bridge.validateEventPayload(msg, activeWin, activeWin);
  assert.equal(res.isValid, true);
});

test("45. Source binding: stale previous iframe window -> REJECT", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const staleWin = {} as WindowProxy;
  const newActiveWin = {} as WindowProxy;
  const msg = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "resource_ready",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: {},
  };
  const res = bridge.validateEventPayload(msg, staleWin, newActiveWin);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.INVALID_EVENT_SOURCE);
});

test("46. Top-level schema: extra field -> REJECT", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const win = {} as WindowProxy;
  const msg = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "resource_ready",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: {},
    unauthorized_extra_field: true,
  };
  const res = bridge.validateEventPayload(msg, win, win);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.INVALID_EVENT_SCHEMA);
});

test("47. Top-level schema: missing field -> REJECT", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const win = {} as WindowProxy;
  const msg = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "resource_ready",
    event_sequence: 1,
    timestamp: Date.now(),
    // payload missing
  };
  const res = bridge.validateEventPayload(msg, win, win);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.INVALID_EVENT_SCHEMA);
});

test("48. Payload schema: step_completed without payload -> REJECT", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const win = {} as WindowProxy;
  const msg = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "step_completed",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: {},
  };
  const res = bridge.validateEventPayload(msg, win, win);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.INVALID_EVENT_SCHEMA);
});

test("49. Payload schema: step_completed without step -> REJECT", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const win = {} as WindowProxy;
  const msg = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "step_completed",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { wrong_key: "step_1" },
  };
  const res = bridge.validateEventPayload(msg, win, win);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.INVALID_EVENT_SCHEMA);
});

test("50. Payload schema: extra payload field -> REJECT", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const win = {} as WindowProxy;
  const msg = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "step_completed",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { step: "step_1", extra_hack: "malicious" },
  };
  const res = bridge.validateEventPayload(msg, win, win);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.INVALID_EVENT_SCHEMA);
});

test("51. Payload schema: valid step_completed -> PASS", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const win = {} as WindowProxy;
  const msg = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "step_completed",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { step: "step_1" },
  };
  const res = bridge.validateEventPayload(msg, win, win);
  assert.equal(res.isValid, true);
  assert.equal(res.payload?.payload?.step, "step_1");
});

test("52. Payload schema: experiment_completed with score -> REJECT", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const win = {} as WindowProxy;
  const msg = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "experiment_completed",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { score: 100, trusted_result: true },
  };
  const res = bridge.validateEventPayload(msg, win, win);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.INVALID_EVENT_SCHEMA);
});

test("53. Payload schema: resize_request with Infinity -> REJECT", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const win = {} as WindowProxy;
  const msg = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "resize_request",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { height: Infinity },
  };
  const res = bridge.validateEventPayload(msg, win, win);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.INVALID_EVENT_SCHEMA);
});

test("54. Payload schema: resource_error without error_code -> REJECT", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const win = {} as WindowProxy;
  const msg = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "resource_error",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { message: "Error occurred without code" },
  };
  const res = bridge.validateEventPayload(msg, win, win);
  assert.equal(res.isValid, false);
  assert.equal(res.finding?.code, ValidationCodes.INVALID_EVENT_SCHEMA);
});

test("55. Payload schema: resource_error with HTML or stack trace -> REJECT", () => {
  const bridge = new AppInteractiveResourceBridge("RES-01", 1);
  const win = {} as WindowProxy;
  const msgHtml = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "resource_error",
    event_sequence: 1,
    timestamp: Date.now(),
    payload: { error_code: "ERR_01", message: "<script>alert(1)</script>" },
  };
  const resHtml = bridge.validateEventPayload(msgHtml, win, win);
  assert.equal(resHtml.isValid, false);
  assert.equal(resHtml.finding?.code, ValidationCodes.INVALID_EVENT_SCHEMA);

  const msgStack = {
    resource_code: "RES-01",
    resource_version: 1,
    session_nonce: bridge.getSessionNonce(),
    event_type: "resource_error",
    event_sequence: 2,
    timestamp: Date.now(),
    payload: { error_code: "ERR_01", message: "Error at main.js (line 5)" },
  };
  const resStack = bridge.validateEventPayload(msgStack, win, win);
  assert.equal(resStack.isValid, false);
  assert.equal(resStack.finding?.code, ValidationCodes.INVALID_EVENT_SCHEMA);
});
