/**
 * 21B4-B — Android Offline Shell + Local Textbook Entry.
 *
 * Static/unit guards. Physical Android behaviour is verified separately on a
 * real device (see the 21B4-B report).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
/** Comments document what is forbidden; the guards must inspect code only. */
const stripComments = (src) =>
  src
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const registryTs = read("src/lib/offline/local-textbook-registry.ts");
const clientTs = read("src/lib/textbooks/subject-textbook-client.ts");
const pluginJava = read(
  "android/app/src/main/java/app/studentamkeen/tamkeen/TamkeenPdfViewerPlugin.java",
);
const offlineHtml = read("mobile/www/index.html");
const capConfig = read("capacitor.config.ts");

describe("registry contract", () => {
  it("1 — only OFFLINE_READY books are listed natively", () => {
    expect(pluginJava).toMatch(/optBoolean\("offlineReady", false\)/);
    expect(pluginJava).toMatch(/if \(!book\.optBoolean\("offlineReady", false\)\) return null;/);
  });

  it("2 — OFFLINE_READY is PDF_READY && READER_READY, not download alone", () => {
    expect(clientTs).toMatch(/offlineReady: isReaderReady\(\)/);
    expect(clientTs).toMatch(/markLocalTextbookOfflineReady|isReaderReady/);
  });

  it("3 — missing or truncated local files are rejected", () => {
    expect(pluginJava).toMatch(/!file\.exists\(\) \|\| !file\.isFile\(\) \|\| file\.length\(\) <= 0/);
    expect(pluginJava).toMatch(/recordedSize != file\.length\(\)/);
    expect(clientTs).toMatch(/unregisterLocalTextbook\(textbookId\)/);
  });

  it("4 — arbitrary path injection is rejected on both sides", () => {
    for (const src of [registryTs, pluginJava]) {
      expect(src).toMatch(/startsWith\("\/"\)/);
      expect(src).toMatch(/\.\./);
      expect(src).toMatch(/(:\/\/|:\\\/\\\/)/);
    }
    expect(pluginJava).toMatch(/getCanonicalPath\(\)/);
  });

  it("5 — the registry never persists secret-like fields", () => {
    const forbidden = [
      "access_token",
      "accessToken",
      "refresh_token",
      "refreshToken",
      "password",
      "signedUrl",
      "signed_url",
      "service_role",
      "apikey",
      "Authorization",
    ];
    const registryCode = stripComments(registryTs);
    for (const key of forbidden) expect(registryCode).not.toContain(key);
    expect(registryTs).toMatch(/REGISTRY_ALLOWED_FIELDS/);
    expect(registryTs).toMatch(/sanitizeRecord/);
  });

  it("8 — the offline page sends only a trusted identifier to native", () => {
    expect(offlineHtml).toMatch(/openTextbook\(\{ textbookId: textbookId \}\)/);
    expect(stripComments(offlineHtml)).not.toMatch(/localPath/);
    expect(offlineHtml).not.toMatch(/file:\/\//);
  });
});

describe("offline entry surface", () => {
  it("6 — no remote asset or network dependency", () => {
    expect(offlineHtml).not.toMatch(/<script[^>]+src=/i);
    expect(offlineHtml).not.toMatch(/<link[^>]+href=/i);
    expect(stripComments(offlineHtml)).not.toMatch(/fetch\(/);
    expect(offlineHtml).not.toMatch(/XMLHttpRequest/);
    expect(stripComments(offlineHtml)).not.toMatch(/supabase/i);
    expect(stripComments(offlineHtml)).not.toMatch(/https:\/\/(?!studentamkeen\.com)/);
    // The only remote reference allowed is the explicit retry navigation.
    expect(offlineHtml).toMatch(/var ORIGIN = "https:\/\/studentamkeen\.com"/);
  });

  it("7 — zero state and retry exist, and the page is Arabic RTL", () => {
    expect(offlineHtml).toMatch(/dir="rtl"/);
    expect(offlineHtml).toMatch(/كتبك المحفوظة/);
    expect(offlineHtml).toMatch(/لا توجد كتب محفوظة على هذا الجهاز حتى الآن/);
    expect(offlineHtml).toMatch(/إعادة المحاولة/);
    expect(offlineHtml).toMatch(/تعذر فتح النسخة المحفوظة/);
  });

  it("triggerEvent root cause — the bridge is never assumed to exist", () => {
    expect(offlineHtml).toMatch(/if \(!cap \|\| !cap\.Plugins \|\| !cap\.Plugins\.TamkeenPdfViewer\) return null;/);
  });

  it("Android loads the bundled page instead of chrome-error://", () => {
    expect(capConfig).toMatch(/errorPath: "index\.html"/);
    expect(capConfig).toMatch(/url: "https:\/\/studentamkeen\.com"/);
  });
});

describe("regression guards", () => {
  it("9 — the online delivery path is unchanged", () => {
    expect(clientTs).toMatch(/downloadAndCache\(\{/);
    expect(clientTs).toMatch(/kind: "textbook"/);
    expect(pluginJava).toMatch(/public void open\(PluginCall call\)/);
    expect(registryTs).toMatch(/if \(!isNativeRegistry\(\)\) return emptyRegistry\(\);/);
  });

  it("no second offline content system was introduced", () => {
    expect(stripComments(offlineHtml)).not.toMatch(/lesson|درس|dashboard/i);
    expect(registryTs).not.toMatch(/from "@\/integrations\/supabase/);
  });
});
