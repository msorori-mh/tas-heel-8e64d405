import { readFileSync } from "node:fs";
import { verifyGoldenLessonBundle } from "../src/lib/content-factory/golden-lesson-bundle-verifier";
const bytes = new Uint8Array(readFileSync("content-packages/chemistry-g12-iron-v3/dist/CHEM-G12-IRON-FE.zip"));
const v = await verifyGoldenLessonBundle(bytes);
console.log(JSON.stringify({
  bundleSha256: v.bundleSha256, manifestSha256: v.manifestSha256, fileCount: v.fileCount,
  compressedBytes: v.compressedBytes, uncompressedBytes: v.uncompressedBytes,
  assets: v.assets, files: v.files.map(f => f.path),
}, null, 2));
