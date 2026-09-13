import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { useDataSaver } from "@/hooks/use-data-saver";
import { setDataSaverEnabled } from "@/lib/offline/data-saver";

export function DataSaverSetting() {
  const enabled = useDataSaver();
  const [error, setError] = useState(false);
  return (
    <div className="space-y-2 rounded-xl border border-border p-3">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="student-data-saver" className="text-sm font-semibold">
          توفير البيانات
        </label>
        <Switch
          id="student-data-saver"
          checked={enabled}
          aria-describedby="student-data-saver-description"
          onCheckedChange={(value) => {
            setError(false);
            void setDataSaverEnabled(value).catch(() => setError(true));
          }}
        />
      </div>
      <p
        id="student-data-saver-description"
        className="text-xs leading-relaxed text-muted-foreground"
      >
        يوقف تنزيل الدروس التالية وفحص تحديثات الملفات تلقائيًا، حتى على Wi-Fi. يمكنك فتح المحتوى
        وتنزيله وتحديثه بنفسك في أي وقت.
      </p>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          طُبّق الاختيار الآن، لكن تعذّر حفظه للمرة القادمة. حاول تغييره مجددًا.
        </p>
      )}
    </div>
  );
}
