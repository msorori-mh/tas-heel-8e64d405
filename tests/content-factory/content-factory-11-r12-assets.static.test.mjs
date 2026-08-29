import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builder = readFileSync(
  new URL("../../src/components/admin/GoldenLessonPackageBuilder.tsx", import.meta.url),
  "utf8",
);
const html5 = readFileSync(
  new URL("../../src/lib/content-factory/golden-lesson-html5.ts", import.meta.url),
  "utf8",
);
const componentV2 = readFileSync(
  new URL(
    "../../src/lib/content-factory/lesson-component-publishing-v2.functions.ts",
    import.meta.url,
  ),
  "utf8",
);

test("V2 inlines ZIP images inside the one component file", () => {
  assert.match(html5, /data:\$\{mime\};base64/);
  assert.match(html5, /bytesToBase64/);
  assert.match(html5, /assets: \[\]/);
  assert.doesNotMatch(componentV2, /supplementalAssets|golden_lesson_assets/);
  assert.doesNotMatch(builder, /buildPackageZipBlob|zip\.file\(asset\.path/);
});

/**
 * The operator-facing image picker is gone — it read as a mandatory eighth component of
 * a seven-component lesson. Assets now reach the package only from inside an HTML5/ZIP
 * activity, so the type, magic-number and size checks still have to hold on that path.
 */
test("CF11 R12 accepts only allowlisted raster assets and checks magic and bounds", () => {
  assert.match(html5, /assetMagicMatches\(mime, bytes\)/);
  assert.match(html5, /GOLDEN_ASSET_MIN_BYTES/);
  assert.match(html5, /GOLDEN_ASSET_MAX_BYTES/);
  assert.match(html5, /isSafeAssetLeaf\(assetLeaf\)/);
  assert.doesNotMatch(builder, /accept="image\/png,image\/jpeg,image\/webp"/);
});

test("V2 has no separate asset ownership or eighth-component contract", () => {
  assert.doesNotMatch(builder, /referencedBy: GoldenCapability\[\]|supplementalAssets/);
  assert.doesNotMatch(componentV2, /golden_lesson_assets|asset_attestations/);
  assert.match(html5, /one verified HTML file is the whole component/);
});

test("CF11 R12 keeps direct attestation server-authoritative and fail-closed", () => {
  assert.match(builder, /verifyLessonComponentV2Upload/);
  assert.match(componentV2, /requireExactBytes/);
  assert.match(componentV2, /validateGoldenLessonArtifactBytes/);
  assert.doesNotMatch(componentV2, /fileCount|verifiedFileCount|canonical_manifest/);
});
