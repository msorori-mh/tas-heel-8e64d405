import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { APP_ID, TARGET_REF, validateStagingOrigin } from "./config.mjs";

/** Run only in a disposable CI checkout; production identifiers remain tracked unchanged. */
export function prepareAndroid(root, value) {
  const origin = validateStagingOrigin(value);
  if (new URL(origin).hostname.endsWith(".invalid"))
    throw new Error("A deployed HTTPS origin is required for the APK.");
  const changes = [
    [
      "capacitor.config.ts",
      [
        ['appId: "app.studentamkeen.tamkeen"', `appId: "${APP_ID}"`],
        ['appName: "تمكين"', 'appName: "تمكين — اختبار مستقل"'],
        ['webDir: "mobile/www"', 'webDir: "mobile/native-www"'],
        ['url: "https://studentamkeen.com"', `url: "${origin}"`],
        ['hostname: "studentamkeen.com"', `hostname: "${new URL(origin).hostname}"`],
      ],
    ],
    [
      "android/app/build.gradle",
      [['applicationId "app.studentamkeen.tamkeen"', `applicationId "${APP_ID}"`]],
    ],
    [
      "android/app/src/main/AndroidManifest.xml",
      [
        ['android:host="studentamkeen.com"', `android:host="${new URL(origin).hostname}"`],
        ['android:scheme="app.studentamkeen.tamkeen"', `android:scheme="${APP_ID}"`],
      ],
    ],
    [
      "android/app/src/main/res/values/strings.xml",
      [
        [
          '<string name="app_name">تمكين</string>',
          '<string name="app_name">تمكين — اختبار مستقل</string>',
        ],
        [
          '<string name="title_activity_main">تمكين</string>',
          '<string name="title_activity_main">تمكين — اختبار مستقل</string>',
        ],
        [
          '<string name="package_name">app.studentamkeen.tamkeen</string>',
          `<string name="package_name">${APP_ID}</string>`,
        ],
        [
          '<string name="custom_url_scheme">app.studentamkeen.tamkeen</string>',
          `<string name="custom_url_scheme">${APP_ID}</string>`,
        ],
      ],
    ],
    [
      "mobile/www/index.html",
      [['var ORIGIN = "https://studentamkeen.com";', `var ORIGIN = "${origin}";`]],
    ],
  ];
  // Validate every input before changing any file. Unexpected upstream edits stop the build.
  const outputs = changes.map(([file, replacements]) => {
    let text = readFileSync(resolve(root, file), "utf8");
    for (const [before, after] of replacements) {
      if (text.split(before).length !== 2)
        throw new Error(`Android staging patch did not match exactly once: ${file}`);
      text = text.replace(before, after);
    }
    return [file, text];
  });
  for (const [file, text] of outputs) writeFileSync(resolve(root, file), text);
  const proof = {
    targetProject: TARGET_REF,
    origin,
    applicationId: APP_ID,
    nativeCallback: `${APP_ID}://auth/callback`,
  };
  mkdirSync(resolve(root, "artifacts"), { recursive: true });
  writeFileSync(
    resolve(root, "artifacts/independent-android-target.json"),
    JSON.stringify(proof, null, 2),
  );
  return proof;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  console.log(JSON.stringify(prepareAndroid(root, process.env.TAMKEEN_STAGING_ORIGIN)));
}
