import {
  Award,
  BookOpen,
  Crown,
  Flame,
  Gem,
  Loader2,
  Star,
  Target,
  Trophy,
  Coins,
  type LucideIcon,
} from "lucide-react";
import type { EarnedBadge } from "@/hooks/use-home-dashboard";

const ICON_MAP: Record<string, LucideIcon> = {
  BookOpen,
  Flame,
  Target,
  Crown,
  Star,
  Coins,
  Gem,
  Award,
  Trophy,
};

type AchievementsSectionProps = {
  badges: EarnedBadge[];
  loading: boolean;
};

export function AchievementsSection({ badges, loading }: AchievementsSectionProps) {
  return (
    <section aria-label="الإنجازات" className="flex h-full flex-col">
      <h2 className="mb-3 text-xl font-bold text-foreground lg:text-[22px]">إنجازاتك</h2>

      {loading && (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && badges.length === 0 && (
        <div className="card-edu-achievement p-4 text-center">
          <p className="text-base font-semibold text-foreground">شارات الإنجاز بانتظارك</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            أكمل دروسك واختباراتك لتحصل على شارات تقدّمك.
          </p>
        </div>
      )}

      {!loading && badges.length > 0 && (
        <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-3">
          {badges.map((badge) => {
            const earned = Boolean(badge.earnedAt);
            const Icon = ICON_MAP[badge.icon] ?? Award;
            return (
              <div
                key={badge.id}
                className={`h-full rounded-2xl border p-4 text-right shadow-sm transition-colors ${
                  earned
                    ? "border-border bg-card"
                    : "border-dashed border-border bg-muted/40 opacity-90"
                }`}
              >
                <div
                  className="mb-2.5 flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${badge.color}20`, color: badge.color }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <p className="text-base font-bold text-foreground">{badge.name}</p>
                <p className="mt-1 line-clamp-2 text-sm leading-snug text-foreground/70">
                  {badge.description}
                </p>
                {!earned && (
                  <span className="mt-2 inline-block rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-foreground/70">
                    قريبًا
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
