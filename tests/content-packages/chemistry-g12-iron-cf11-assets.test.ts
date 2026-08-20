import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

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

const HERE = dirname(fileURLToPath(import.meta.url));
const PACKAGE_DIR = resolve(HERE, "../../content-packages/chemistry-g12-iron-v3");
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
    assert.deepEqual([raw[0], raw[1], raw[2]], [0xff, 0xd8, 0xff]);
    assert.equal(assetMagicMatches("image/jpeg", raw), true);
    // The same bytes must be rejected when mislabelled as PNG — this is exactly the R1 defect.
    assert.equal(assetMagicMatches("image/png", raw), false);
  });

  it("matches the declared SHA-256 and size caps", () => {
    assert.equal(sha256(raw), FURNACE_SHA);
    assert.equal(raw.byteLength, 26742);
    assert.ok(raw.byteLength >= GOLDEN_ASSET_MIN_BYTES);
    assert.ok(raw.byteLength <= GOLDEN_ASSET_MAX_BYTES);
  });

  it("is declared exactly once in the manifest with a leaf-only path", () => {
    const assets = manifest.assets as GoldenLessonAsset[];
    assert.equal(assets.length, 1);
    const asset = assets[0]!;
    assert.equal(asset.path, FURNACE_LEAF);
    assert.equal(isSafeAssetLeaf(asset.path), true);
    assert.equal(asset.sha256, FURNACE_SHA);
    assert.equal(asset.bytes, raw.byteLength);
    assert.deepEqual(validateGoldenLessonAssets(assets, always), []);
  });

  it("is shipped inside the ZIP and accepted by the server verifier", async () => {
    assert.equal(files.has(FURNACE_LEAF), true);
    const { bytes } = await packGoldenLessonBundle(manifest, files);
    const verified = await verifyGoldenLessonBundle(bytes);
    assert.deepEqual(verified.assets.map((a) => a.path), [FURNACE_LEAF]);
  });

  it("is referenced from official HTML as a bare leaf, never base64 or a URL", () => {
    const html = readFileSync(resolve(PACKAGE_DIR, "official-content.html"), "utf8");
    assert.ok(html.includes(`src="${FURNACE_LEAF}"`));
    assert.doesNotMatch(html, /data:image/i);
    assert.doesNotMatch(html, /https?:\/\//i);
    assert.deepEqual(scanHtmlAssetReferences("official-content.html", html, new Set([FURNACE_LEAF])), []);
  });
});

describe("CF11 — asset declaration negatives (all fail closed)", () => {
  it("rejects SVG and every MIME outside the raster allowlist", () => {
    assert.equal(isAllowedAssetMime("image/svg+xml"), false);
    assert.equal(isAllowedAssetMime("text/html"), false);
    assert.equal(isAllowedAssetMime("application/pdf"), false);
    const findings = validateGoldenLessonAssets(
      [{ ...baseAsset(), path: "figure.svg", mimeType: "image/svg+xml" }],
      always,
    );
    assert.ok(codesOf(findings).includes("ASSET_MIME_FORBIDDEN"));
  });

  it("rejects folders, traversal, absolute paths and uppercase leaves", () => {
    for (const bad of ["a/b.jpg", "../secret.jpg", "/etc/passwd", "..", ".", "Figure.JPG", "x\\y.jpg"]) {
      assert.equal(isSafeAssetLeaf(bad), false, bad);
    }
    assert.ok(
      codesOf(validateGoldenLessonAssets([{ ...baseAsset(), path: "figures/a.jpg" }], always))
        .includes("ASSET_PATH_UNSAFE"),
    );
  });

  it("rejects an extension that disagrees with the declared MIME", () => {
    assert.ok(
      codesOf(validateGoldenLessonAssets([{ ...baseAsset(), path: "figure.png" }], always))
        .includes("ASSET_EXTENSION_MISMATCH"),
    );
  });

  it("rejects a malformed hash, an out-of-range size and a missing alt text", () => {
    const codes = codesOf(
      validateGoldenLessonAssets(
        [{ ...baseAsset(), sha256: "nope", bytes: GOLDEN_ASSET_MAX_BYTES + 1, altTextAr: " " }],
        always,
      ),
    );
    for (const code of ["ASSET_HASH_INVALID", "ASSET_SIZE_OUT_OF_RANGE", "ASSET_ALT_TEXT_MISSING"]) {
      assert.ok(codes.includes(code), code);
    }
  });

  it("rejects duplicate codes and duplicate file names", () => {
    const codes = codesOf(validateGoldenLessonAssets([baseAsset(), baseAsset()], always));
    for (const code of ["ASSET_CODE_DUPLICATE", "ASSET_PATH_DUPLICATE"]) {
      assert.ok(codes.includes(code), code);
    }
  });

  it("rejects an asset bound to a capability that carries no source file", () => {
    const findings = validateGoldenLessonAssets([baseAsset()], () => false);
    assert.ok(codesOf(findings).includes("ASSET_REFERENCE_CAPABILITY_INVALID"));
  });
});

describe("CF11 — HTML reference negatives (undeclared bytes never load)", () => {
  const declared = new Set([FURNACE_LEAF]);

  it("rejects a reference to a file that is not declared", () => {
    const findings = scanHtmlAssetReferences("x.html", '<img src="rogue.jpg">', declared);
    assert.ok(findings.length > 0);
    assert.match(codesOf(findings)[0]!, /UNDECLARED|REFERENCE/);
  });

  it("rejects base64/data URIs", () => {
    assert.ok(
      codesOf(scanHtmlAssetReferences("x.html", '<img src="data:image/png;base64,AAAA">', declared))
        .includes("HTML_REFERENCE_DATA_URI_FORBIDDEN"),
    );
  });

  it("rejects every network reference form", () => {
    for (const url of ["https://evil.test/a.jpg", "http://evil.test/a.jpg", "//evil.test/a.jpg"]) {
      assert.ok(
        codesOf(scanHtmlAssetReferences("x.html", `<img src="${url}">`, declared))
          .includes("HTML_REFERENCE_EXTERNAL_FORBIDDEN"),
        url,
      );
    }
  });

  it("rejects nested paths and traversal inside HTML", () => {
    assert.ok(
      codesOf(scanHtmlAssetReferences("x.html", '<img src="img/a.jpg">', declared))
        .includes("HTML_REFERENCE_PATH_FORBIDDEN"),
    );
    assert.ok(scanHtmlAssetReferences("x.html", '<img src="../a.jpg">', declared).length > 0);
  });

  it("rejects an empty reference and CSS url() escapes", () => {
    assert.ok(
      codesOf(scanHtmlAssetReferences("x.html", '<img src="">', declared)).includes("HTML_REFERENCE_EMPTY"),
    );
    assert.ok(
      codesOf(scanHtmlAssetReferences("x.html", '<i style="background:url(https://e.test/a.png)">', declared))
        .includes("HTML_REFERENCE_EXTERNAL_FORBIDDEN"),
    );
  });

  it("accepts the declared leaf and nothing else", () => {
    assert.deepEqual(scanHtmlAssetReferences("x.html", `<img src="${FURNACE_LEAF}" alt="a">`, declared), []);
  });
});
