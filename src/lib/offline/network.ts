/**
 * 18C-4 — network conditions for smart prefetch.
 *
 * Prefetch is Wi-Fi only. On the web the Network Information API is used when
 * available; otherwise prefetch stays disabled (never guess on mobile data).
 */

import { Capacitor } from "@capacitor/core";

export type NetworkState = { online: boolean; wifi: boolean; type: string };

export async function getNetworkState(): Promise<NetworkState> {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Network } = await import("@capacitor/network");
      const status = await Network.getStatus();
      return {
        online: status.connected,
        wifi: status.connectionType === "wifi",
        type: status.connectionType,
      };
    }
  } catch {
    /* fall through to web detection */
  }

  const online = typeof navigator === "undefined" ? true : navigator.onLine;
  const conn = (navigator as unknown as { connection?: { type?: string; effectiveType?: string; saveData?: boolean } })
    ?.connection;
  const type = conn?.type ?? conn?.effectiveType ?? "unknown";
  const wifi = type === "wifi" || type === "ethernet";
  if (conn?.saveData) return { online, wifi: false, type };
  return { online, wifi, type };
}

/** Rough free-space probe; returns null when the browser cannot tell. */
export async function getFreeStorageBytes(): Promise<number | null> {
  try {
    if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
    const { quota, usage } = await navigator.storage.estimate();
    if (typeof quota !== "number") return null;
    return Math.max(0, quota - (usage ?? 0));
  } catch {
    return null;
  }
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "—";
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.max(1, Math.round(bytes / 1024))} كيلوبايت`;
  if (mb < 1024) return `${mb.toFixed(mb < 10 ? 1 : 0)} ميجابايت`;
  return `${(mb / 1024).toFixed(1)} جيجابايت`;
}
