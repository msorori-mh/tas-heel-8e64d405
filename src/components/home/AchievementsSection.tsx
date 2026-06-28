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
    <section aria-label="الإنجازات">
      <h2 className="mb-3 text-sm font-bold text-foreground">إنجازاتك</h2>

      {loading && (
        <div className="flex items-center justify-center rounded-xl border border-border bg-card py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && badges.length === 0 && (
        <div className="card-edu-achievement p-4 text-center">
          <p className="text-sm font-semibold text-foreground">شارات الإنجاز بانتظارك</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            أكمل دروسك واختباراتك لتحصل على شارات تقدّمك.
          </p>
        </div>
      )}

      {!loading && badges.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {badges.map((badge) => {
            const earned = Boolean(badge.earnedAt);
            const Icon = ICON_MAP[badge.icon] ?? Award;
            return (
              <div
                key={badge.id}
                className={`rounded-xl border p-3 text-right transition-opacity ${
                  earned
                    ? "border-border/60 bg-card shadow-sm"
                    : "border-dashed border-border bg-muted/20 opacity-60"
                }`}
              >
                <div
                  className="mb-2 flex h-9 w-9 items-center justify-center rounded-lg"
                  style={{ backgroundColor: `${badge.color}20`, color: badge.color }}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <p className="text-xs font-bold text-foreground">{badge.name}</p>
                <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground">
                  {badge.description}
                </p>
                {!earned && (
                  <span className="mt-1 inline-block text-[10px] text-muted-foreground">قريبًا</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
