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
import { MinisterialExamsEntry } from "@/components/home/MinisterialExamsEntry";
import { QuickReviewEntry } from "@/components/home/QuickReviewEntry";
import { PerformanceEntry } from "@/components/home/PerformanceEntry";
import { MyMistakesEntry } from "@/components/home/MyMistakesEntry";

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
    <div className="space-y-5 pb-4 lg:space-y-6" dir="rtl">
      {/* 1. Welcome + 2. Today's mission */}
      <div className="grid gap-5 lg:grid-cols-12 lg:items-stretch lg:gap-6">
        <div className="lg:col-span-8 lg:flex lg:flex-col">
          <WelcomeCard stats={stats} />
        </div>
        <div className="lg:col-span-4 lg:flex lg:flex-col">
          <TodayMissionCard items={continueItems} loading={continueLoading} />
        </div>
      </div>

      <HomeSubscriptionBanner />

      {/* 3. Four compact KPI cards */}
      <ProgressSummary stats={stats} loading={statsLoading} />

      {/* 4. Continue where you left off */}
      <ContinueSection items={continueItems} loading={continueLoading} />

      {/* 5. Semesters */}
      <SemesterPicker />

      {/* 5b. Ministerial exam models (third secondary only) */}
      <QuickReviewEntry />
      <PerformanceEntry />
      <MyMistakesEntry />
      <MinisterialExamsEntry />

      {/* 6. Achievements + 7. AI assistant */}
      <div className="grid gap-5 lg:grid-cols-12 lg:items-stretch lg:gap-6">
        <div className="lg:col-span-8 lg:flex lg:flex-col">
          <AchievementsSection badges={badges.slice(0, 3)} loading={badgesLoading} />
        </div>
        <div id="ai-assistant" className="scroll-mt-20 lg:col-span-4 lg:flex lg:flex-col">
          <AiAssistantCard />
        </div>
      </div>
    </div>
  );
}

