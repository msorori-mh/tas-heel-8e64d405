import { useAuth } from "@/hooks/use-auth";

/**
 * 21B4F — compact greeting. Replaces the tall hero: one line + optional helper
 * line, no illustration, no duplicated CTA (Continue Learning owns the CTA).
 */
export function HomeGreeting({ hint }: { hint?: string }) {
  const { profile } = useAuth();
  const name = profile?.full_name?.trim().split(" ")[0] || "بك";

  return (
    <section aria-label="ترحيب" className="pt-0.5">
      <h1 className="truncate text-xl font-black leading-tight text-foreground lg:text-2xl">
        مرحباً، {name}
      </h1>
      {hint ? <p className="mt-0.5 text-[13px] text-muted-foreground">{hint}</p> : null}
    </section>
  );
}
