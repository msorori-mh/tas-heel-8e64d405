import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { computeStudyStreak } from "@/lib/home/streak";

export type ContinueItem = {
  lessonId: string;
  lessonTitle: string;
  subjectId: string;
  subjectName: string;
  subjectColor: string | null;
  semester: number | null;
  completed: boolean;
  quizScore: number | null;
  updatedAt: string;
};

export type EarnedBadge = {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  earnedAt: string;
};

export type HomeStats = {
  streakDays: number;
  totalPoints: number;
  examsCompleted: number;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
};

export function useHomeDashboard() {
  const { user, profile } = useAuth();
  const gradeKey = profile?.grade_uuid ?? (profile?.grade_id ? String(profile.grade_id) : null);
  const trackId = profile?.curriculum_track_id ?? null;

  const statsQ = useQuery({
    enabled: !!user?.id,
    queryKey: ["home-stats", user?.id, gradeKey, trackId],
    queryFn: async (): Promise<HomeStats> => {
      const uid = user!.id;

      const [pointsRes, examsRes, progressRes, practiceRes, lessonsRes] = await Promise.all([
        supabase.rpc("get_user_total_points", { _user_id: uid }),
        supabase.from("exam_sessions").select("id, status, started_at").eq("user_id", uid),
        supabase
          .from("user_progress")
          .select("lesson_id, completed, updated_at, created_at")
          .eq("user_id", uid),
        supabase
          .from("unit_practice_attempts")
          .select("created_at")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(90),
        gradeKey
          ? supabase
              .from("lessons")
              .select("id, subject_id, subjects!inner(grade_id, curriculum_track_id)")
              .eq("subjects.grade_id", gradeKey)
          : Promise.resolve({ data: [], error: null }),
      ]);

      const activityDates: string[] = [];
      for (const p of progressRes.data ?? []) {
        if (p.updated_at) activityDates.push(p.updated_at);
        if (p.created_at) activityDates.push(p.created_at);
      }
      for (const e of examsRes.data ?? []) {
        if (e.started_at) activityDates.push(e.started_at);
      }
      for (const a of practiceRes.data ?? []) {
        if (a.created_at) activityDates.push(a.created_at);
      }

      const streakDays = computeStudyStreak(activityDates);
      const totalPoints = Number(pointsRes.data ?? 0);
      const examsCompleted = (examsRes.data ?? []).filter((e) => e.status === "submitted").length;

      const progressRows = progressRes.data ?? [];
      const completedLessons = progressRows.filter((p) => p.completed).length;

      let totalLessons = 0;
      if (lessonsRes.data) {
        totalLessons = (
          lessonsRes.data as Array<{
            id: string;
            subject_id: string;
            subjects: { grade_id: string; curriculum_track_id: string | null };
          }>
        ).filter(
          (l) =>
            l.subjects.curriculum_track_id === null || l.subjects.curriculum_track_id === trackId,
        ).length;
      }

      const progressPercent =
        totalLessons > 0 ? Math.min(100, Math.round((completedLessons / totalLessons) * 100)) : 0;

      return {
        streakDays,
        totalPoints,
        examsCompleted,
        progressPercent,
        completedLessons,
        totalLessons,
      };
    },
  });

  const continueQ = useQuery({
    enabled: !!user?.id,
    queryKey: ["home-continue", user?.id],
    queryFn: async (): Promise<ContinueItem[]> => {
      const { data, error } = await supabase
        .from("user_progress")
        .select(
          "lesson_id, completed, quiz_score, updated_at, lesson:lessons!user_progress_lesson_id_fkey(id, title, subject_id, semester, subject:subjects!lessons_subject_id_fkey(id, name, color))",
        )
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false })
        .limit(4);

      if (error) throw error;

      return (
        (data ?? []) as Array<{
          lesson_id: string;
          completed: boolean | null;
          quiz_score: number | null;
          updated_at: string;
          lesson: {
            id: string;
            title: string | null;
            subject_id: string;
            semester: number | null;
            subject: { id: string; name: string; color: string | null } | null;
          } | null;
        }>
      )
        .filter((r) => r.lesson)
        .map((r) => ({
          lessonId: r.lesson!.id,
          lessonTitle: r.lesson!.title ?? "درس",
          subjectId: r.lesson!.subject_id,
          subjectName: r.lesson!.subject?.name ?? "مادة",
          subjectColor: r.lesson!.subject?.color ?? null,
          semester: r.lesson!.semester,
          completed: Boolean(r.completed),
          quizScore: r.quiz_score,
          updatedAt: r.updated_at,
        }));
    },
  });

  const badgesQ = useQuery({
    enabled: !!user?.id,
    queryKey: ["home-badges", user?.id],
    queryFn: async () => {
      const [earnedRes, allRes] = await Promise.all([
        supabase
          .from("student_badges")
          .select(
            "earned_at, badge:badges!student_badges_badge_id_fkey(id, name, description, icon, color, sort_order)",
          )
          .eq("user_id", user!.id)
          .order("earned_at", { ascending: false })
          .limit(6),
        supabase
          .from("badges")
          .select("id, name, description, icon, color, sort_order")
          .order("sort_order")
          .limit(6),
      ]);

      if (earnedRes.error) throw earnedRes.error;
      if (allRes.error) throw allRes.error;

      const earned: EarnedBadge[] = (
        (earnedRes.data ?? []) as Array<{
          earned_at: string;
          badge: {
            id: string;
            name: string;
            description: string;
            icon: string;
            color: string;
          } | null;
        }>
      )
        .filter((r) => r.badge)
        .map((r) => ({
          id: r.badge!.id,
          name: r.badge!.name,
          description: r.badge!.description,
          icon: r.badge!.icon,
          color: r.badge!.color,
          earnedAt: r.earned_at,
        }));

      const earnedIds = new Set(earned.map((b) => b.id));
      const showcase = [...earned];

      for (const b of allRes.data ?? []) {
        if (showcase.length >= 6) break;
        if (!earnedIds.has(b.id)) {
          showcase.push({
            id: b.id,
            name: b.name,
            description: b.description,
            icon: b.icon,
            color: b.color,
            earnedAt: "",
          });
        }
      }

      return showcase.slice(0, 6);
    },
  });

  return {
    stats: statsQ.data,
    statsLoading: statsQ.isLoading,
    continueItems: continueQ.data ?? [],
    continueLoading: continueQ.isLoading,
    badges: badgesQ.data ?? [],
    badgesLoading: badgesQ.isLoading,
  };
}
