import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builder = readFileSync(
  new URL("../../src/components/admin/GoldenLessonPackageBuilder.tsx", import.meta.url),
  "utf8",
);

test("CF11 R12 declares supplemental assets and uploads their exact files directly", () => {
  assert.match(builder, /assets: supplementalAssets\.map/);
  assert.match(
    builder,
    /for \(const asset of supplementalAssets\) files\.set\(asset\.path, asset\.file\)/,
  );
  assert.match(builder, /files\.get\(upload\.logicalPath\)/);
  assert.doesNotMatch(builder, /buildPackageZipBlob|zip\.file\(asset\.path/);
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

test("CF11 R12 keeps direct attestation server-authoritative and fail-closed", () => {
  assert.match(
    builder,
    /verifyAndStageGoldenLessonDirect\(\{[\s\S]*intakeId: slot\.intakeId, manifest: packageDraft/,
  );
  assert.doesNotMatch(
    builder,
    /verifyAndStageGoldenLessonDirect\([^)]*(fileCount|totalBytes|intakeSha256)/s,
  );
});
