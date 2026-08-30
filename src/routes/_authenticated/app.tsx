import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { useAuth } from "@/hooks/use-auth";
import { useHomeDashboard } from "@/hooks/use-home-dashboard";

import { StateMessage } from "@/components/student/StudentNav";
import { HomeGreeting } from "@/components/home/HomeGreeting";
import { ContinueLearningCard } from "@/components/home/ContinueLearningCard";
import { DailyGoalCard } from "@/components/home/DailyGoalCard";
import { NeedsAttentionSection } from "@/components/home/NeedsAttentionSection";
import { CompactProgress } from "@/components/home/CompactProgress";
import { HomeSubscriptionBanner } from "@/components/home/HomeSubscriptionBanner";
import { AchievementsSection } from "@/components/home/AchievementsSection";
import { AiAssistantCard } from "@/components/home/AiAssistantCard";
import { SemesterPicker } from "@/components/home/SemesterPicker";
import { LearningToolsSection } from "@/components/home/LearningToolsSection";

const searchSchema = z.object({
  semester: fallback(z.union([z.literal(1), z.literal(2)]).optional(), undefined),
});

export const Route = createFileRoute("/_authenticated/app")({
  validateSearch: zodValidator(searchSchema),
  // Legacy links (/app?semester=1) now belong to the dedicated subjects route.
  beforeLoad: ({ search }) => {
    if (search.semester) {
      throw redirect({
        to: "/semesters/$semester",
        params: { semester: String(search.semester) },
      });
    }
  },
  component: StudentHome,
});

function StudentHome() {
  const { loading } = useAuth();
  const { stats, continueItems, continueLoading, badges } = useHomeDashboard();

  if (loading) {
    return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;
  }

  // 21B4F — achievements are a real feature but never a "قريباً" placeholder on Home.
  const earnedBadges = badges.filter((b) => b.earnedAt);

  return (
    // 19D — route-level Design System V2 opt-in (presentation only).
    <div className="ds-v2 space-y-3 pb-4 lg:space-y-4" dir="rtl">
      {/* 1. Greeting */}
      <HomeGreeting hint="خطوة واحدة اليوم تصنع الفرق." />

      <HomeSubscriptionBanner />

      {/* 2. Continue learning — primary CTA of the page */}
      <ContinueLearningCard items={continueItems} loading={continueLoading} />

      {/* 3. Daily goal */}
      <DailyGoalCard items={continueItems} />

      {/* 4. Needs attention — hidden when there is no real signal */}
      <NeedsAttentionSection items={continueItems} />

      {/* 5. Quick actions */}
      <LearningToolsSection />

      {/* 6. Subjects */}
      <SemesterPicker />

      {/* 7. Compact progress */}
      <CompactProgress stats={stats} />

      {earnedBadges.length > 0 && (
        <AchievementsSection badges={earnedBadges.slice(0, 3)} loading={false} />
      )}

      {/* Secondary — always after Continue Learning */}
      <div id="study-suggestions" className="scroll-mt-20">
        <AiAssistantCard />
      </div>
    </div>
  );
}
