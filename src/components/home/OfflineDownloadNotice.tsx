import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { deviceOfflineStateRepository } from "@/lib/offline/offline-state-store";

export function OfflineDownloadNotice() {
  const { user } = useAuth();
  const ownerId = user?.id;
  const [saved, setSaved] = useState(0);
  const [partial, setPartial] = useState(false);
  useEffect(() => {
    let active = true;
    setSaved(0);
    setPartial(false);
    if (ownerId)
      void deviceOfflineStateRepository
        .read()
        .then((state) => {
          if (active) {
            setPartial(
              state.packs.some(
                (pack) =>
                  pack.ownerId === ownerId &&
                  ["downloading", "failed", "corrupt", "stale"].includes(pack.status),
              ),
            );
            setSaved(
              state.packs.filter((pack) => pack.ownerId === ownerId && pack.status === "ready")
                .length,
            );
          }
        })
        .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [ownerId]);
  return (
    <section
      className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3"
      aria-label="المحتوى دون إنترنت"
    >
      <Download className="h-5 w-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold">دروسك معك حتى بدون إنترنت</h2>
        <p className="text-xs text-muted-foreground">
          {partial
            ? "لديك تنزيلات غير مكتملة. استكملها من الإعدادات."
            : saved
              ? `لديك ${saved} حزم محفوظة. تابع التنزيلات من الإعدادات.`
              : "حمّل محتوى موادك لتفتحه حتى عند انقطاع الاتصال."}
        </p>
      </div>
      <Link
        to="/settings"
        hash="offline"
        className="rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
      >
        {partial ? "استكمال التنزيل" : saved ? "إدارة التنزيلات" : "تحميل المحتوى"}
      </Link>
    </section>
  );
}
