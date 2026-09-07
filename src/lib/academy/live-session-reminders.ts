import type { LiveSession } from "../../../apps/teacher-academy/src/types";

const REMINDER_OFFSETS = [24 * 60 * 60 * 1000, 60 * 60 * 1000] as const;

type PlannedReminder = {
  id: number;
  title: string;
  body: string;
  schedule: { at: Date; allowWhileIdle: false };
  extra: { destination: "/academy"; liveSessionId: string };
};

function reminderId(sessionId: string, index: number): number {
  let hash = 2166136261;
  for (const char of sessionId) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 900_000_000) + 10_000 + index;
}

export function buildLiveSessionReminders(
  session: LiveSession,
  now = Date.now(),
): PlannedReminder[] {
  const startsAt = new Date(session.starts_at).getTime();
  if (!Number.isFinite(startsAt)) throw new Error("موعد المحاضرة غير صالح.");

  return REMINDER_OFFSETS.map((offset, index) => ({
    id: reminderId(session.live_session_id, index),
    title: "أكاديمية تمكين",
    body: index === 0 ? `غدًا: ${session.title}` : `بعد ساعة تبدأ المحاضرة: ${session.title}`,
    schedule: { at: new Date(startsAt - offset), allowWhileIdle: false as const },
    extra: { destination: "/academy" as const, liveSessionId: session.live_session_id },
  })).filter((notification) => notification.schedule.at.getTime() > now + 30_000);
}

/**
 * Schedules privacy-safe, device-local reminders for one live session.
 * It never sends the meeting URL or teacher identity to a third party.
 */
export async function scheduleLiveSessionReminders(session: LiveSession): Promise<number> {
  const { Capacitor } = await import("@capacitor/core");
  if (!Capacitor.isNativePlatform()) {
    throw new Error("تذكيرات الجهاز متاحة داخل تطبيق تمكين على Android فقط.");
  }

  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const current = await LocalNotifications.checkPermissions();
  const permission =
    current.display === "granted" ? current : await LocalNotifications.requestPermissions();
  if (permission.display !== "granted") {
    throw new Error("فعّل إذن الإشعارات من إعدادات الهاتف لتلقي تذكيرات المحاضرات.");
  }

  const ids = REMINDER_OFFSETS.map((_, index) => ({
    id: reminderId(session.live_session_id, index),
  }));
  await LocalNotifications.cancel({ notifications: ids });

  const notifications = buildLiveSessionReminders(session);

  if (notifications.length > 0) {
    await LocalNotifications.schedule({ notifications });
  }
  return notifications.length;
}
