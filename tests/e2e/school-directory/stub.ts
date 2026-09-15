import type { SchoolIntakeRow, SchoolIntakeResponse } from "../../../src/lib/schools/intake";
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
  intake: async (rows: SchoolIntakeRow[], commit: boolean): Promise<SchoolIntakeResponse> => {
    const seen = new Set<string>();
    return {
      committed: commit,
      rows: rows.map((r, i) => {
        const key = JSON.stringify([
          r.governorate_id || r.governorate,
          r.district,
          r.name,
          r.locality,
        ]);
        const errors: Record<string, string> = {};
        if (!r.district || r.district.length < 2)
          errors.district = "أدخل اسم المديرية من حرفين إلى ١٢٠ حرفًا.";
        if (!r.governorate_id && r.governorate !== "صنعاء" && r.governorate !== "عدن")
          errors.governorate = "اختر محافظة صحيحة";
        if (Object.keys(errors).length)
          return {
            source_row: r.source_row ?? i + 1,
            school_id: null,
            status: "invalid" as const,
            errors,
          };
        if (seen.has(key))
          return {
            source_row: r.source_row ?? i + 1,
            school_id: null,
            status: "duplicate_file" as const,
            errors,
          };
        seen.add(key);
        const existing = schoolRows.find(
          (s) => s.name === r.name && s.district === r.district && s.locality === r.locality,
        );
        if (commit && !existing)
          schoolRows.push({
            ...r,
            governorate_id: r.governorate_id || "g1",
            governorate_name: r.governorate || "صنعاء",
            id: `import-${schoolRows.length}`,
            student_count: 0,
            teacher_count: 0,
          });
        return {
          source_row: r.source_row ?? i + 1,
          school_id: existing?.id ?? null,
          status: existing ? ("exists" as const) : commit ? ("added" as const) : ("new" as const),
          errors,
        };
      }),
    };
  },
  search: async (gov: string, query: string, district: string): Promise<School[]> =>
    clone(
      schoolRows.filter(
        (s) =>
          s.governorate_id === gov &&
          schoolSearchKey(s.name).includes(schoolSearchKey(query)) &&
          schoolSearchKey(s.district).includes(schoolSearchKey(district)),
      ),
    ),
  list: async (query: string, gov: string, page: number) => {
    const many = new URLSearchParams(window.location.search).has("large");
    const rows = many
      ? Array.from({ length: 3000 }, (_, i) => ({
          ...schoolRows[i % 2],
          id: `large-${i}`,
          name: `مدرسة ${String(i + 1).padStart(4, "0")}`,
        }))
      : schoolRows;
    const filtered = rows.filter(
      (s) =>
        (!gov || s.governorate_id === gov) &&
        schoolSearchKey(s.name).includes(schoolSearchKey(query)),
    );
    return clone({ rows: filtered.slice(page * 25, page * 25 + 25), count: filtered.length });
  },
  edit: async (school: ManagedSchool, form: SchoolIntakeRow) => {
    if (form.district.length < 2)
      return { errors: { district: "أدخل اسم المديرية من حرفين إلى ١٢٠ حرفًا." } };
    const found = schoolRows.find((s) => s.id === school.id)!;
    Object.assign(found, form);
    return clone({ school: found, errors: {} });
  },
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
