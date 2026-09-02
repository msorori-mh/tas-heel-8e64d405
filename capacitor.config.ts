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
  appName: "تمكين الطالب",
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

export default config;
