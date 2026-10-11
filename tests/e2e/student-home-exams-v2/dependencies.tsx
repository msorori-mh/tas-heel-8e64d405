const returning = new URLSearchParams(location.search).get("student") === "returning";
export function useAuth() {
  return {
    loading: false,
    rolesLoading: false,
    isAdmin: false,
    isContentStaff: false,
    user: { id: "fixture" },
    profile: { full_name: "أحمد محمد", grade_uuid: "grade12", curriculum_track_id: "aden" },
    signOut: async () => {},
  };
}
export function OfflineSyncBridge() {
  return null;
}
export function useHomeDashboard() {
  return {
    stats: {
      streakDays: returning ? 5 : 0,
      totalPoints: 0,
      examsCompleted: returning ? 3 : 0,
      progressPercent: 35,
      completedLessons: returning ? 8 : 0,
      totalLessons: 40,
    },
    continueItems: returning
      ? [
          {
            lessonId: "iron",
            lessonTitle: "الحديد وخواصه",
            subjectId: "chemistry",
            subjectName: "الكيمياء",
            subjectColor: null,
            semester: 2,
            completed: false,
            quizScore: 72,
            updatedAt: new Date().toISOString(),
          },
        ]
      : [],
    continueLoading: false,
    badges: [],
  };
}
export function useExamCountdown() {
  return {
    today: "2026-10-09",
    exam: {
      id: "fixture-date",
      curriculum_track_id: "aden",
      grade_id: "grade12",
      semester: 2,
      exam_kind: "ministerial",
      title: "اختبارات الثانوية العامة",
      starts_on: "2027-02-28",
      ends_on: null,
      is_published: true,
    },
  };
}
export function useSemesterSubjects() {
  return {
    data: {
      subjects: [
        { id: "chemistry", name: "الكيمياء" },
        { id: "math", name: "الرياضيات" },
        { id: "physics", name: "الفيزياء" },
      ],
    },
    isPending: false,
    isError: false,
  };
}
export function useExamHistory() {
  return {
    isPending: false,
    isError: false,
    refetch: async () => {},
    data: [85, 60, 42].map((percentage, i) => ({
      id: `session-${i}`,
      mode: "training",
      exam_templates: { title: ["اختبار الكيمياء", "اختبار الرياضيات", "اختبار الفيزياء"][i] },
      submitted_at: new Date(Date.now() - (i + 1) * 86400000).toISOString(),
      started_at: new Date().toISOString(),
      total_questions: 20,
      correct_answers: percentage / 5,
      score: percentage,
      total_points: 100,
      result_json: { percentage },
    })),
  };
}
export const supabase = {
  from: () => {
    const result = { data: { id: "grade12", slug: "grade-12" }, error: null };
    const builder: Record<string, unknown> = new Proxy(
      {},
      {
        get: (_, key) =>
          key === "then"
            ? (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve)
            : () => builder,
      },
    );
    return builder;
  },
};
