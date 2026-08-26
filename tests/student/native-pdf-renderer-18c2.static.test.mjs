/**
 * 18C2 — static guards for the native PDF renderer adoption.
 *
 * These guard the architecture decisions, not cosmetics:
 *   - Android must never route primary PDFs through pdf.js.
 *   - The native bridge only accepts app-private relative paths.
 *   - The golden Arabic reference page stays in the repo.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");

describe("18C2 renderer adapter", () => {
  const adapter = read("src/lib/pdf/pdf-renderer-adapter.ts");
  const entry = read("src/components/lessons/InAppPdfDelivery.tsx");

  it("selects an Android-native renderer on Capacitor Android", () => {
    expect(adapter).toContain("ANDROID_NATIVE");
    expect(adapter).toContain('getPlatform() === "android"');
  });

  it("keeps a separate web decision path", () => {
    expect(adapter).toContain("BROWSER_NATIVE");
    expect(adapter).toContain("pdfViewerEnabled");
  });

  it("never renders pdf.js when the renderer is Android native", () => {
    expect(entry).toContain("selectPdfRenderer");
    const androidBranch = entry.slice(entry.indexOf('renderer === "ANDROID_NATIVE"'));
    const pdfjsIndex = androidBranch.indexOf("<PdfViewer");
    const elseIndex = androidBranch.indexOf(": (");
    expect(pdfjsIndex).toBeGreaterThan(elseIndex);
  });
});

describe("18C2 native bridge security", () => {
  const bridge = read("src/lib/pdf/native-pdf-viewer.ts");
  const plugin = read(
    "android/app/src/main/java/app/studentamkeen/tamkeen/TamkeenPdfViewerPlugin.java",
  );
  const activity = read(
    "android/app/src/main/java/app/studentamkeen/tamkeen/PdfViewerActivity.java",
  );

  it("rejects absolute paths, traversal and URLs on the JS side", () => {
    expect(bridge).toContain("isPrivateRelativePath");
    expect(bridge).toContain('value.startsWith("/")');
    expect(bridge).toContain('value.includes("..")');
  });

  it("re-validates the path natively and resolves inside getFilesDir()", () => {
    expect(plugin).toContain("invalid_local_path");
    expect(plugin).toContain("getContext().getFilesDir()");
  });

  it("passes no URL, token or bucket across the bridge", () => {
    for (const needle of ["Authorization", "Bearer", "supabase", "drive.google", "signedUrl"]) {
      expect(bridge.toLowerCase()).not.toContain(needle.toLowerCase());
      expect(plugin.toLowerCase()).not.toContain(needle.toLowerCase());
    }
  });

  it("renders one page at a time and recycles bitmaps", () => {
    expect(activity).toContain("RENDER_MODE_FOR_DISPLAY");
    expect(activity).toContain("recycle()");
    expect(activity).toContain("renderer.openPage(index)");
  });

  it("returns the last page to JS for last_opened_page restore", () => {
    expect(activity).toContain("EXTRA_LAST_PAGE");
    expect(read("src/components/lessons/NativePdfDelivery.tsx")).toContain("rememberLastPage");
  });
});

describe("18C2 golden Arabic regression asset", () => {
  const golden = "docs/mobile/golden/quran-sajda-page2-poppler-reference.jpg";
  const native = "docs/mobile/golden/quran-sajda-page2-pdfium-native.png";

  it("keeps the سورة السجدة reference page in the repo", () => {
    expect(existsSync(golden)).toBe(true);
    expect(existsSync(native)).toBe(true);
    expect(statSync(golden).size).toBeGreaterThan(5000);
    expect(statSync(native).size).toBeGreaterThan(5000);
  });
});

describe("18C2 offline reuse", () => {
  const nativeCard = read("src/components/lessons/NativePdfDelivery.tsx");

  it("reuses the 18C secure delivery + cache pipeline", () => {
    expect(nativeCard).toContain("resolveLessonFile");
    expect(nativeCard).toContain("getEntry");
    expect(nativeCard).not.toContain("fetch(");
  });
});
