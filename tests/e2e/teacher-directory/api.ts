import type { TeacherRow, TeacherFilters, TeacherSummary } from "../../../src/lib/admin-teachers";
export { emptyTeacherFilters, teacherCsv } from "../../../src/lib/admin-teachers";
const teachers: TeacherRow[] = Array.from({ length: 23 }, (_, i) => ({
  user_id: `test-${i}`,
  full_name: i < 2 ? "معلم تجريبي" : `معلم ${i + 1}`,
  email: `teacher${i}@example.test`,
  phone: "777123456",
  status: i === 1 ? "SUSPENDED" : "ACTIVE",
  subject_id: "math",
  subject_name: "الرياضيات",
  governorate_id: "sanaa",
  governorate_name: "أمانة العاصمة",
  school_id: null,
  school_name: "مدرسة الاختبار",
  school_district: "التحرير",
  school_locality: "",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  last_sign_in_at: null,
  enrollment_count: i === 0 ? 1 : 0,
  active_programs: 0,
  completed_programs: i === 0 ? 1 : 0,
  cancelled_programs: 0,
  completed_lessons: i === 0 ? 2 : 0,
  attempt_count: i === 0 ? 2 : 0,
  passed_attempts: i === 0 ? 1 : 0,
  best_score_percent: i === 0 ? 100 : null,
  valid_certificates: i === 0 ? 1 : 0,
  revoked_certificates: 0,
  last_learning_at: i === 0 ? "2026-09-29T00:00:00Z" : null,
}));
let failed = false;
export const adminTeachersApi = {
  async list(filters: TeacherFilters, page: number) {
    if (filters.query === "خطأ" && !failed) {
      failed = true;
      throw new Error("TEST_ONLY transient failure");
    }
    const rows = teachers.filter(
      (t) =>
        (!filters.query ||
          filters.query === "خطأ" ||
          `${t.full_name} ${t.email}`.includes(filters.query)) &&
        (!filters.status || t.status === filters.status) &&
        (!filters.activity ||
          (filters.activity === "CERTIFIED" && t.valid_certificates > 0) ||
          (filters.activity === "UNENROLLED" && t.enrollment_count === 0)),
    );
    const sum = (key: keyof TeacherRow) => rows.reduce((n, t) => n + Number(t[key]), 0);
    const summary: TeacherSummary = {
      teachers: rows.length,
      active: rows.filter((t) => t.status === "ACTIVE").length,
      suspended: rows.filter((t) => t.status === "SUSPENDED").length,
      unenrolled: rows.filter((t) => !t.enrollment_count).length,
      enrollments: sum("enrollment_count"),
      active_programs: sum("active_programs"),
      completed_programs: sum("completed_programs"),
      cancelled_programs: 0,
      completed_lessons: sum("completed_lessons"),
      attempts: sum("attempt_count"),
      passed_attempts: sum("passed_attempts"),
      valid_certificates: sum("valid_certificates"),
      revoked_certificates: 0,
    };
    return {
      rows: rows.slice(page * 20, page * 20 + 20),
      total: rows.length,
      summary,
      subjects: [{ id: "math", name: "الرياضيات", count: 23 }],
      governorates: [{ id: "sanaa", name: "أمانة العاصمة", count: 23 }],
    };
  },
  async detail(userId: string) {
    const teacher = teachers.find((t) => t.user_id === userId)!;
    return {
      teacher,
      programs:
        userId === "test-0"
          ? [
              {
                enrollment_id: "e1",
                program_version_id: "v1",
                title: "التدريس الفعّال",
                version_number: 1,
                status: "COMPLETED",
                enrolled_at: "2026-09-01T00:00:00Z",
                completed_at: "2026-09-29T00:00:00Z",
                total_lessons: 2,
                completed_lessons: 2,
                attempts: [
                  {
                    attempt_id: "a2",
                    attempt_number: 2,
                    score: 4,
                    total: 4,
                    passed: true,
                    completed_at: "2026-09-29T00:00:00Z",
                  },
                  {
                    attempt_id: "a1",
                    attempt_number: 1,
                    score: 2,
                    total: 4,
                    passed: false,
                    completed_at: "2026-09-28T00:00:00Z",
                  },
                ],
                certificate: {
                  code: "TAM-1234567890ABCDEF1234",
                  issued_at: "2026-09-29T00:00:00Z",
                  revoked_at: null,
                  revocation_reason: null,
                },
              },
            ]
          : [],
    };
  },
};
