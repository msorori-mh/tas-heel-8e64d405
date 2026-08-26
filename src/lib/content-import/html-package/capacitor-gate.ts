/**
 * Capability gate for checking whether interactive HTML execution is allowed in the current runtime environment.
 * Until Native WebView isolation tests prove bridge security, interactive HTML is DISABLED on Capacitor/Mobile.
 */

export interface CapabilityGateResult {
  allowed: boolean;
  reason?: string;
  userMessage?: string;
}

export function evaluateRuntimeCapability(): CapabilityGateResult {
  if (typeof window === "undefined") {
    // Server-side rendering environment
    return {
      allowed: false,
      reason: "SSR environment",
      userMessage: "المحتوى التفاعلي متاح في العرض المباشر على المتصفح.",
    };
  }

  const win = window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean; platform?: string };
    CapacitorBridge?: unknown;
    androidBridge?: unknown;
    webkit?: { messageHandlers?: unknown };
  };

  // Check Capacitor / Mobile native environment
  const isCapacitorNative = Boolean(
    win.Capacitor?.isNativePlatform?.() ||
    win.Capacitor?.platform === "android" ||
    win.Capacitor?.platform === "ios" ||
    win.CapacitorBridge ||
    win.androidBridge ||
    win.webkit?.messageHandlers,
  );

  if (isCapacitorNative) {
    return {
      allowed: false,
      reason:
        "Interactive HTML runtime disabled on Capacitor/Native platform until WebView bridge isolation is proven.",
      userMessage:
        "المحتوى التفاعلي متاح حالياً في نسخة الويب، وسيتم دعم تشغيله الآمن داخل التطبيق لاحقاً.",
    };
  }

  // Check standard web browser
  const isWebBrowser = typeof win.document !== "undefined" && typeof win.location !== "undefined";

  if (isWebBrowser) {
    return {
      allowed: true,
    };
  }

  // Unknown / unproven environment
  return {
    allowed: false,
    reason: "Unknown execution environment.",
    userMessage: "المحتوى التفاعلي غير مدعوم في هذه البيئة.",
  };
}
