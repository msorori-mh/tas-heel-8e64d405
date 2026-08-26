/**
 * TAMKEEN_DESIGN_SYSTEM_V2_FOUNDATION_19C — token source of truth (TS mirror).
 *
 * BASE_SHA=a8f6ee3f1a93a11ddfddc0783dadcbab1259411a
 *
 * These values mirror the `.ds-v2` CSS custom properties in `src/styles.css`.
 * They exist for documentation, showcase rendering and future audits ONLY.
 * Components must consume the CSS variables / semantic Tailwind classes —
 * never these raw hex strings — so theming stays in one place.
 */

export type DsColorToken = {
  readonly name: string;
  readonly cssVar: string;
  readonly value: string;
  readonly usage: string;
};

export const DS_V2_COLORS: readonly DsColorToken[] = [
  { name: "background", cssVar: "--background", value: "#FBFAF7", usage: "خلفية الصفحة الدافئة" },
  { name: "foreground", cssVar: "--foreground", value: "#131A33", usage: "النص الأساسي" },
  { name: "card", cssVar: "--card", value: "#FFFFFF", usage: "أسطح البطاقات" },
  {
    name: "primary",
    cssVar: "--primary",
    value: "#1E2A63",
    usage: "Deep Indigo — الهوية والأزرار الأساسية",
  },
  {
    name: "secondary",
    cssVar: "--secondary",
    value: "#0EA5E9",
    usage: "Electric Blue — التفاعل والتمييز",
  },
  { name: "accent", cssVar: "--accent", value: "#06B6D4", usage: "Cyan — نهاية التدرّج واللمسات" },
  { name: "muted", cssVar: "--muted", value: "#F1F0EC", usage: "أسطح هادئة ومسارات التقدّم" },
  { name: "muted-foreground", cssVar: "--muted-foreground", value: "#56607F", usage: "نص ثانوي" },
  { name: "success", cssVar: "--success", value: "#10B981", usage: "الإنجاز والاكتمال" },
  { name: "destructive", cssVar: "--destructive", value: "#F87171", usage: "تحذير/خطأ" },
  { name: "goal", cssVar: "--fm-goal", value: "#F59E0B", usage: "Amber — الهدف اليومي" },
  { name: "border", cssVar: "--border", value: "#E6E4DC", usage: "الحدود والفواصل" },
] as const;

export const DS_V2_RADII = [
  { name: "sm", cssVar: "--ds-radius-sm", value: "0.625rem", usage: "الشارات والحقول الصغيرة" },
  { name: "md", cssVar: "--ds-radius-md", value: "1rem", usage: "البطاقة القياسية" },
  { name: "lg", cssVar: "--ds-radius-lg", value: "1.25rem", usage: "الأسطح البطلة" },
  { name: "pill", cssVar: "--ds-radius-pill", value: "999px", usage: "الأزرار الدائرية والشارات" },
] as const;

export const DS_V2_ELEVATION = [
  { name: "card", cssVar: "--fm-card-shadow", usage: "ظل البطاقة الافتراضي" },
  { name: "raised", cssVar: "--ds-shadow-raised", usage: "العناصر العائمة/المميزة" },
] as const;

export const DS_V2_TYPE_SCALE = [
  { name: "display", className: "text-[22px] font-extrabold", usage: "عنوان الشاشة" },
  { name: "title", className: "text-[15px] sm:text-base font-bold", usage: "عنوان القسم" },
  { name: "body", className: "text-[13.5px]", usage: "النص العام" },
  { name: "read", className: "fm-read", usage: "نص القراءة الطويلة (كتاب رسمي)" },
  { name: "caption", className: "text-[11px] font-semibold", usage: "التسميات والشارات" },
] as const;

/** Scope class that activates the V2 token surface. 19C = foundation only. */
export const DS_V2_SCOPE = "ds-v2" as const;

/** Rollout state — flipped only in a later, explicitly approved stage. */
export const DS_V2_APP_ROLLOUT_ENABLED = false;
