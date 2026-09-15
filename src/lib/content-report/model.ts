import { buildV3CapabilityView, type ApplicabilityMap } from "@/lib/lessons/content-v3";
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
    missing: required.filter((c) => c.status === "missing").length,
    percent: (n: number) => (required.length ? Math.round((n / required.length) * 100) : null),
  };
}
