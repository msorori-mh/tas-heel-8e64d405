import type { CapacitorConfig } from "@capacitor/cli";

/**
 * 17B — Android release preparation for تمكين.
 *
 * Tamkeen's web app is a TanStack Start SSR application, so the Android shell
 * loads the deployed production origin instead of a static bundle. `webDir`
 * only carries an offline fallback page that is shown when the origin cannot
 * be reached. No business logic, RLS or RPC behaviour changes.
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
    // 21B4-B — when the remote origin cannot be reached, Android loads this
    // bundled page (Tamkeen Offline Entry) instead of chrome-error://.
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
