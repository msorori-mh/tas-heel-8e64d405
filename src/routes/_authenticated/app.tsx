import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { zodValidator, fallback } from "@tanstack/zod-adapter";
import { useAuth } from "@/hooks/use-auth";
import { useHomeDashboard } from "@/hooks/use-home-dashboard";

import { StateMessage } from "@/components/student/StudentNav";
import { WelcomeCard } from "@/components/home/WelcomeCard";
import { TodayMissionCard } from "@/components/home/TodayMissionCard";
import { HomeSubscriptionBanner } from "@/components/home/HomeSubscriptionBanner";
import { ProgressSummary } from "@/components/home/ProgressSummary";
import { ContinueSection } from "@/components/home/ContinueSection";
import { AchievementsSection } from "@/components/home/AchievementsSection";
import { AiAssistantCard } from "@/components/home/AiAssistantCard";
import { SemesterPicker } from "@/components/home/SemesterPicker";

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
  const { stats, statsLoading, continueItems, continueLoading, badges, badgesLoading } =
    useHomeDashboard();

  if (loading) {
    return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;
  }

  return (
    <div className="space-y-5 pb-4" dir="rtl">
      {/* 1. Welcome */}
      <WelcomeCard stats={stats} />

      <HomeSubscriptionBanner />

      {/* 2. Today's mission */}
      <TodayMissionCard items={continueItems} loading={continueLoading} />

      {/* 3. Four compact KPI cards */}
      <ProgressSummary stats={stats} loading={statsLoading} />

      {/* 4. Continue where you left off */}
      <ContinueSection items={continueItems} loading={continueLoading} />

      {/* 5. Semesters */}
      <SemesterPicker />

      {/* 6. Short achievements */}
      <AchievementsSection badges={badges.slice(0, 3)} loading={badgesLoading} />

      {/* 7. AI assistant */}
      <div id="ai-assistant" className="scroll-mt-20">
        <AiAssistantCard />
      </div>
    </div>
  );
}
