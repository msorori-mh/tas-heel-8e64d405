/** OFFLINE-03 — settings summary for verified, explicit subject downloads. */

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { HardDrive, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { clearAll, isNativeStorage } from "@/lib/offline/pdf-cache";
import {
  deleteAllOfflinePacks,
  getRecordedOfflinePackBytes,
} from "@/lib/offline/offline-pack-downloader";
import { formatBytes } from "@/lib/offline/network";

export function OfflineContentSettings() {
  const [used, setUsed] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  const refreshUsage = async () => {
    setUsed(await getRecordedOfflinePackBytes().catch(() => 0));
  };
  useEffect(() => {
    void refreshUsage();
  }, []);

  const handleClear = async () => {
    setClearing(true);
    try {
      await deleteAllOfflinePacks();
      await clearAll();
    } finally {
      setClearing(false);
      await refreshUsage();
    }
  };

  return (
    <div className="space-y-3" dir="rtl">
      <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <HardDrive className="h-4 w-4" />
          المساحة المسجلة للحزم على الجهاز
        </span>
        <span className="font-semibold text-foreground">{formatBytes(used)}</span>
      </div>

      <p className="text-xs text-muted-foreground">
        تُحفظ الملفات داخل مساحة التطبيق الخاصة
        {isNativeStorage() ? " على هاتفك" : " في هذا المتصفح"} ولا تظهر في مدير الملفات.
      </p>

      <Button asChild size="sm" variant="outline">
        <Link to="/semesters">اختر مادة لتنزيلها</Link>
      </Button>

      {(used ?? 0) > 0 && (
        <Button size="sm" variant="ghost" onClick={handleClear} disabled={clearing}>
          {clearing ? (
            <Loader2 className="ms-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="ms-2 h-4 w-4" />
          )}
          إفراغ المحتوى المحمّل
        </Button>
      )}
    </div>
  );
}

export default OfflineContentSettings;
