import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

const styles = read("src/styles.css");
const shell = read("src/components/student/StudentShell.tsx");
const authenticated = read("src/routes/_authenticated/route.tsx");
const capacitor = read("capacitor.config.ts");
const manifest = JSON.parse(read("public/manifest.webmanifest"));
const launcherBackground = read("android/app/src/main/res/values/ic_launcher_background.xml");
const brand = read("src/components/brand/StudentTamkeenBrand.tsx");

describe("STUDENT_BRAND_THEME_01", () => {
  it("activates the brand only on the student shell", () => {
    expect(shell).toContain('className="student-theme student-app-bg');
    expect(authenticated).toContain("Admin pages render their own AdminLayout");
    expect(authenticated).toContain('className="admin-app-bg');
    expect(authenticated).not.toContain('className="student-theme admin-app-bg');
  });

  it("uses the approved semantic palette without changing the root theme", () => {
    const studentBlock = styles.match(/\.student-theme\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(studentBlock).toContain("--primary: #1E2A63");
    expect(studentBlock).toContain("--secondary: #0EA5E9");
    expect(studentBlock).toContain("--accent: #06B6D4");
    expect(studentBlock).toContain("--background: #FBFAF7");
    expect(studentBlock).toContain("--foreground: #131A33");
    expect(studentBlock).toContain("--success: #10B981");
    expect(studentBlock).toContain("--hero-gradient");

    const rootBlock = styles.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(rootBlock).toContain("--primary: #5B4BFF");
  });

  it("keeps critical text/background contrast above WCAG AA", () => {
    expect(contrast("#131A33", "#FBFAF7")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#FFFFFF", "#1E2A63")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#56607F", "#FBFAF7")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#06263A", "#06B6D4")).toBeGreaterThanOrEqual(4.5);
  });

  it("aligns the PWA and Android launch surfaces with the student brand", () => {
    expect(manifest.theme_color).toBe("#1E2A63");
    expect(manifest.background_color).toBe("#FBFAF7");
    expect(capacitor).toContain('backgroundColor: "#FBFAF7"');
    expect(launcherBackground).toContain("#FBFAF7");
    expect(brand).toContain('STUDENT_TAMKEEN_MARK_SRC = "/brand/student-tamkeen-mark.png"');
  });

  it("preserves RTL and the responsive mobile/desktop shell contract", () => {
    expect(shell).toContain('dir="rtl"');
    expect(shell).toContain("hidden w-60");
    expect(shell).toContain("lg:flex");
    expect(shell).toContain("lg:hidden");
    expect(shell).toContain("grid grid-cols-5");
    expect(shell).toContain("pb-[env(safe-area-inset-bottom)]");
    expect(shell).toContain("pb-24");
  });
});

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(hex) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}
