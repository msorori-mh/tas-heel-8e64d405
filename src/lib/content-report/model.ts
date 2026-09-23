import {
  buildV3CapabilityView,
  V3_CAPABILITIES,
  V3_LABEL_AR,
  type ApplicabilityMap,
  type V3CapabilityKey,
} from "@/lib/lessons/content-v3";
import type { LessonCapabilityContract } from "@/lib/lessons/lesson-content-contract";
export const labels = {
  missing: "لم يُرفع",
  draft: "مسودة",
  review: "قيد المراجعة",
  invalid: "يحتاج تصحيحًا",
  ready: "جاهز — غير ظاهر للطالب",
  published: "منشور",
  na: "غير مطلوب",
} as const;
export type ReportStatus = keyof typeof labels;
export function reportCells(
  contract: LessonCapabilityContract,
  applicability: ApplicabilityMap,
  lifecycle: Record<string, string>,
  visible: boolean,
  entered: Record<string, number> = {},
) {
  return buildV3CapabilityView(contract, applicability).map((c) => {
    const uploaded = (entered[c.key] ?? c.state.count) > 0 || c.state.present;
    const status: ReportStatus =
      c.applicability === "NA"
        ? "na"
        : c.state.status === "INVALID"
          ? "invalid"
          : !c.state.present
            ? uploaded
              ? "invalid"
              : "missing"
            : lifecycle[c.legacyKey] === "REVIEW"
              ? "review"
              : c.state.status === "DRAFT"
                ? "draft"
                : c.ready
                  ? visible
                    ? "published"
                    : "ready"
                  : "draft";
    return {
      key: c.key,
      label: c.label,
      status,
      required: c.applicability === "REQUIRED",
      count: c.state.count,
      uploaded,
      updatedAt: c.state.updatedAt,
    };
  });
}
export type ReportCell = ReturnType<typeof reportCells>[number];
export type ReportRow = {
  id: string;
  title: string;
  semester: number | null;
  cells: ReportCell[];
  updatedAt: string;
};
export function reportSummary(rows: ReportRow[]) {
  const required = rows.flatMap((r) => r.cells.filter((c) => c.required));
  const uploaded = required.filter((c) => c.uploaded).length;
  const ready = required.filter((c) => c.status === "ready" || c.status === "published").length;
  const published = required.filter((c) => c.status === "published").length;
  return {
    lessons: rows.length,
    complete: rows.filter(
      (r) =>
        r.cells.some((c) => c.required) &&
        r.cells.filter((c) => c.required).every((c) => c.status === "published"),
    ).length,
    required: required.length,
    uploaded,
    ready,
    published,
    review: required.filter((c) => c.status === "review").length,
    draft: required.filter((c) => c.status === "draft").length,
    invalid: required.filter((c) => c.status === "invalid").length,
    missing: required.filter((c) => c.status === "missing").length,
    percent: (n: number) => (required.length ? Math.round((n / required.length) * 100) : null),
  };
}

export type ComponentReportSummary = {
  key: V3CapabilityKey;
  label: string;
  totalLessons: number;
  applicable: number;
  required: number;
  optional: number;
  notApplicable: number;
  uploaded: number;
  remainingUpload: number;
  draft: number;
  review: number;
  invalid: number;
  ready: number;
  published: number;
  remainingPublish: number;
  uploadPercent: number | null;
  publishPercent: number | null;
};

/**
 * Per-component operational view for the seven canonical lesson components.
 *
 * "Remaining upload" means an applicable component (REQUIRED or OPTIONAL) with no
 * entered content. NA rows are excluded from both upload and publication denominators.
 * This deliberately keeps OPTIONAL separate from REQUIRED so an optional lab gap is
 * visible without being misrepresented as a mandatory curriculum gap.
 */
export function componentReportSummary(rows: ReportRow[]): ComponentReportSummary[] {
  return V3_CAPABILITIES.map((key) => {
    const cells = rows
      .map((row) => row.cells.find((cell) => cell.key === key))
      .filter((cell): cell is ReportCell => Boolean(cell));
    const applicableCells = cells.filter((cell) => cell.status !== "na");
    const uploaded = applicableCells.filter((cell) => cell.uploaded).length;
    const published = applicableCells.filter((cell) => cell.status === "published").length;
    const required = applicableCells.filter((cell) => cell.required).length;
    const optional = applicableCells.length - required;

    return {
      key,
      label: V3_LABEL_AR[key],
      totalLessons: rows.length,
      applicable: applicableCells.length,
      required,
      optional,
      notApplicable: cells.filter((cell) => cell.status === "na").length,
      uploaded,
      remainingUpload: applicableCells.filter((cell) => !cell.uploaded).length,
      draft: applicableCells.filter((cell) => cell.status === "draft").length,
      review: applicableCells.filter((cell) => cell.status === "review").length,
      invalid: applicableCells.filter((cell) => cell.status === "invalid").length,
      ready: applicableCells.filter(
        (cell) => cell.status === "ready" || cell.status === "published",
      ).length,
      published,
      remainingPublish: applicableCells.filter((cell) => cell.status !== "published").length,
      uploadPercent: applicableCells.length
        ? Math.round((uploaded / applicableCells.length) * 100)
        : null,
      publishPercent: applicableCells.length
        ? Math.round((published / applicableCells.length) * 100)
        : null,
    };
  });
}
