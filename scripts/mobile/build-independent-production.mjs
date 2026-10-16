import { execFileSync } from "node:child_process";
import { getDeploymentConfig } from "../independent/config.mjs";

// Every normal Android release now uses the independent production target.
// The separate staging workflow keeps its own app identity and build command.
const env = {
  ...process.env,
  TAMKEEN_DEPLOYMENT_ENV: "production",
  TAMKEEN_PRODUCTION_ORIGIN: process.env.TAMKEEN_PRODUCTION_ORIGIN || "https://studentamkeen.com",
  TAMKEEN_NATIVE_SHELL: "1",
};
getDeploymentConfig(env);
function run(...args) {
  execFileSync(process.execPath, args, { env, stdio: "inherit" });
}
run("node_modules/typescript/bin/tsc", "-p", "mobile/tsconfig.json", "--noEmit");
run("scripts/academy/build-offline-shell.mjs", "--independent");
run("node_modules/vite/bin/vite.js", "build", "--config", "vite.independent.config.ts");
run("scripts/independent/verify-build.mjs");
run("scripts/independent/package-native-shell.mjs");
