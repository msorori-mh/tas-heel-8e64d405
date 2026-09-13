import { useEffect, useSyncExternalStore } from "react";
import {
  dataSaverSnapshot,
  getDataSaverEnabled,
  subscribeDataSaver,
} from "@/lib/offline/data-saver";

export function useDataSaver(): boolean {
  const enabled = useSyncExternalStore(subscribeDataSaver, dataSaverSnapshot, () => true);
  useEffect(() => {
    void getDataSaverEnabled();
  }, []);
  return enabled;
}
