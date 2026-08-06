import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import type { HomeStats } from "@/hooks/use-home-dashboard";

/** Step 1 of the home page: short welcome, progress ring and a single CTA. */
export function WelcomeCard({ stats }: { stats?: HomeStats }) {
  const { profile } = useAuth();
  const name = profile?.full_name?.trim().split(" ")[0] || "بك";
  const percent = stats?.progressPercent ?? 0;

  return (
    <section className="student-hero-boost p-4 sm:p-5">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-primary">مرحبًا {name}</p>
          <h1 className="text-headline mt-1 text-foreground">اليوم خطوة، غدًا إنجاز.</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            أكملت {stats?.completedLessons ?? 0} من {stats?.totalLessons ?? 0} درسًا في منهجك.
          </p>
        </div>
        <div
          className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-4 border-primary/20 bg-card text-primary sm:h-20 sm:w-20"
          aria-hidden
        >
          <span className="text-lg font-black sm:text-xl">{percent}%</span>
        </div>
      </div>

      <div className="mt-3">
        <Progress value={percent} className="h-2" />
      </div>

      <Button asChild size="lg" variant="hero" className="mt-4 w-full gap-2 sm:w-auto">
        <Link to="/semesters">
          <Sparkles className="h-4 w-4" aria-hidden />
          تابع الدراسة
        </Link>
      </Button>
    </section>
  );
}
