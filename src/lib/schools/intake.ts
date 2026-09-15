export type SchoolIntakeRow = {
  source_row?: number;
  governorate_id?: string;
  governorate?: string;
  district: string;
  name: string;
  locality: string;
};
export type SchoolIntakeResult = {
  source_row: number;
  status: "new" | "added" | "exists" | "duplicate_file" | "invalid";
  school_id: string | null;
  errors: Partial<Record<"governorate" | "district" | "name" | "locality" | "row", string>>;
};
export type SchoolIntakeResponse = { rows: SchoolIntakeResult[]; committed: boolean };
export const intakeStatusLabels = {
  new: "جديدة",
  added: "أُضيفت",
  exists: "موجودة مسبقًا",
  duplicate_file: "مكررة داخل الملف",
  invalid: "تحتاج تصحيحًا",
};
