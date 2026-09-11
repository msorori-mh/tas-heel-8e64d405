// TEST_ONLY deterministic data. This fixture never contacts Supabase or authenticates.
import { schoolSearchKey, type School } from "../../../src/lib/schools/school-choice";
import type { ManagedSchool, SchoolReview } from "../../../src/lib/schools/directory-api";
export const schoolRows: ManagedSchool[] = [
  {
    id: "s1",
    name: "مدرسة النور الأساسية والثانوية ١",
    governorate_id: "g1",
    governorate_name: "صنعاء",
    district: "معين",
    locality: "السنينة",
    student_count: 12,
    teacher_count: 2,
  },
  {
    id: "s2",
    name: "مدرسة النور الأساسية والثانوية ١",
    governorate_id: "g1",
    governorate_name: "صنعاء",
    district: "الوحدة",
    locality: "حدة",
    student_count: 8,
    teacher_count: 1,
  },
];
let pending: SchoolReview[] = [
  {
    kind: "student",
    user_id: "TEST_ONLY_student",
    full_name: "طالب تجريبي",
    school_id: null,
    school_name: "النور",
    governorate_id: "g1",
    governorate_name: "صنعاء",
    school_district: "معين",
    school_locality: "السنينة",
  },
];
const clone = <T>(data: T): T => JSON.parse(JSON.stringify(data));
export const supabase = {
  from: () => ({
    select: () => ({
      order: async () => ({
        error: null,
        data: [
          { id: "g1", name: "صنعاء" },
          { id: "g2", name: "عدن" },
        ],
      }),
    }),
  }),
};
export const schoolDirectoryApi = {
  search: async (gov: string, query: string, district: string): Promise<School[]> =>
    clone(
      schoolRows.filter(
        (s) =>
          s.governorate_id === gov &&
          schoolSearchKey(s.name).includes(schoolSearchKey(query)) &&
          schoolSearchKey(s.district).includes(schoolSearchKey(district)),
      ),
    ),
  list: async () => clone({ rows: schoolRows, count: schoolRows.length }),
  pending: async () => clone({ rows: pending, count: pending.length }),
  details: async (id: string) => clone(schoolRows.find((s) => s.id === id)!),
  review: async (row: SchoolReview, school: School | Omit<School, "id">) => {
    pending = pending.filter((r) => r.user_id !== row.user_id);
    const existing = "id" in school ? schoolRows.find((s) => s.id === school.id) : undefined;
    if (existing) existing.student_count++;
    return "id" in school ? school.id : "new-test-school";
  },
  merge: async (source: ManagedSchool, target: ManagedSchool) => {
    const keep = schoolRows.find((s) => s.id === target.id)!;
    keep.student_count += source.student_count;
    keep.teacher_count += source.teacher_count;
    schoolRows.splice(
      schoolRows.findIndex((s) => s.id === source.id),
      1,
    );
    return { students: source.student_count, teachers: source.teacher_count };
  },
};
