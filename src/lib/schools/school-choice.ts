export type School = {
  id: string;
  name: string;
  governorate_id: string;
  district: string;
  locality: string;
};

export type SchoolProfileFields = {
  school_id?: string | null;
  school_name?: string | null;
  school_district?: string | null;
  school_locality?: string | null;
  governorate_id?: string | null;
};

export type SchoolChoice = {
  mode: "search" | "selected" | "proposal";
  school_id: string | null;
  school_name: string;
  school_district: string;
  school_locality: string;
};

export function schoolChoiceFromProfile(profile?: SchoolProfileFields | null): SchoolChoice {
  return {
    mode: profile?.school_id ? "selected" : profile?.school_name ? "proposal" : "search",
    school_id: profile?.school_id ?? null,
    school_name: profile?.school_name ?? "",
    school_district: profile?.school_district ?? "",
    school_locality: profile?.school_locality ?? "",
  };
}

export function selectSchool(school: School): SchoolChoice {
  return {
    mode: "selected",
    school_id: school.id,
    school_name: school.name,
    school_district: school.district,
    school_locality: school.locality,
  };
}

/** Search equivalence is deliberately broader than school identity. Never remove numbers. */
export function schoolSearchKey(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/\u0640|[\u064b-\u065f]|\u0670|[\u06d6-\u06ed]/gu, "")
    .replace(/أ|إ|آ/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/[٠-٩۰-۹]/g, (digit) => String(digit.charCodeAt(0) - (digit <= "٩" ? 0x660 : 0x6f0)))
    .replace(/\s+/g, " ")
    .trim();
}

const clean = (value: string) => value.normalize("NFC").replace(/\s+/g, " ").trim();

export function schoolProfilePatch(
  choice: SchoolChoice,
  governorateId: string,
  existing?: SchoolProfileFields | null,
) {
  if (!governorateId) throw new Error("اختر المحافظة أولًا.");
  if (choice.mode === "search") throw new Error("اختر مدرستك من النتائج أو اضغط «لم أجد مدرستي».");
  if (choice.mode === "selected" && !choice.school_id) throw new Error("اختر المدرسة مرة أخرى.");
  const patch = {
    school_id: choice.mode === "selected" ? choice.school_id : null,
    school_name: clean(choice.school_name),
    school_district: clean(choice.school_district) || null,
    school_locality: clean(choice.school_locality) || null,
  };
  if (patch.school_name.length < 2 || patch.school_name.length > 180) {
    throw new Error("أدخل اسم المدرسة من حرفين إلى ١٨٠ حرفًا.");
  }
  // Existing unreviewed profiles remain editable; no guessed geographic backfill.
  const unchanged =
    existing &&
    existing.governorate_id === governorateId &&
    (existing.school_id ?? null) === patch.school_id &&
    clean(existing.school_name ?? "") === patch.school_name &&
    (clean(existing.school_district ?? "") || null) === patch.school_district &&
    (clean(existing.school_locality ?? "") || null) === patch.school_locality;
  if (choice.mode === "proposal" && !unchanged) {
    if (
      !patch.school_district ||
      patch.school_district.length < 2 ||
      patch.school_district.length > 120
    ) {
      throw new Error("أدخل المديرية لتحديد موقع المدرسة.");
    }
    if (
      !patch.school_locality ||
      patch.school_locality.length < 2 ||
      patch.school_locality.length > 120
    ) {
      throw new Error("أدخل الحي أو القرية لتمييز المدارس المتشابهة.");
    }
  }
  return patch;
}

export type SearchSchools = (
  governorateId: string,
  query: string,
  district: string,
) => Promise<School[]>;
