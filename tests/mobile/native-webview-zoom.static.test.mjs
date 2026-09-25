import { expect, test } from "vitest";
import { readFileSync } from "node:fs";

const mainActivity = readFileSync(
  "android/app/src/main/java/app/studentamkeen/tamkeen/MainActivity.java",
  "utf8",
);

test("installed Android app enables pinch zoom without legacy zoom controls", () => {
  expect(mainActivity).toMatch(/setSupportZoom\(true\)/);
  expect(mainActivity).toMatch(/setBuiltInZoomControls\(true\)/);
  expect(mainActivity).toMatch(/setDisplayZoomControls\(false\)/);
});
