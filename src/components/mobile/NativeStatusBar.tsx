import { useEffect } from "react";
import { Capacitor, SystemBars, SystemBarsStyle, SystemBarType } from "@capacitor/core";
import { StatusBar, Style } from "@capacitor/status-bar";

/** Also updates installed shells that load the remote web application. */
export function NativeStatusBar() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let mounted = true;
    const apply = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Light });
        await StatusBar.setBackgroundColor({ color: "#FFFFFF" });
        // Capacitor 8 owns edge-to-edge bars on Android 16. Keep its status
        // style aligned without removing the CSS safe inset needed there.
        if (Capacitor.isPluginAvailable("SystemBars")) {
          await SystemBars.setStyle({ style: SystemBarsStyle.Light, bar: SystemBarType.StatusBar });
        }
        // Android <=14 supports a non-overlay WebView. Its top inset is
        // already consumed by native layout; don't pad the header twice.
        const android = navigator.userAgent.match(/Android\s+(\d+)/);
        if (Capacitor.getPlatform() === "android" && android && Number(android[1]) < 15) {
          const info = await StatusBar.getInfo();
          if (mounted)
            document.documentElement.classList.toggle(
              "native-status-inset-consumed",
              !info.overlays,
            );
        }
      } catch {
        // Older shells may not expose SystemBars; the status-bar style above
        // remains sufficient. Browser builds never enter this native effect.
      }
    };
    void apply();
    return () => {
      mounted = false;
    };
  }, []);
  return null;
}
