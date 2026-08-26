/**
 * GROUP_AWARE_CONTEXT_TEMPLATE_13D — pure planner for template 01 (المواد).
 *
 * Two operator modes:
 *   single — independent subject rows (unchanged 13B/13C behaviour).
 *   group  — one subject GROUP (e.g. التربية الإسلامية) whose branches
 *            (الإيمان / الفقه / الحديث / السيرة النبوية) are INDEPENDENT
 *            subjects sharing one group_code + group_name.
 *
 * Invariants:
 *  - TCS-2 only. The operator never types a code.
 *  - One group_code for every branch of the same group.
 *  - One unique subject_code per branch.
 *  - track_codes come from the selected tracks (availability only, never in a code).
 *  - Row count in group mode == number of branches.
 *
 * Pure functions — no DB access, no writes. Client, server and test safe.
 */

import { Tcs2Error, allocateTcs2Codes, buildGroupCode, nextAllocatedNumber } from "./tcs2";
import { TCS1_TRACKS } from "./tcs1-master-data";

export type SubjectTemplateMode = "single" | "group";

export interface SubjectTemplatePlanInput {
  mode: SubjectTemplateMode;
  gradeSlug: string;
  trackCodes: readonly string[];
  /** single mode only */
  rowCount?: number;
  /** group mode only */
  groupName?: string;
  branchNames?: readonly string[];
  existingSubjectCodes: readonly string[];
  existingGroupCodes: readonly string[];
}

export interface SubjectTemplatePlan {
  rows: Array<Record<string, string>>;
  allocatedCodes: string[];
  prefilledColumns: string[];
  notes: string[];
  groupCode: string | null;
}

export const MAX_GROUP_BRANCHES = 50;

function normalizeTracks(trackCodes: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of trackCodes) {
    const code = String(raw ?? "")
      .trim()
      .toLowerCase();
    if (!code) continue;
    if (!TCS1_TRACKS.some((t) => t.trackCode === code)) {
      throw new Tcs2Error(
        "TCS2_UNKNOWN_TRACK",
        `المسار «${code}» غير معروف. المسارات المعتمدة: ${TCS1_TRACKS.map((t) => t.trackCode).join(" | ")}.`,
      );
    }
    if (!out.includes(code)) out.push(code);
  }
  if (out.length === 0) {
    throw new Tcs2Error("TCS2_TRACKS_REQUIRED", "اختر مساراً واحداً على الأقل لتوفّر المادة.");
  }
  return out;
}

export function normalizeBranchNames(branchNames: readonly string[]): string[] {
  const cleaned = branchNames.map((n) => String(n ?? "").trim()).filter(Boolean);
  if (cleaned.length === 0) {
    throw new Tcs2Error("TCS2_BRANCHES_REQUIRED", "أدخل اسم فرع واحد على الأقل للمجموعة.");
  }
  if (cleaned.length > MAX_GROUP_BRANCHES) {
    throw new Tcs2Error(
      "TCS2_TOO_MANY_BRANCHES",
      `عدد الفروع يتجاوز الحد المسموح (${MAX_GROUP_BRANCHES}).`,
    );
  }
  const seen = new Set<string>();
  for (const name of cleaned) {
    if (seen.has(name)) {
      throw new Tcs2Error("TCS2_DUPLICATE_BRANCH", `اسم الفرع «${name}» مكرر داخل المجموعة.`);
    }
    seen.add(name);
  }
  return cleaned;
}

/** Next system-owned group code for this grade (TCS-2, never reused). */
export function allocateGroupCode(
  existingGroupCodes: readonly string[],
  gradeSlug: string,
): string {
  const scope = { gradeSlug };
  const next = nextAllocatedNumber(existingGroupCodes, "group", scope);
  return buildGroupCode(scope, next);
}

export function planSubjectTemplateRows(input: SubjectTemplatePlanInput): SubjectTemplatePlan {
  const tracks = normalizeTracks(input.trackCodes);
  const trackCell = tracks.join("|");
  const scope = { gradeSlug: input.gradeSlug };

  if (input.mode === "group") {
    const groupName = String(input.groupName ?? "").trim();
    if (!groupName) {
      throw new Tcs2Error(
        "TCS2_GROUP_NAME_REQUIRED",
        "أدخل اسم مجموعة المواد (مثال: التربية الإسلامية).",
      );
    }
    const branches = normalizeBranchNames(input.branchNames ?? []);
    const groupCode = allocateGroupCode(input.existingGroupCodes, input.gradeSlug);
    const codes = allocateTcs2Codes({
      existingCodes: input.existingSubjectCodes,
      kind: "subject",
      scope,
      count: branches.length,
    });

    return {
      rows: branches.map((name, i) => ({
        subject_code: codes[i]!,
        name,
        grade_slug: input.gradeSlug,
        track_codes: trackCell,
        group_code: groupCode,
        group_name: groupName,
      })),
      allocatedCodes: [groupCode, ...codes],
      prefilledColumns: [
        "subject_code",
        "name",
        "grade_slug",
        "track_codes",
        "group_code",
        "group_name",
      ],
      notes: [
        `مجموعة مواد: «${groupName}» — كود المجموعة ${groupCode} مشترك بين كل الفروع.`,
        "كل فرع مادة مستقلة لها subject_code خاص بها (Group → Subjects مستقلة).",
        `عدد الصفوف = عدد الفروع (${branches.length}) — لا تضف صفوفاً يدوياً.`,
        "لا تعدّل subject_code أو group_code — النظام هو المالك.",
        `المسارات: ${trackCell} — التوفّر فقط، ولا يدخل المسار في أي كود.`,
      ],
      groupCode,
    };
  }

  const rowCount = input.rowCount ?? 20;
  if (!Number.isInteger(rowCount) || rowCount < 1) {
    throw new Tcs2Error("TCS2_INVALID_COUNT", "عدد الصفوف غير صالح.");
  }
  const codes = allocateTcs2Codes({
    existingCodes: input.existingSubjectCodes,
    kind: "subject",
    scope,
    count: rowCount,
  });

  return {
    rows: codes.map((code) => ({
      subject_code: code,
      grade_slug: input.gradeSlug,
      track_codes: trackCell,
    })),
    allocatedCodes: codes,
    prefilledColumns: ["subject_code", "grade_slug", "track_codes"],
    notes: [
      "مادة مستقلة: املأ فقط عمود name.",
      "لا تعدّل subject_code — النظام هو المالك.",
      "المادة المشتركة تُدخل مرة واحدة: كل المسارات في track_codes مفصولة بـ | (مثال: sanaa|aden).",
      "إذا كانت المادة فروعاً (مثل التربية الإسلامية) استخدم وضع «مجموعة مواد / فروع».",
    ],
    groupCode: null,
  };
}
