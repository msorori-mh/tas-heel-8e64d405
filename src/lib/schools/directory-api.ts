import type { School, SearchSchools } from "./school-choice";

type RpcClient = {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
};

export type SchoolReview = {
  kind: "student" | "teacher";
  user_id: string;
  full_name: string | null;
  governorate_name: string | null;
  school_name: string;
  school_id: null;
  governorate_id: string | null;
  school_district: string | null;
  school_locality: string | null;
};
export type ManagedSchool = School & {
  student_count: number;
  teacher_count: number;
  governorate_name: string;
};
export type SchoolPage<T> = { rows: T[]; count: number };

export const schoolReviewSnapshot = (row: SchoolReview) => ({
  school_id: row.school_id,
  school_name: row.school_name,
  governorate_id: row.governorate_id,
  school_district: row.school_district,
  school_locality: row.school_locality,
});

/** The boundary is shared by the separately authenticated student and academy clients. */
export function createSchoolDirectoryApi(client: unknown) {
  const rpcClient = client as RpcClient;
  async function call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await rpcClient.rpc(name, args);
    if (error) {
      if (error.message.includes("SCHOOL_REVIEW_STALE"))
        throw new Error("تغيّرت البيانات منذ فتح المراجعة. حدّث القائمة وأعد المراجعة.");
      if (error.message.includes("SCHOOL_LOCATION_MISMATCH"))
        throw new Error("يجب أن تكون المدرسة في المحافظة المختارة.");
      if (error.message.includes("SCHOOL_DETAILS_REQUIRED"))
        throw new Error("أكمل اسم المدرسة والمحافظة والمديرية والحي أو القرية.");
      throw new Error("تعذّر إتمام العملية. حدّث القائمة وحاول مرة أخرى.");
    }
    return data as T;
  }
  const search: SearchSchools = (governorateId, query, district) =>
    call<School[]>("search_school_directory", {
      p_governorate_id: governorateId,
      p_query: query.trim().slice(0, 180),
      p_district: district.trim().slice(0, 120),
    });
  return {
    search,
    details: (id: string) => call<ManagedSchool>("admin_school_details", { p_id: id }),
    students: (args: Record<string, unknown>) =>
      call<unknown>("admin_list_students_by_school", args),
    studentOptions: () => call<unknown>("admin_student_school_filter_options", {}),
    list: (query: string, governorateId: string, page: number) =>
      call<SchoolPage<ManagedSchool>>("admin_school_directory", {
        p_query: query,
        p_governorate_id: governorateId || null,
        p_page: page,
      }),
    pending: (query: string, governorateId: string, page: number) =>
      call<SchoolPage<SchoolReview>>("admin_school_review_queue", {
        p_query: query,
        p_governorate_id: governorateId || null,
        p_page: page,
      }),
    review: (row: SchoolReview, school: School | Omit<School, "id">) =>
      call<string>("admin_review_school_profile", {
        p_kind: row.kind,
        p_user_id: row.user_id,
        p_expected: schoolReviewSnapshot(row),
        p_school: school,
      }),
    merge: (source: ManagedSchool, target: ManagedSchool) =>
      call<{ students: number; teachers: number }>("admin_merge_schools", {
        p_source_id: source.id,
        p_target_id: target.id,
        p_expected_source: source,
        p_expected_target: target,
      }),
  };
}
