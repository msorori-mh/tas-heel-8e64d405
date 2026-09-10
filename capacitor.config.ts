import type { CapacitorConfig } from "@capacitor/cli";

/**
 * 17B — Android release preparation for تمكين.
 *
 * Release builds load the bundled entry from `webDir`. A remote WebView is
 * available only as an explicit, private-network live-reload override for
 * development. The bundled entry reads previously verified, account-isolated
 * packs through narrow native plugins.
 */
const liveReloadUrl = process.env.TAMKEEN_CAPACITOR_LIVE_RELOAD_URL?.trim();
const liveReloadEnabled = process.env.TAMKEEN_CAPACITOR_LIVE_RELOAD === "1";

function privateLiveReloadOrigin(rawUrl: string): string {
  const url = new URL(rawUrl);
  const host = url.hostname;
  const privateHost =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  if (url.protocol !== "https:" || !privateHost || url.username || url.password || url.hash) {
    throw new Error(
      "TAMKEEN_CAPACITOR_LIVE_RELOAD_URL must be an HTTPS private-network origin without credentials or a fragment.",
    );
  }
  return url.origin;
}

if (liveReloadUrl && !liveReloadEnabled) {
  throw new Error("Set TAMKEEN_CAPACITOR_LIVE_RELOAD=1 to opt into the development server.");
}
if (liveReloadEnabled && !liveReloadUrl) {
  throw new Error("TAMKEEN_CAPACITOR_LIVE_RELOAD_URL is required when live reload is enabled.");
}

const developmentServer =
  liveReloadEnabled && liveReloadUrl ? { url: privateLiveReloadOrigin(liveReloadUrl) } : undefined;

const config: CapacitorConfig = {
  appId: "app.studentamkeen.tamkeen",
  appName: "تمكين",
  webDir: "mobile/www",
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: "https",
    cleartext: false,
    hostname: "localhost",
    // Local release entry; also the fail-closed page if an opted-in development
    // server becomes unavailable.
    errorPath: "index.html",
    ...developmentServer,
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
