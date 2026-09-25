import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const mainActivity = readFileSync(
  "android/app/src/main/java/app/studentamkeen/tamkeen/MainActivity.java",
  "utf8",
);

test("installed Android app enables pinch zoom without legacy zoom controls", () => {
  assert.match(mainActivity, /setSupportZoom\(true\)/);
  assert.match(mainActivity, /setBuiltInZoomControls\(true\)/);
  assert.match(mainActivity, /setDisplayZoomControls\(false\)/);
});
