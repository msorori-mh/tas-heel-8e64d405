import { LEGACY_FLAT_15COL, LEGACY_FLAT_HEADERS } from "./legacy-flat-15col.ts";
import { TEACHER_FLAT_AR_V0 } from "./teacher-flat-ar-v0.ts";
import { OFFICIAL_FLAT_V0 } from "./official-flat-v0.ts";
import { OFFICIAL_NORMALIZED_V1 } from "../official-normalized-v1.ts";

export type ImportSchemaId =
  | typeof LEGACY_FLAT_15COL
  | typeof TEACHER_FLAT_AR_V0
  | typeof OFFICIAL_FLAT_V0
  | typeof OFFICIAL_NORMALIZED_V1
  | "unknown";

function normHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

export function detectSchemaFromHeaders(headers: string[]): {
  schema: ImportSchemaId;
  column_shift_suspected: boolean;
} {
  const h = headers.map(normHeader);
  const has = (name: string) => h.includes(normHeader(name));

  if (has("schema_version") && has("question_code") && has("option_code")) {
    return { schema: OFFICIAL_NORMALIZED_V1, column_shift_suspected: false };
  }

  if (has("option_1") && has("correct_index") && has("question_code")) {
    const expected = LEGACY_FLAT_HEADERS.map(normHeader);
    const overlap = expected.filter((e) => h.includes(e)).length;
    const column_shift_suspected = overlap < 5 || h.indexOf("question_text") > 3;
    return { schema: LEGACY_FLAT_15COL, column_shift_suspected };
  }

  if (
    (has("correct_answer") || has("الإجابة_الصحيحة")) &&
    (has("option_a") || has("الخيار_أ") || has("option_a"))
  ) {
    if (has("context_text") || has("id")) {
      return { schema: OFFICIAL_FLAT_V0, column_shift_suspected: false };
    }
    return { schema: TEACHER_FLAT_AR_V0, column_shift_suspected: false };
  }

  if (has("نص_السؤال") || has("الخيار_أ")) {
    return { schema: TEACHER_FLAT_AR_V0, column_shift_suspected: false };
  }

  return { schema: "unknown", column_shift_suspected: false };
}
