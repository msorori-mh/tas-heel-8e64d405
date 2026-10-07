import type { CapacitorConfig } from "@capacitor/cli";

/**
 * 17B — Android release preparation for تمكين.
 *
 * Tamkeen's web app is a TanStack Start SSR application, so the Android shell
 * keeps the deployed origin for authenticated online services, but starts at
 * the APK-owned local pages. TamkeenLocalPages serves the exact bundled asset
 * allowlist before any network request, including Capacitor bridge injection.
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
    appStartPath: "/index.html",
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
