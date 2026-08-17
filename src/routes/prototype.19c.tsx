import { createFileRoute } from "@tanstack/react-router";
import { BookOpen, CheckCircle2, Flame, Target } from "lucide-react";
import {
  DsBadge,
  DsButton,
  DsCard,
  DsProgress,
  DsScope,
  DsSectionTitle,
  DsStat,
} from "@/components/design-system/ds-v2";
import {
  DS_V2_COLORS,
  DS_V2_ELEVATION,
  DS_V2_RADII,
  DS_V2_TYPE_SCALE,
} from "@/lib/design/ds-v2-tokens";

export const Route = createFileRoute("/prototype/19c")({
  component: DesignSystemShowcase,
  head: () => ({
    meta: [
      { title: "نظام تصميم تمكين V2 — الأساس 19C" },
      {
        name: "description",
        content:
          "عرض مرجعي لأساس نظام تصميم تمكين V2: الألوان، الحواف، الظلال، المقياس الطباعي، والمكونات الأساسية.",
      },
      { property: "og:title", content: "نظام تصميم تمكين V2 — الأساس 19C" },
      {
        property: "og:description",
        content: "الرموز والمكونات الأساسية لنظام تصميم تمكين V2، بدون تعميم على التطبيق.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function DesignSystemShowcase() {
  return (
    <DsScope className="px-4 py-6">
      <div className="mx-auto w-full max-w-[720px]">
        <header className="mb-5">
          <DsBadge tone="secondary">19C — Foundation only</DsBadge>
          <h1 className="mt-2 text-[22px] font-extrabold text-foreground">
            نظام تصميم تمكين V2 — الأساس
          </h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            مرجع مصدري للرموز والمكونات. لا تعميم على التطبيق، ولا نشر، ولا تغييرات في قاعدة
            البيانات.
          </p>
        </header>

        <div className="mb-5">
          <DsSectionTitle>الألوان</DsSectionTitle>
          <DsCard>
            <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {DS_V2_COLORS.map((c) => (
                <li key={c.cssVar} className="min-w-0">
                  <div
                    className="h-10 w-full rounded-[var(--ds-radius-sm)] border border-border"
                    style={{ background: `var(${c.cssVar})` }}
                    aria-hidden
                  />
                  <p className="mt-1 truncate text-[12px] font-bold text-foreground">{c.name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{c.usage}</p>
                </li>
              ))}
            </ul>
          </DsCard>
        </div>

        <div className="mb-5">
          <DsSectionTitle>الحواف والظلال</DsSectionTitle>
          <div className="grid grid-cols-2 gap-2.5">
            <DsCard>
              <ul className="space-y-2">
                {DS_V2_RADII.map((r) => (
                  <li key={r.cssVar} className="flex items-center gap-2.5">
                    <span
                      className="h-8 w-8 shrink-0 border border-border bg-muted"
                      style={{ borderRadius: `var(${r.cssVar})` }}
                      aria-hidden
                    />
                    <span className="min-w-0 truncate text-[12px] text-muted-foreground">
                      {r.name} — {r.usage}
                    </span>
                  </li>
                ))}
              </ul>
            </DsCard>
            <div className="space-y-2.5">
              {DS_V2_ELEVATION.map((e) => (
                <DsCard key={e.cssVar} tone={e.name === "raised" ? "raised" : "plain"}>
                  <p className="text-[12px] font-bold text-foreground">{e.name}</p>
                  <p className="text-[11px] text-muted-foreground">{e.usage}</p>
                </DsCard>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-5">
          <DsSectionTitle>المقياس الطباعي</DsSectionTitle>
          <DsCard>
            <ul className="space-y-2">
              {DS_V2_TYPE_SCALE.map((t) => (
                <li key={t.name}>
                  <p className={t.className}>تمكين — استعد للامتحان الوزاري بثقة</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t.name} · {t.usage}
                  </p>
                </li>
              ))}
            </ul>
          </DsCard>
        </div>

        <div className="mb-5">
          <DsSectionTitle>المكونات الأساسية</DsSectionTitle>
          <div className="space-y-2.5">
            <DsCard>
              <div className="flex flex-wrap gap-2">
                <DsButton variant="primary">ابدأ الدرس</DsButton>
                <DsButton variant="secondary">تدرّب الآن</DsButton>
                <DsButton variant="quiet">لاحقاً</DsButton>
                <DsButton variant="signature">تحدّي وزاري</DsButton>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <DsBadge tone="muted">
                  <BookOpen className="h-3.5 w-3.5" aria-hidden /> الكتاب الرسمي
                </DsBadge>
                <DsBadge tone="goal">
                  <Target className="h-3.5 w-3.5" aria-hidden /> هدف اليوم
                </DsBadge>
                <DsBadge tone="success">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> مكتمل
                </DsBadge>
                <DsBadge tone="secondary">
                  <Flame className="h-3.5 w-3.5" aria-hidden /> 5 أيام
                </DsBadge>
              </div>
            </DsCard>

            <DsCard>
              <p className="mb-2 text-[12px] font-bold text-foreground">مؤشرات التقدّم</p>
              <div className="space-y-2.5">
                <DsProgress value={72} label="تقدّم المادة" />
                <DsProgress value={45} tone="goal" label="هدف اليوم" />
                <DsProgress value={100} tone="success" label="درس مكتمل" />
              </div>
            </DsCard>

            <div className="grid grid-cols-3 gap-2.5">
              <DsStat label="الدروس" value="18" hint="من 40" />
              <DsStat label="الدقة" value="84%" hint="آخر 7 أيام" />
              <DsStat label="الأيام" value="5" hint="متتالية" />
            </div>

            <DsCard tone="signature">
              <p className="text-[13.5px] font-bold">سطح التدرّج التوقيعي</p>
              <p className="mt-0.5 text-[12px] opacity-90">
                يُستخدم للحظات التحفيز فقط — لا كخلفية عامة.
              </p>
            </DsCard>
          </div>
        </div>

        <DsCard>
          <p className="fm-read">
            نص القراءة الطويلة يستخدم مقياس <span className="font-bold">fm-read</span> لضمان راحة
            القراءة العربية داخل محتوى الكتاب الرسمي، مع تباعد أسطر مناسب للشاشات الصغيرة.
          </p>
        </DsCard>
      </div>
    </DsScope>
  );
}
