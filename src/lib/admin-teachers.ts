import { supabase } from "@/integrations/supabase/client";

export type TeacherRow = {
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string;
  status: "ACTIVE" | "SUSPENDED";
  subject_id: string;
  subject_name: string;
  governorate_id: string;
  governorate_name: string;
  school_id: string | null;
  school_name: string;
  school_district: string | null;
  school_locality: string | null;
  created_at: string;
  updated_at: string;
  last_sign_in_at: string | null;
  enrollment_count: number;
  active_programs: number;
  completed_programs: number;
  cancelled_programs: number;
  completed_lessons: number;
  attempt_count: number;
  passed_attempts: number;
  best_score_percent: number | null;
  valid_certificates: number;
  revoked_certificates: number;
  last_learning_at: string | null;
};
export type TeacherSummary = {
  teachers: number;
  active: number;
  suspended: number;
  unenrolled: number;
  enrollments: number;
  active_programs: number;
  completed_programs: number;
  cancelled_programs: number;
  completed_lessons: number;
  attempts: number;
  passed_attempts: number;
  valid_certificates: number;
  revoked_certificates: number;
};
export type TeacherFilters = {
  query: string;
  status: string;
  subjectId: string;
  governorateId: string;
  activity: string;
};
export const emptyTeacherFilters: TeacherFilters = {
  query: "",
  status: "",
  subjectId: "",
  governorateId: "",
  activity: "",
};
export type TeacherDirectoryResult = {
  rows: TeacherRow[];
  total: number;
  summary: TeacherSummary;
  subjects: { id: string; name: string; count: number }[];
  governorates: { id: string; name: string; count: number }[];
};
export type TeacherProgram = {
  enrollment_id: string;
  program_version_id: string;
  title: string;
  version_number: number;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
  enrolled_at: string;
  completed_at: string | null;
  total_lessons: number;
  completed_lessons: number;
  attempts: {
    attempt_id: string;
    attempt_number: number;
    score: number;
    total: number;
    passed: boolean;
    completed_at: string;
  }[];
  certificate: {
    code: string;
    issued_at: string;
    revoked_at: string | null;
    revocation_reason: string | null;
  } | null;
};
export type TeacherDetail = { teacher: TeacherRow; programs: TeacherProgram[] };
type RpcClient = {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};
const rpc = supabase as unknown as RpcClient;
export const adminTeachersApi = {
  async list(filters: TeacherFilters, page: number): Promise<TeacherDirectoryResult> {
    const { data, error } = await rpc.rpc("admin_teacher_directory", {
      p_query: filters.query.trim(),
      p_status: filters.status,
      p_subject_id: filters.subjectId || null,
      p_governorate_id: filters.governorateId || null,
      p_activity: filters.activity,
      p_page: page,
      p_page_size: 20,
    });
    if (error) throw error;
    return data as TeacherDirectoryResult;
  },
  async detail(userId: string): Promise<TeacherDetail> {
    const { data, error } = await rpc.rpc("admin_teacher_detail", { p_user_id: userId });
    if (error) throw error;
    return data as TeacherDetail;
  },
};

export function teacherCsv(rows: TeacherRow[]): string {
  const headers = [
    "الاسم",
    "البريد",
    "الهاتف",
    "الحالة",
    "المادة",
    "المحافظة",
    "المدرسة",
    "المديرية",
    "المنطقة",
    "تاريخ الانضمام",
    "البرامج المسجل بها",
    "برامج قيد التعلم",
    "برامج مكتملة",
    "دروس مكتملة",
    "محاولات التقييم",
    "محاولات ناجحة",
    "أعلى نسبة",
    "شهادات سارية",
    "شهادات ملغاة",
    "آخر نشاط تعلم",
  ];
  const cells: (string | number | null)[][] = [
    headers,
    ...rows.map((t) => [
      t.full_name,
      t.email,
      t.phone,
      t.status === "ACTIVE" ? "نشط" : "موقوف",
      t.subject_name,
      t.governorate_name,
      t.school_name,
      t.school_district,
      t.school_locality,
      t.created_at,
      t.enrollment_count,
      t.active_programs,
      t.completed_programs,
      t.completed_lessons,
      t.attempt_count,
      t.passed_attempts,
      t.best_score_percent,
      t.valid_certificates,
      t.revoked_certificates,
      t.last_learning_at,
    ]),
  ];
  return (
    "\ufeff" +
    cells
      .map((row) =>
        row
          .map((value) => {
            const raw = String(value ?? "");
            const safe = /^[\s\uFEFF]*[=+@-]/.test(raw) || /^[\t\r\n]/.test(raw) ? "'" + raw : raw;
            return `"${safe.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n")
  );
}
