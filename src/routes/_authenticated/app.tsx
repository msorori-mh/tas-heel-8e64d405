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
  const { stats, statsLoading, continueItems, continueLoading, badges, badgesLoading } =
    useHomeDashboard();

  if (loading) {
    return <StateMessage variant="loading">جارٍ التحميل…</StateMessage>;
  }

  return (
    // 19D — route-level Design System V2 opt-in (presentation only).
    <div className="ds-v2 space-y-3.5 pb-4 lg:space-y-4" dir="rtl">
      {/* 1. Compact greeting */}
      <WelcomeCard stats={stats} />

      <HomeSubscriptionBanner />

      {/* 2. Continue learning */}
      <ContinueSection items={continueItems} loading={continueLoading} />

      {/* 3. Daily goal */}
      <TodayMissionCard items={continueItems} loading={continueLoading} />

      {/* 4. Quick actions (quick review / mistakes / performance / ministerial) */}
      <LearningToolsSection />

      {/* 5. Needs attention — real progress signals only */}
      <ProgressSummary stats={stats} loading={statsLoading} />

      {/* 6. Subjects compact progress */}
      <SemesterPicker />

      <div className="grid gap-4 lg:grid-cols-12 lg:items-stretch lg:gap-5">
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



