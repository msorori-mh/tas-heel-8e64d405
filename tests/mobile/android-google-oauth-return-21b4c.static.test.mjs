import { describe, it, expect, beforeEach } from "vitest";
import { readFileSync } from "node:fs";

import {
  NATIVE_OAUTH_REDIRECT_URL,
  parseNativeAuthCallback,
  isCallbackConsumed,
  markCallbackConsumed,
  resetConsumedCallbacks,
} from "../../src/lib/auth/native-oauth.ts";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

const manifest = read("android/app/src/main/AndroidManifest.xml");
const googleSignIn = read("src/lib/auth/google-sign-in.ts");
const nativeOauth = read("src/lib/auth/native-oauth.ts");
const handler = read("src/components/mobile/NativeAuthDeepLinkHandler.tsx");
const root = read("src/routes/__root.tsx");
const authRoute = read("src/routes/auth.tsx");

describe("21B4-C — Android Google OAuth return-to-app", () => {
  beforeEach(() => resetConsumedCallbacks());

  it("1. Android OAuth uses the native deep-link callback", () => {
    expect(NATIVE_OAUTH_REDIRECT_URL).toBe("app.studentamkeen.tamkeen://auth/callback");
    expect(googleSignIn).toMatch(/native \? NATIVE_OAUTH_REDIRECT_URL/);
    expect(manifest).toMatch(/android:scheme="app\.studentamkeen\.tamkeen"/);
    expect(manifest).toMatch(/android:host="auth"/);
    expect(manifest).toMatch(/android:path="\/callback"/);
    expect(manifest).toMatch(/android\.intent\.category\.BROWSABLE/);
  });

  it("2. Web OAuth keeps the https web callback", () => {
    expect(googleSignIn).toMatch(/getAuthRedirectUrl\("\/auth\/callback"\)/);
    // web branches preserved
    expect(googleSignIn).toMatch(/window\.top\?\.location\.origin === window\.location\.origin/);
    expect(googleSignIn).toMatch(/window\.location\.href = url/);
    // the auth route no longer holds a second, divergent implementation
    expect(authRoute).not.toMatch(/signInWithOAuth/);
  });

  it("3. the allowed callback is accepted", () => {
    const r = parseNativeAuthCallback("app.studentamkeen.tamkeen://auth/callback?code=abc12345&state=xyz");
    expect(r).toEqual({ kind: "code", code: "abc12345", state: "xyz" });
  });

  it("4. a wrong scheme is rejected", () => {
    expect(parseNativeAuthCallback("https://studentamkeen.com/auth/callback?code=abc12345").kind).toBe("ignored");
    expect(parseNativeAuthCallback("evil.app://auth/callback?code=abc12345").kind).toBe("ignored");
  });

  it("5. a wrong host or path is rejected", () => {
    expect(parseNativeAuthCallback("app.studentamkeen.tamkeen://evil/callback?code=abc12345").kind).toBe("ignored");
    expect(parseNativeAuthCallback("app.studentamkeen.tamkeen://auth/other?code=abc12345").kind).toBe("ignored");
    expect(parseNativeAuthCallback("app.studentamkeen.tamkeen://auth/callback/extra?code=abc12345").kind).toBe("ignored");
  });

  it("6. malformed input is rejected", () => {
    for (const bad of ["", "not a url", null, undefined, 42, "app.studentamkeen.tamkeen://auth/callback"]) {
      expect(parseNativeAuthCallback(bad).kind).toBe("ignored");
    }
    // code shape is validated too
    expect(parseNativeAuthCallback("app.studentamkeen.tamkeen://auth/callback?code=%20%20").kind).toBe("ignored");
  });

  it("7. tokens and secrets are never logged, and implicit tokens are refused", () => {
    for (const src of [nativeOauth, googleSignIn, handler]) {
      expect(src).not.toMatch(/console\.(log|warn|info|debug|error)/);
    }
    expect(nativeOauth).not.toMatch(/service_role|SERVICE_ROLE|client_secret/);
    const r = parseNativeAuthCallback(
      "app.studentamkeen.tamkeen://auth/callback#access_token=leak&refresh_token=leak",
    );
    expect(r.kind).toBe("error");
    expect(JSON.stringify(r)).not.toContain("leak");
  });

  it("8. duplicate callbacks are idempotent", () => {
    const url = "app.studentamkeen.tamkeen://auth/callback?code=dup12345";
    const first = parseNativeAuthCallback(url);
    expect(isCallbackConsumed(first.code)).toBe(false);
    markCallbackConsumed(first.code);
    expect(isCallbackConsumed(parseNativeAuthCallback(url).code)).toBe(true);
    expect(handler).toMatch(/isCallbackConsumed\(parsed\.code\)/);
  });

  it("9. session restoration runs in the WebView that owns the PKCE verifier", () => {
    expect(handler).toMatch(/exchangeCodeForSession\(parsed\.code\)/);
    expect(handler).toMatch(/navigate\(\{ to: "\/auth\/callback", replace: true \}\)/);
    expect(root).toMatch(/<NativeAuthDeepLinkHandler \/>/);
  });

  it("10. the external browser is closed on return", () => {
    expect(handler).toMatch(/await closeNativeAuthBrowser\(\)/);
    expect(nativeOauth).toMatch(/Browser\.close\(\)/);
    expect(nativeOauth).toMatch(/Browser\.open\(/);
  });

  it("11. failures return safely without a dead end", () => {
    expect(handler).toMatch(/تعذّر إكمال تسجيل الدخول/);
    expect(handler).toMatch(/جارٍ إكمال تسجيل الدخول/);
    expect(handler).toMatch(/if \(parsed\.kind === "ignored"\) return;/);
  });

  it("12. 21B4-B offline behaviour is unchanged", () => {
    const cap = read("capacitor.config.ts");
    expect(cap).toMatch(/errorPath: "index\.html"/);
    expect(cap).toMatch(/url: "https:\/\/studentamkeen\.com"/);
    expect(read("mobile/www/index.html")).toMatch(/كتبك المحفوظة/);
    // native shell only guards; no offline module touched by this batch
    expect(handler).not.toMatch(/textbook|offline/i);
  });
});
