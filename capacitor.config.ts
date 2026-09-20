import type { CapacitorConfig } from "@capacitor/cli";

/**
 * 17B — Android release preparation for تمكين.
 *
 * Tamkeen's web app is a TanStack Start SSR application, so the Android shell
 * loads the deployed production origin. `webDir` carries the fail-closed
 * offline entry that reads only previously verified, account-isolated packs
 * through narrow native plugins when the origin cannot be reached.
 */
const config: CapacitorConfig = {
  appId: "app.studentamkeen.tamkeen",
  appName: "تمكين",
  webDir: "mobile/www",
  android: {
    allowMixedContent: false,
  },
  server: {
    // HTTPS only. Change to the preview origin for internal test tracks.
    url: "https://studentamkeen.com",
    androidScheme: "https",
    cleartext: false,
    hostname: "studentamkeen.com",
    // OFFLINE-04 — when the remote origin cannot be reached, Android loads the
    // bundled, hash-verifying lesson/book entry instead of chrome-error://.
    errorPath: "index.html",
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#FBFAF7",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
  },
};

// Native distributions ship the same React routes as the website. Only API
// calls need the server; the application shell is always available locally.
if (process.env.TAMKEEN_NATIVE_APP === "1") {
  config.webDir = "mobile/app-www";
  config.server = {
    androidScheme: "https",
    hostname: "studentamkeen.com",
    cleartext: false,
    errorPath: "app-recovery.html",
  };
}

export default config;
