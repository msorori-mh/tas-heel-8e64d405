import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builder = readFileSync(
  new URL("../../src/components/admin/GoldenLessonPackageBuilder.tsx", import.meta.url),
  "utf8",
);

test("CF11 R12 declares supplemental assets in the manifest and exact ZIP bytes", () => {
  assert.match(builder, /assets: supplementalAssets\.map/);
  assert.match(builder, /zip\.file\(asset\.path, asset\.file\)/);
  assert.match(builder, /buildPackageZipBlob\(packageDraft, uploads, provenance, answersCompanion, supplementalAssets\)/);
});

test("CF11 R12 accepts only allowlisted raster assets and checks magic and bounds", () => {
  assert.match(builder, /isAllowedAssetMime\(file\.type\)/);
  assert.match(builder, /assetMagicMatches\(file\.type, bytes\)/);
  assert.match(builder, /GOLDEN_ASSET_MIN_BYTES/);
  assert.match(builder, /GOLDEN_ASSET_MAX_BYTES/);
  assert.match(builder, /accept="image\/png,image\/jpeg,image\/webp"/);
});

test("CF11 R12 derives asset ownership and Arabic alt text from uploaded HTML", () => {
  assert.match(builder, /referencedBy: GoldenCapability\[\]/);
  assert.match(builder, /new DOMParser\(\)\.parseFromString/);
  assert.match(builder, /matchingImage\?\.getAttribute\("alt"\)/);
  assert.match(builder, /الأصل غير مشار إليه من أي ملف HTML/);
  assert.match(builder, /النص البديل العربي مفقود في HTML/);
});

test("CF11 R12 keeps server attestation path-only and fail-closed", () => {
  assert.match(builder, /verifyAndStageGoldenLessonBundle\(\{ data: \{ path: slot\.path \} \}\)/);
  assert.doesNotMatch(builder, /verifyAndStageGoldenLessonBundle\([^)]*(sha256|bytes|fileCount)/s);
});
