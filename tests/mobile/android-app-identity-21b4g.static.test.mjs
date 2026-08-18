import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const capacitor = read("capacitor.config.ts");
const gradle = read("android/app/build.gradle");
const manifest = read("android/app/src/main/AndroidManifest.xml");
const strings = read("android/app/src/main/res/values/strings.xml");
const mainActivity = read("android/app/src/main/java/app/studentamkeen/tamkeen/MainActivity.java");
const assetlinks = read("docs/mobile/assetlinks.template.json");

const PKG = "app.studentamkeen.tamkeen";

describe("21B4G — Android app identity and release readiness", () => {
  it("1. Capacitor appId matches Android applicationId", () => {
    expect(capacitor).toContain(`appId: "${PKG}"`);
    expect(gradle).toContain(`applicationId "${PKG}"`);
  });

  it("2. namespace, manifest package association and MainActivity package agree", () => {
    expect(gradle).toContain(`namespace = "${PKG}"`);
    expect(mainActivity.startsWith(`package ${PKG};`)).toBe(true);
    expect(strings).toContain(`<string name="package_name">${PKG}</string>`);
  });

  it("3. the visible Android app name is تمكين الطالب", () => {
    expect(strings).toContain('<string name="app_name">تمكين الطالب</string>');
    expect(strings).toContain('<string name="title_activity_main">تمكين الطالب</string>');
    expect(capacitor).toContain('appName: "تمكين الطالب"');
    expect(manifest).toContain('android:label="@string/app_name"');
  });

  it("4. no Lovable / tas-heel branding in launcher identity", () => {
    for (const source of [strings, manifest, gradle, capacitor]) {
      expect(source).not.toMatch(/lovable/i);
      expect(source).not.toMatch(/tas-?heel/i);
    }
  });

  it("5. the 21B4C-R1 deep-link contract is intact", () => {
    expect(manifest).toMatch(/android:scheme="https"/);
    expect(manifest).toMatch(/android:host="studentamkeen\.com"/);
    expect(manifest).toMatch(/android:pathPrefix="\/auth\/mobile-callback"/);
    expect(manifest).toMatch(new RegExp(`android:scheme="${PKG}"`));
    expect(manifest).toMatch(/android:autoVerify="false"/);
  });

  it("6. dev.lovable.build is not produced by the Tamkeen Android build", () => {
    const out = execSync(
      "rg -l 'dev\\.lovable\\.build' android capacitor.config.ts mobile || true",
      { cwd: new URL("../../", import.meta.url).pathname, encoding: "utf8" },
    );
    expect(out.trim()).toBe("");
  });

  it("7. no release keystore is committed", () => {
    const out = execSync(
      "git ls-files | rg '\\.(jks|keystore)$' || true",
      { cwd: new URL("../../", import.meta.url).pathname, encoding: "utf8" },
    );
    expect(out.trim()).toBe("");
  });

  it("8. no signing secrets are committed; signing reads untracked properties", () => {
    expect(existsSync(new URL("../../android/keystore.properties", import.meta.url))).toBe(false);
    expect(gradle).toContain('rootProject.file("keystore.properties")');
    expect(gradle).not.toMatch(/storePassword\s+["'][^"']*["']/);
    expect(gradle).not.toMatch(/keyPassword\s+["'][^"']*["']/);
  });

  it("9. the assetlinks template matches applicationId and carries no fake fingerprint", () => {
    const parsed = JSON.parse(assetlinks);
    expect(parsed[0].target.package_name).toBe(PKG);
    expect(parsed[0].target.sha256_cert_fingerprints).toEqual(["<RELEASE_SHA256>"]);
    expect(existsSync(new URL("../../public/.well-known/assetlinks.json", import.meta.url))).toBe(
      false,
    );
  });

  it("10. versioning source of truth stays in android/app/build.gradle", () => {
    expect(gradle).toMatch(/versionCode\s+\d+/);
    expect(gradle).toMatch(/versionName\s+"\d+\.\d+(\.\d+)?"/);
  });
});
