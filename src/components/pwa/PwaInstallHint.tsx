import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";

const DISMISS_KEY = "pwa-install-hint-dismissed";

/**
 * Lightweight install hint for public landing pages (not shown to admins).
 */
export function PwaInstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div
      className="mx-4 mb-6 rounded-xl border border-primary/20 bg-card/95 p-4 shadow-card backdrop-blur-sm"
      role="note"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Smartphone className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-foreground">أضف التطبيق إلى الشاشة الرئيسية</p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            من قائمة المتصفح على الجوال، اختر «إضافة إلى الشاشة الرئيسية» أو «تثبيت التطبيق»
            للوصول السريع أثناء المذاكرة.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="إغلاق"
          onClick={() => {
            window.localStorage.setItem(DISMISS_KEY, "1");
            setVisible(false);
          }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
