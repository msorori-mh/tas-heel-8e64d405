import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { digestCanonicalPayloadV1 } from "./canonical-payload-v1.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(
  __dirname,
  "..",
  "..",
  "tests",
  "fixtures",
  "question-bank",
  "canonical-payload-v1.json",
);

const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));
const byId = new Map(fixture.vectors.map((v) => [v.id, v]));
let failures = 0;

function fail(msg) {
  console.error("FAIL:", msg);
  failures += 1;
}

for (const vector of fixture.vectors) {
  const { digest } = digestCanonicalPayloadV1(vector.source);
  if (digest !== vector.digest) {
    fail(`${vector.id}: digest mismatch expected=${vector.digest} got=${digest}`);
  }

  if (vector.expect === "same_as") {
    const other = byId.get(vector.same_as);
    if (!other) {
      fail(`${vector.id}: missing same_as target ${vector.same_as}`);
    } else if (digest !== other.digest) {
      fail(`${vector.id}: expected same digest as ${vector.same_as}`);
    }
  }

  if (vector.assert_ne) {
    const other = byId.get(vector.assert_ne);
    if (!other) {
      fail(`${vector.id}: missing assert_ne target ${vector.assert_ne}`);
    } else if (digest === other.digest) {
      fail(`${vector.id}: expected digest to differ from ${vector.assert_ne}`);
    }
  }

  if (!/^[0-9a-f]{64}$/.test(digest)) {
    fail(`${vector.id}: digest is not lowercase hex SHA-256`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} golden vector assertion(s) failed`);
  process.exit(1);
}

console.log(`OK: ${fixture.vectors.length} canonical_payload_v1 golden vectors verified`);
console.log(`JCS: ${fixture.jcs_library}`);
console.log(`Fixture: ${fixturePath}`);
