/** One-off review packaging. Run only in a disposable checkout, never a Play release. */
import assert from "node:assert/strict";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const root = process.cwd();
const appId = "app.studentamkeen.tamkeen.review";
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.equal(process.env.TAMKEEN_REVIEW_APK, "1", "Explicit review flag required");
const html = await readFile("dist/client/index.html", "utf8");
assert.match(html, /<html[^>]+dir="rtl"/);
assert.match(html, /type="module"/);
const assetDir = "dist/client/assets";
const assetNames = await readdir(assetDir);
const settings = [];
for (const name of assetNames.filter((name) => /^settings-.*\.js$/.test(name))) {
  if ((await readFile(`${assetDir}/${name}`, "utf8")).includes("تحميل المحتوى كاملًا"))
    settings.push(name);
}
assert.equal(settings.length, 1);
assert.match(await readFile(`${assetDir}/${settings[0]}`, "utf8"), /تحميل المحتوى كاملًا/);
// Save the existing verified cold-start entry, unchanged, alongside the review SPA.
await cp("mobile/www/index.html", "dist/client/review-offline.html");
await cp("mobile/www/student-tamkeen-mark.png", "dist/client/student-tamkeen-mark.png");
await mkdir("mobile/review-www", { recursive: true });
await cp("dist/client", "mobile/review-www", { recursive: true });
const capacitorSource = await readFile("capacitor.config.ts", "utf8");
assert.ok(capacitorSource.endsWith("export default config;\n"));
await writeFile(
  "capacitor.config.ts",
  capacitorSource.replace(
    "export default config;",
    `
// Generated review package: bundled UI, same authenticated API origin, separate app data.
config.appId = ${JSON.stringify(appId)};
config.appName = "تمكين — اختبار 237";
config.webDir = "mobile/review-www";
config.server = { androidScheme: "https", hostname: "studentamkeen.com", cleartext: false, errorPath: "review-offline.html" };
export default config;`,
  ),
);
let gradle = await readFile("android/app/build.gradle", "utf8");
assert.ok(gradle.includes("    buildTypes {"));
gradle = gradle.replace(
  "    buildTypes {",
  `    buildTypes {
        debug {
            applicationIdSuffix ".review"
            versionNameSuffix "-review237"
        }`,
);
await writeFile("android/app/build.gradle", gradle);
const dir = "android/app/src/debug";
await mkdir(`${dir}/java/app/studentamkeen/tamkeen`, { recursive: true });
await mkdir(`${dir}/res/values`, { recursive: true });
await cp(
  "scripts/mobile/review/ReviewActivity.java",
  `${dir}/java/app/studentamkeen/tamkeen/ReviewActivity.java`,
);
await writeFile(
  `${dir}/res/values/strings.xml`,
  '<resources><string name="app_name">تمكين — اختبار 237</string><string name="title_activity_main">تمكين — اختبار 237</string></resources>\n',
);
await writeFile(
  `${dir}/AndroidManifest.xml`,
  `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
 <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
 <application>
  <activity android:name="app.studentamkeen.tamkeen.MainActivity" android:enabled="false" />
  <activity android:name="app.studentamkeen.tamkeen.ReviewActivity" android:exported="true" android:launchMode="singleTask" android:theme="@style/AppTheme.NoActionBarLaunch" android:configChanges="orientation|keyboardHidden|keyboard|screenSize|locale|smallestScreenSize|screenLayout|uiMode|navigation|density">
   <intent-filter><action android:name="android.intent.action.MAIN" /><category android:name="android.intent.category.LAUNCHER" /></intent-filter>
   <intent-filter><action android:name="android.intent.action.VIEW" /><category android:name="android.intent.category.DEFAULT" /><category android:name="android.intent.category.BROWSABLE" /><data android:scheme="app.studentamkeen.tamkeen" android:host="auth" android:path="/callback" /></intent-filter>
  </activity>
 </application>
</manifest>\n`,
);
// The immutable descriptor accompanies the embedded UI and the APK evidence.
const descriptor = {
  kind: "TEST_ONLY",
  appId,
  sourceSha: sha,
  featureSha: "7a8c7c7dbfab7ac56b95360ebe035c2a88276074",
  settingsAsset: settings[0],
  settingsSha256: createHash("sha256")
    .update(await readFile(`${assetDir}/${settings[0]}`))
    .digest("hex"),
  htmlSha256: createHash("sha256").update(html).digest("hex"),
  apiOrigin: "https://studentamkeen.com",
  ui: "bundled",
  playUpload: false,
};
await writeFile("mobile/review-www/review-build.json", JSON.stringify(descriptor, null, 2));
console.log(JSON.stringify(descriptor));
