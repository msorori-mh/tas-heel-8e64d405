import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const variables = read("android/variables.gradle");
const gradle = read("android/app/build.gradle");
const capacitor = read("capacitor.config.ts");
const manifest = read("android/app/src/main/AndroidManifest.xml");
const workflow = read(".github/workflows/android-ci.yml");
const supabaseClient = read("src/integrations/supabase/client.ts");
const nativeAuthStorage = read("src/integrations/supabase/nativeAuthStorage.ts");

describe("ANDROID_PLAY_TESTING_V1_01", () => {
  it("targets the Play requirement effective 31 August 2026", () => {
    expect(variables).toContain("compileSdkVersion = 36");
    expect(variables).toContain("targetSdkVersion = 36");
  });

  it("freezes the Play identity and offline testing release version", () => {
    expect(capacitor).toContain('appId: "app.studentamkeen.tamkeen"');
    expect(gradle).toContain('applicationId "app.studentamkeen.tamkeen"');
    expect(gradle).toContain("versionCode 3");
    expect(gradle).toContain('versionName "1.0.2"');
  });

  it("loads only the production HTTPS origin and refuses cleartext", () => {
    expect(capacitor).toContain('url: "https://studentamkeen.com"');
    expect(capacitor).toContain("cleartext: false");
    expect(capacitor).toContain("allowMixedContent: false");
    expect(manifest).toContain("android.permission.INTERNET");
    expect(manifest).toContain('android:usesCleartextTraffic="false"');
  });

  it("keeps restorable server state and authentication data out of Android backup", () => {
    expect(manifest).toContain('android:allowBackup="false"');
  });

  it("persists Supabase refresh sessions outside the disposable Android WebView", () => {
    expect(supabaseClient).toContain("persistentAuthStorage() ?? brokeredPreviewStorage()");
    expect(nativeAuthStorage).toContain("Capacitor.isNativePlatform()");
    expect(nativeAuthStorage).toContain("Preferences");
    expect(nativeAuthStorage).toContain("legacyValue");
    expect(workflow).toContain('"src/integrations/supabase/**"');
  });

  it("keeps release signing fail-closed and out of source control", () => {
    expect(gradle).toContain('rootProject.file("keystore.properties")');
    expect(gradle).toContain("releaseArtifactRequested");
    expect(gradle).toContain("Release signing is required");
    expect(gradle).not.toMatch(/storePassword\s+["'][^"']+["']/);
    expect(gradle).not.toMatch(/keyPassword\s+["'][^"']+["']/);
  });

  it("builds the signed AAB only from a manual, secret-backed workflow", () => {
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("github.event_name == 'workflow_dispatch'");
    expect(workflow).toContain("ANDROID_UPLOAD_KEYSTORE_BASE64");
    expect(workflow).toContain("ANDROID_UPLOAD_KEYSTORE_PASSWORD");
    expect(workflow).toContain(
      "jarsigner -verify app/build/outputs/bundle/release/app-release.aab",
    );
    expect(workflow).not.toContain("jarsigner -verify -strict");
    expect(workflow).toContain("keytool -list");
    expect(workflow).toContain("rm -f android/keystore.properties");
    expect(workflow).not.toContain("CHANGE_ME");
  });
});
