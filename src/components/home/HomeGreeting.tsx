import { Flame } from "lucide-react";
import { arabicCount, DAY_FORMS } from "@/lib/i18n/arabic-count";
import { useAuth } from "@/hooks/use-auth";

/**
 * 21B4F — compact greeting. Replaces the tall hero: one line + optional helper
 * line, no illustration, no duplicated CTA (Continue Learning owns the CTA).
 */
export function HomeGreeting({ hint, streakDays = 0 }: { hint?: string; streakDays?: number }) {
  const { profile } = useAuth();
  const name = profile?.full_name?.trim().split(" ")[0] || "بك";

  return (
    <section aria-label="ترحيب" className="pt-0.5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="truncate text-xl font-black leading-tight text-foreground lg:text-2xl">
          مرحباً، {name}
        </h1>
        {streakDays > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-900">
            <Flame className="h-4 w-4" aria-hidden />
            {arabicCount(streakDays, DAY_FORMS)}
          </span>
        )}
      </div>
      {hint ? <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p> : null}
    </section>
  );
}
