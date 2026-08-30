import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const APPROVED_SOURCE = "assets/brand/student-tamkeen-mark-approved.png";
const APPROVED_SHA256 = "538f9c83fb2d2c41f327cd3432dcb07b9ffec435471ad7257963fbef040ba864";

const read = (path) => readFileSync(path, "utf8");

function pngDimensions(path) {
  const png = readFileSync(path);
  expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
  expect(png.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
}

function pngColorType(path) {
  return readFileSync(path).readUInt8(25);
}

describe("STUDENT_BRAND_LOGO_ASSETS_02", () => {
  it("pins the exact owner-approved logo source", () => {
    const source = readFileSync(APPROVED_SOURCE);
    expect(createHash("sha256").update(source).digest("hex")).toBe(APPROVED_SHA256);
    expect(pngDimensions(APPROVED_SOURCE)).toEqual([222, 245]);
  });

  it("publishes complete PWA and Play Store assets at their required sizes", () => {
    expect(pngDimensions("public/icons/favicon-64.png")).toEqual([64, 64]);
    expect(pngDimensions("public/icons/icon-192.png")).toEqual([192, 192]);
    expect(pngDimensions("public/icons/icon-512.png")).toEqual([512, 512]);
    expect(pngDimensions("public/icons/icon-maskable-512.png")).toEqual([512, 512]);
    expect(pngColorType("public/icons/icon-512.png")).toBe(6);
    expect(statSync("public/icons/icon-512.png").size).toBeLessThanOrEqual(1024 * 1024);
    const featureGraphic = "docs/mobile/google-play/assets/feature-graphic-1024x500.png";
    expect(pngDimensions(featureGraphic)).toEqual([1024, 500]);
    expect(pngColorType(featureGraphic)).toBe(2);
  });

  it("publishes all Android launcher and adaptive foreground densities", () => {
    const densities = ["mdpi", "hdpi", "xhdpi", "xxhdpi", "xxxhdpi"];
    const launcherSizes = [48, 72, 96, 144, 192];
    const foregroundSizes = [108, 162, 216, 324, 432];

    densities.forEach((density, index) => {
      const base = `android/app/src/main/res/mipmap-${density}`;
      expect(pngDimensions(`${base}/ic_launcher.png`)).toEqual([
        launcherSizes[index],
        launcherSizes[index],
      ]);
      expect(pngDimensions(`${base}/ic_launcher_round.png`)).toEqual([
        launcherSizes[index],
        launcherSizes[index],
      ]);
      expect(pngDimensions(`${base}/ic_launcher_foreground.png`)).toEqual([
        foregroundSizes[index],
        foregroundSizes[index],
      ]);
    });
  });

  it("publishes splash artwork for every existing Android orientation and density", () => {
    const expected = new Map([
      ["android/app/src/main/res/drawable/splash.png", [480, 320]],
      ["android/app/src/main/res/drawable-land-mdpi/splash.png", [480, 320]],
      ["android/app/src/main/res/drawable-land-hdpi/splash.png", [800, 480]],
      ["android/app/src/main/res/drawable-land-xhdpi/splash.png", [1280, 720]],
      ["android/app/src/main/res/drawable-land-xxhdpi/splash.png", [1600, 960]],
      ["android/app/src/main/res/drawable-land-xxxhdpi/splash.png", [1920, 1280]],
      ["android/app/src/main/res/drawable-port-mdpi/splash.png", [320, 480]],
      ["android/app/src/main/res/drawable-port-hdpi/splash.png", [480, 800]],
      ["android/app/src/main/res/drawable-port-xhdpi/splash.png", [720, 1280]],
      ["android/app/src/main/res/drawable-port-xxhdpi/splash.png", [960, 1600]],
      ["android/app/src/main/res/drawable-port-xxxhdpi/splash.png", [1280, 1920]],
    ]);

    for (const [path, dimensions] of expected) {
      expect(pngDimensions(path)).toEqual(dimensions);
    }
  });

  it("uses the approved mark across web, offline, PWA, and Android generation paths", () => {
    const root = read("src/routes/__root.tsx");
    const serviceWorker = read("public/sw.js");
    const offline = read("public/offline.html");
    const mobileOffline = read("mobile/www/index.html");
    const generator = read("scripts/mobile/generate-student-brand-assets.sh");

    expect(root).toContain("/icons/favicon-64.png");
    expect(serviceWorker).toContain("/brand/student-tamkeen-mark.png");
    expect(serviceWorker).toContain('const SW_VERSION = "v3"');
    expect(offline).toContain("/brand/student-tamkeen-mark.png");
    expect(mobileOffline).toContain('src="student-tamkeen-mark.png"');
    expect(generator).toContain(APPROVED_SOURCE.split("/").at(-1));
    expect(existsSync("public/favicon.svg")).toBe(false);
  });
});
