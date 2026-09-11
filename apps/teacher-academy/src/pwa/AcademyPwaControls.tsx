import { useEffect, useState } from "react";
import { Download, RefreshCw, Share2, WifiOff, X } from "lucide-react";
import {
  activateAcademyUpdate,
  getAcademyPwaState,
  initializeAcademyPwa,
  isAcademyIos,
  isAcademyStandalone,
  requestAcademyInstall,
  subscribeAcademyPwa,
} from "./academy-pwa";

export function AcademyPwaControls() {
  const [state, setState] = useState(getAcademyPwaState);
  const [dismissed, setDismissed] = useState(false);
  const standalone = isAcademyStandalone();
  const ios = isAcademyIos();

  useEffect(() => {
    initializeAcademyPwa();
    return subscribeAcademyPwa(setState);
  }, []);

  return (
    <>
      {!state.online ? (
        <div className="academy-connection-status" role="status">
          <WifiOff />
          <span>دون اتصال — يمكنك تصفّح المحتويات المحفوظة.</span>
        </div>
      ) : null}
      <aside className="academy-pwa-controls" aria-live="polite">
        {state.updateReady ? (
          <div className="academy-pwa-notice update" role="status">
            <RefreshCw />
            <span>يتوفر تحديث جديد لأكاديمية تمكين.</span>
            <button type="button" onClick={activateAcademyUpdate}>
              تحديث الآن
            </button>
          </div>
        ) : null}

        {!standalone && !dismissed && (state.installPrompt || ios) ? (
          <div className="academy-pwa-notice install" role="status">
            {ios ? <Share2 /> : <Download />}
            <span>
              {ios
                ? "لتثبيت الأكاديمية: اضغط مشاركة ثم «إضافة إلى الشاشة الرئيسية»."
                : "ثبّت أكاديمية تمكين على جوالك للوصول إليها كتطبيق مستقل."}
            </span>
            {!ios ? (
              <button type="button" onClick={() => void requestAcademyInstall()}>
                تثبيت التطبيق
              </button>
            ) : null}
            <button
              className="academy-pwa-dismiss"
              type="button"
              aria-label="إخفاء رسالة التثبيت"
              onClick={() => setDismissed(true)}
            >
              <X />
            </button>
          </div>
        ) : null}
      </aside>
    </>
  );
}
