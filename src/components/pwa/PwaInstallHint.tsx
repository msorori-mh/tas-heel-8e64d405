import { useEffect, useState } from "react";
import { Download, Share, Smartphone, X } from "lucide-react";
import {
  getDeferredInstallPrompt,
  isIosDevice,
  isStandaloneDisplay,
  onInstallPromptChange,
  type BeforeInstallPromptEvent,
} from "@/lib/pwa/install-prompt";

const DISMISS_KEY = "pwa-install-hint-dismissed";

/**
 * Install hint for the public landing page (not shown to admins).
 * - Android/Chromium: triggers the native install prompt when available.
 * - iOS Safari: shows manual Add-to-Home-Screen guidance.
 * - Other browsers: generic guidance.
 */
export function PwaInstallHint() {
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    if (isStandaloneDisplay()) return;
    setIos(isIosDevice());
    setDeferred(getDeferredInstallPrompt());
    setVisible(true);
    return onInstallPromptChange((event) => {
      setDeferred(event);
    });
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") {
        dismiss();
      }
    } catch {
      // User closed the native dialog or the browser rejected it; keep hint.
    }
  };

  return (
    <div
      className="mx-4 mb-6 rounded-xl border border-primary/20 bg-card/95 p-4 shadow-card backdrop-blur-sm pb-[max(1rem,env(safe-area-inset-bottom))]"
      role="note"
      aria-label="تثبيت التطبيق على الجوال"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Smartphone className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-foreground">أضف التطبيق إلى الشاشة الرئيسية</p>
          {deferred ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              ثبّت التطبيق على جهازك للوصول السريع أثناء المذاكرة — مجاناً وبدون متجر.
            </p>
          ) : ios ? (
            <p className="text-xs leading-relaxed text-muted-foreground">
              في Safari على آيفون/آيباد: اضغط زر المشاركة{" "}
              <Share className="inline h-3.5 w-3.5 align-text-bottom" aria-hidden="true" /> ثم اختر
              «إضافة إلى الشاشة الرئيسية».
            </p>
          ) : (
            <p className="text-xs leading-relaxed text-muted-foreground">
              من قائمة المتصفح على الجوال، اختر «إضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق»
              للوصول السريع أثناء المذاكرة.
            </p>
          )}
          {deferred ? (
            <button
              type="button"
              onClick={install}
              className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              تثبيت التطبيق الآن
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="min-h-11 min-w-11 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="إغلاق تلميح التثبيت"
          onClick={dismiss}
        >
          <X className="mx-auto h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
