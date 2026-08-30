import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { accountDeletionRequiresPassword } from "../../src/lib/account-deletion.ts";

const read = (path) => readFileSync(path, "utf8");

const accountFn = read("src/lib/account.functions.ts");
const settings = read("src/routes/_authenticated/settings.tsx");
const deletionPage = read("src/routes/data-deletion.tsx");
const manifest = read("android/app/src/main/AndroidManifest.xml");
const gradle = read("android/app/build.gradle");
const workflow = read(".github/workflows/android-ci.yml");
const freeAccess = read("src/lib/student-free-access.ts");
const payments = read("src/routes/_authenticated/payments.index.tsx");
const paymentNew = read("src/routes/_authenticated/payments.new.tsx");
const wallet = read("src/routes/_authenticated/wallet.tsx");
const listing = read("docs/mobile/google-play/STORE-LISTING-AR.md");
const checklist = read("docs/mobile/google-play/RELEASE-CHECKLIST-2026-08-30.md");

describe("GOOGLE_PLAY_RELEASE_READINESS_01", () => {
  it("supports account deletion for password and OAuth-only identities", () => {
    expect(accountDeletionRequiresPassword(null)).toBe(true);
    expect(accountDeletionRequiresPassword({ app_metadata: { provider: "email" } })).toBe(true);
    expect(
      accountDeletionRequiresPassword({
        app_metadata: { provider: "google", providers: ["google"] },
      }),
    ).toBe(false);
    expect(
      accountDeletionRequiresPassword({
        app_metadata: { provider: "google", providers: ["google", "email"] },
      }),
    ).toBe(true);
  });

  it("keeps password re-authentication fail-closed while allowing OAuth sessions", () => {
    expect(accountFn).toMatch(/password: z\.string\(\)\.max\(1024[^\n]+\.optional\(\)/);
    expect(accountFn).toContain("accountDeletionRequiresPassword(claims)");
    expect(accountFn).toContain('throw new Error("كلمة المرور مطلوبة.")');
    expect(settings).toContain("const passwordRequired = accountDeletionRequiresPassword(user)");
    expect(settings).toContain("...(passwordRequired ? { password } : {})");
  });

  it("publishes an external deletion path that does not require reinstalling", () => {
    expect(deletionPage).toContain("تمكين");
    expect(deletionPage).toContain("لا تحتاج إلى تثبيت تطبيق تمكين الطالب من جديد");
    expect(deletionPage).toContain("support@studentamkeen.com");
    expect(deletionPage).toContain("ما الذي يُحذف");
  });

  it("disables cleartext traffic and Android backup", () => {
    expect(manifest).toContain('android:usesCleartextTraffic="false"');
    expect(manifest).toContain('android:allowBackup="false"');
    expect(manifest).not.toMatch(/android:usesCleartextTraffic="true"/);
  });

  it("fails release artifact builds when signing material is absent or incomplete", () => {
    expect(gradle).toContain("releaseArtifactRequested");
    expect(gradle).toContain("requiredSigningKeys");
    expect(gradle).toContain("Release signing is required");
    expect(gradle).toContain("Android release keystore file does not exist");
  });

  it("runs the AAB structure and native-library gate in both CI jobs", () => {
    const calls = workflow.match(/verify-play-aab\.sh/g) ?? [];
    expect(calls).toHaveLength(2);
    expect(workflow).toContain("app-debug.aab");
    expect(workflow).toContain("app-release.aab");
  });

  it("keeps student payments unavailable in the current free release", () => {
    expect(freeAccess).toContain("export const STUDENT_FREE_ACCESS = true");
    for (const source of [payments, paymentNew, wallet]) {
      expect(source).toContain("if (STUDENT_FREE_ACCESS)");
    }
  });

  it("records the required store assets without treating desktop captures as phone evidence", () => {
    expect(listing).toContain("1024×500");
    expect(listing).toContain("لقطتان على الأقل");
    expect(listing).toContain("ليست لقطات هاتف");
    expect(listing).toContain("feature-graphic-1024x500.png");
    expect(checklist).toContain("PASS_APPROVED_SOURCE");
    expect(checklist).toContain("TECH_PASS / VISUAL_REVIEW");
    expect(checklist).toContain("BLOCKED_FINAL_BUILD");
  });

  it("keeps the Arabic store title and short description within Play limits", () => {
    const title = "تمكين الطالب";
    const shortDescription =
      "مذاكرة ومراجعة واختبارات لطلاب الثانوية وفق المنهج اليمني، مع دعم دون اتصال.";
    expect([...title]).toHaveLength(12);
    expect([...shortDescription].length).toBeLessThanOrEqual(80);
    expect(listing).toContain(title);
    expect(listing).toContain(shortDescription);
  });

  it("keeps console-only and physical-device gates explicitly on hold", () => {
    for (const gate of [
      "HOLD_OWNER_CONSOLE",
      "HOLD_OWNER_SECRET",
      "HOLD_EXTERNAL",
      "HOLD_AFTER_UPLOAD",
      "PHYSICAL_PENDING",
    ]) {
      expect(checklist).toContain(gate);
    }
  });
});
