import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildGoldenLessonBundleFiles,
  packGoldenLessonBundle,
} from "../../scripts/content-factory/build-golden-lesson-bundle.mjs";
import {
  GOLDEN_ASSET_MAX_BYTES,
  GOLDEN_ASSET_MIN_BYTES,
  assetMagicMatches,
  isAllowedAssetMime,
  isSafeAssetLeaf,
  scanHtmlAssetReferences,
  validateGoldenLessonAssets,
  type GoldenLessonAsset,
} from "../../src/lib/content-factory/golden-lesson-assets";
import { verifyGoldenLessonBundle } from "../../src/lib/content-factory/golden-lesson-bundle-verifier";

const PACKAGE_DIR = resolve(__dirname, "../../content-packages/chemistry-g12-iron-v3");
const spec = JSON.parse(readFileSync(resolve(PACKAGE_DIR, "golden-bundle.spec.json"), "utf8"));

const FURNACE_LEAF = "official-figure-1-1.jpg";
const FURNACE_SHA = "a5e17da2c7343bc3f4289a3258f646d635e7a8365b84f2b7c7209134f0614daf";

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

const baseAsset = (): GoldenLessonAsset => ({
  assetCode: "OFFICIAL-FIGURE-1-1",
  path: FURNACE_LEAF,
  mimeType: "image/jpeg",
  sha256: FURNACE_SHA,
  bytes: 26742,
  referencedBy: ["officialBookContent"],
  altTextAr: "شكل (1-1) الفرن العالي (اللافح)",
});

const codesOf = (findings: { code: string }[]) => findings.map((f) => f.code);
const always = () => true;

describe("CF11 — Iron furnace asset is real, declared and byte-pinned", () => {
  const { manifest, files } = buildGoldenLessonBundleFiles(PACKAGE_DIR, spec);
  const raw = new Uint8Array(readFileSync(resolve(PACKAGE_DIR, FURNACE_LEAF)));

  it("is a genuine JPEG by magic bytes, not just by extension", () => {
    expect([raw[0], raw[1], raw[2]]).toEqual([0xff, 0xd8, 0xff]);
    expect(assetMagicMatches("image/jpeg", raw)).toBe(true);
    // The same bytes must be rejected when mislabelled as PNG — this is exactly the R1 defect.
    expect(assetMagicMatches("image/png", raw)).toBe(false);
  });

  it("matches the declared SHA-256 and size caps", () => {
    expect(sha256(raw)).toBe(FURNACE_SHA);
    expect(raw.byteLength).toBe(26742);
    expect(raw.byteLength).toBeGreaterThanOrEqual(GOLDEN_ASSET_MIN_BYTES);
    expect(raw.byteLength).toBeLessThanOrEqual(GOLDEN_ASSET_MAX_BYTES);
  });

  it("is declared exactly once in the manifest with a leaf-only path", () => {
    expect(manifest.assets).toHaveLength(1);
    const [asset] = manifest.assets as GoldenLessonAsset[];
    expect(asset.path).toBe(FURNACE_LEAF);
    expect(isSafeAssetLeaf(asset.path)).toBe(true);
    expect(asset.sha256).toBe(FURNACE_SHA);
    expect(asset.bytes).toBe(raw.byteLength);
    expect(validateGoldenLessonAssets(manifest.assets as GoldenLessonAsset[], always)).toEqual([]);
  });

  it("is shipped inside the ZIP and accepted by the server verifier", async () => {
    expect(files.has(FURNACE_LEAF)).toBe(true);
    const { bytes } = await packGoldenLessonBundle(manifest, files);
    const verified = await verifyGoldenLessonBundle(bytes);
    expect(verified.assets.map((a) => a.path)).toEqual([FURNACE_LEAF]);
  });

  it("is referenced from official HTML as a bare leaf, never base64 or a URL", () => {
    const html = readFileSync(resolve(PACKAGE_DIR, "official-content.html"), "utf8");
    expect(html).toContain(`src="${FURNACE_LEAF}"`);
    expect(html).not.toMatch(/data:image/i);
    expect(html).not.toMatch(/https?:\/\//i);
    expect(scanHtmlAssetReferences("official-content.html", html, new Set([FURNACE_LEAF]))).toEqual([]);
  });
});

describe("CF11 — asset declaration negatives (all fail closed)", () => {
  it("rejects SVG and every MIME outside the raster allowlist", () => {
    expect(isAllowedAssetMime("image/svg+xml")).toBe(false);
    expect(isAllowedAssetMime("text/html")).toBe(false);
    expect(isAllowedAssetMime("application/pdf")).toBe(false);
    const findings = validateGoldenLessonAssets(
      [{ ...baseAsset(), path: "figure.svg", mimeType: "image/svg+xml" }],
      always,
    );
    expect(codesOf(findings)).toContain("ASSET_MIME_FORBIDDEN");
  });

  it("rejects folders, traversal, absolute paths and uppercase leaves", () => {
    for (const bad of ["a/b.jpg", "../secret.jpg", "/etc/passwd", "..", ".", "Figure.JPG", "x\\y.jpg"]) {
      expect(isSafeAssetLeaf(bad)).toBe(false);
    }
    expect(codesOf(validateGoldenLessonAssets([{ ...baseAsset(), path: "figures/a.jpg" }], always)))
      .toContain("ASSET_PATH_UNSAFE");
  });

  it("rejects an extension that disagrees with the declared MIME", () => {
    expect(codesOf(validateGoldenLessonAssets([{ ...baseAsset(), path: "figure.png" }], always)))
      .toContain("ASSET_EXTENSION_MISMATCH");
  });

  it("rejects a malformed hash, an out-of-range size and a missing alt text", () => {
    const findings = validateGoldenLessonAssets(
      [{ ...baseAsset(), sha256: "nope", bytes: GOLDEN_ASSET_MAX_BYTES + 1, altTextAr: " " }],
      always,
    );
    expect(codesOf(findings)).toEqual(
      expect.arrayContaining(["ASSET_HASH_INVALID", "ASSET_SIZE_OUT_OF_RANGE", "ASSET_ALT_TEXT_MISSING"]),
    );
  });

  it("rejects duplicate codes and duplicate file names", () => {
    const findings = validateGoldenLessonAssets([baseAsset(), baseAsset()], always);
    expect(codesOf(findings)).toEqual(
      expect.arrayContaining(["ASSET_CODE_DUPLICATE", "ASSET_PATH_DUPLICATE"]),
    );
  });

  it("rejects an asset bound to a capability that carries no source file", () => {
    const findings = validateGoldenLessonAssets([baseAsset()], () => false);
    expect(codesOf(findings)).toContain("ASSET_REFERENCE_CAPABILITY_INVALID");
  });
});

describe("CF11 — HTML reference negatives (undeclared bytes never load)", () => {
  const declared = new Set([FURNACE_LEAF]);

  it("rejects a reference to a file that is not declared", () => {
    const findings = scanHtmlAssetReferences("x.html", '<img src="rogue.jpg">', declared);
    expect(findings.length).toBeGreaterThan(0);
    expect(codesOf(findings)[0]).toMatch(/UNDECLARED|REFERENCE/);
  });

  it("rejects base64/data URIs", () => {
    expect(codesOf(scanHtmlAssetReferences("x.html", '<img src="data:image/png;base64,AAAA">', declared)))
      .toContain("HTML_REFERENCE_DATA_URI_FORBIDDEN");
  });

  it("rejects every network reference form", () => {
    for (const url of ["https://evil.test/a.jpg", "http://evil.test/a.jpg", "//evil.test/a.jpg"]) {
      expect(codesOf(scanHtmlAssetReferences("x.html", `<img src="${url}">`, declared)))
        .toContain("HTML_REFERENCE_EXTERNAL_FORBIDDEN");
    }
  });

  it("rejects nested paths and traversal inside HTML", () => {
    expect(codesOf(scanHtmlAssetReferences("x.html", '<img src="img/a.jpg">', declared)))
      .toContain("HTML_REFERENCE_PATH_FORBIDDEN");
    expect(codesOf(scanHtmlAssetReferences("x.html", '<img src="../a.jpg">', declared)).length)
      .toBeGreaterThan(0);
  });

  it("rejects an empty reference and CSS url() escapes", () => {
    expect(codesOf(scanHtmlAssetReferences("x.html", '<img src="">', declared)))
      .toContain("HTML_REFERENCE_EMPTY");
    expect(codesOf(scanHtmlAssetReferences("x.html", '<i style="background:url(https://e.test/a.png)">', declared)))
      .toContain("HTML_REFERENCE_EXTERNAL_FORBIDDEN");
  });

  it("accepts the declared leaf and nothing else", () => {
    expect(scanHtmlAssetReferences("x.html", `<img src="${FURNACE_LEAF}" alt="a">`, declared)).toEqual([]);
  });
});
