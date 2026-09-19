/**
 * Source adapter registry for the diagnostics center.
 *
 * Only the in-app source is live. Google Play Android Vitals and Crashlytics
 * are declared here so a future integration has one place to plug into — we
 * never fabricate crash/ANR rates while no real source is connected.
 */

export type DiagnosticsSourceAdapterId = "in_app" | "google_play" | "crashlytics";

export type DiagnosticsSourceAdapter = {
  id: DiagnosticsSourceAdapterId;
  label: string;
  connected: boolean;
  /** Arabic explanation shown in the admin UI when not connected. */
  note: string;
};

export const DIAGNOSTICS_SOURCE_ADAPTERS: DiagnosticsSourceAdapter[] = [
  {
    id: "in_app",
    label: "تتبّع داخل التطبيق",
    connected: true,
    note: "الأخطاء المسجّلة من تطبيق تمكين مباشرة.",
  },
  {
    id: "google_play",
    label: "Google Play — مؤشرات الأداء",
    connected: false,
    note: "غير مربوط بعد. معدلات الأعطال وANR لن تظهر حتى يتم الربط بمصدر فعلي.",
  },
  {
    id: "crashlytics",
    label: "Firebase Crashlytics",
    connected: false,
    note: "غير مربوط بعد. لا توجد بيانات أعطال أصلية من الأندرويد حالياً.",
  },
];
