import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { applyPendingUpdate, PWA_UPDATE_EVENT } from "@/lib/pwa/register-sw";

/**
 * Non-blocking update notice shown when a new service worker version is
 * waiting. Activation only happens through the explicit «تحديث الآن»
 * action — never automatically — so an open study or exam session is
 * never interrupted. The banner does not cache or persist anything and
 * can be dismissed safely; it reappears on the next update.
 */
export function PwaUpdateNotice() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent<ServiceWorkerRegistration>;
      if (custom.detail) {
        setDismissed(false);
        setRegistration(custom.detail);
      }
    };
    window.addEventListener(PWA_UPDATE_EVENT, handler);
    return () => window.removeEventListener(PWA_UPDATE_EVENT, handler);
  }, []);

  if (!registration || dismissed) return null;

  return (
    <div
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-md rounded-xl border border-primary/20 bg-card/95 p-3 shadow-card-hover backdrop-blur-sm pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </div>
        <p className="min-w-0 flex-1 text-xs leading-relaxed text-foreground">
          تتوفر نسخة جديدة من التطبيق. حدّث الآن أو تابع عملك — لن ينقطع شيء.
        </p>
        <button
          type="button"
          onClick={() => applyPendingUpdate(registration)}
          className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-primary px-3 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          تحديث الآن
        </button>
        <button
          type="button"
          className="min-h-11 min-w-11 shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="لاحقاً"
          onClick={() => setDismissed(true)}
        >
          <X className="mx-auto h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
