import { packageNativeShell } from "../mobile/package-shell.mjs";
import { TARGET_REF, APP_ID, validateStagingOrigin } from "./config.mjs";
packageNativeShell({
  releaseFile: "independent-release.json",
  expectedProject: TARGET_REF,
  expectedOrigin: validateStagingOrigin(process.env.TAMKEEN_STAGING_ORIGIN),
  expectedAppId: APP_ID,
});
