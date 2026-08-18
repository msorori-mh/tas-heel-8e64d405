/**
 * TAMKEEN_LESSON_CONTENT_WORKSPACE_AND_CAPABILITY_CONTRACT_20B
 *
 * One operating surface for every content layer of a lesson. Pure presentation:
 * every present/status decision comes from `buildLessonCapabilityContract`.
 */
import { Link } from "@tanstack/react-router";
import { Eye, Loader2, Pencil } from "lucide-react";
import {
  STUDENT_CAPABILITY_ORDER,
  LEGACY_REFERENCE_CAPABILITIES,
  computeLessonReadinessLevels,
  LIFECYCLE_CAPABILITIES,
  type LessonCapabilityContract,
  type LessonContentCapabilityKey,
  type LessonCapabilityState,
} from "@/lib/lessons/lesson-content-contract";
import {
  allowedTransitions,
  STATUS_LABEL_AR,
  TRANSITION_LABEL_AR,
  type LessonCapabilityLifecycleStatus,
} from "@/lib/lessons/lesson-lifecycle";


const STATUS_AR: Record<LessonCapabilityState["status"], string> = {
  READY: "جاهز",
  DRAFT: "مسودة",
  INVALID: "بيانات غير صالحة",
  ABSENT: "غير مُدخل",
};

const STATUS_CLASS: Record<LessonCapabilityState["status"], string> = {
  READY: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  DRAFT: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  INVALID: "bg-destructive/10 text-destructive border-destructive/30",
  ABSENT: "bg-muted text-muted-foreground border-border",
};

/**
 * 20D §13 — capabilities every lesson must have. Anything else that is absent
 * is "غير مطلوب لهذا الدرس" (N/A), never a gap the operator must chase.
 */
const REQUIRED_CAPABILITIES: readonly LessonContentCapabilityKey[] = [
  "officialBookContent",
  "tamkeenExplanation",
  "quickReview",
  "checkUnderstanding",
];

/** Matrix cell label: READY / DRAFT / REVIEW / MISSING / N/A. */
function matrixLabel(
  cap: LessonCapabilityState,
  stage: LessonCapabilityLifecycleStatus | null,
): string {
  if (cap.status === "ABSENT") {
    return REQUIRED_CAPABILITIES.includes(cap.key)
      ? "ناقص (MISSING)"
      : "غير مطلوب لهذا الدرس (N/A)";
  }
  if (cap.status === "DRAFT" && stage === "REVIEW") return "قيد المراجعة";
  return STATUS_AR[cap.status];
}

const REASON_AR: Record<string, string> = {
  NOT_ENTERED: "لم يُدخل بعد",
  DRAFT_NOT_PUBLISHED: "مسودة لم تُنشر",
  INVALID_DATA: "بيانات غير صالحة",
  ACCESS_GATED: "محجوب بقيود الوصول",
};

function fmtDate(value: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("ar", { dateStyle: "medium" });
}

export interface LessonWorkspaceHeader {
  subjectName: string;
  gradeName: string;
  trackNames: string;
  lessonTitle: string;
  lessonCode: string;
}

export function LessonContentWorkspace({
  header,
  contract,
  onEdit,
  lessonId,
  lifecycle = {},
  onTransition,
  pendingCapability = null,
}: {
  header: LessonWorkspaceHeader;
  contract: LessonCapabilityContract;
  /** Opens the existing editor dialog for a capability, when one exists. */
  onEdit: Partial<Record<LessonContentCapabilityKey, () => void>>;
  lessonId: string;
  /** 20C-B — current lifecycle status per capability (staff view). */
  lifecycle?: Partial<Record<LessonContentCapabilityKey, LessonCapabilityLifecycleStatus>>;
  onTransition?: (
    capability: LessonContentCapabilityKey,
    to: LessonCapabilityLifecycleStatus,
  ) => void;
  pendingCapability?: LessonContentCapabilityKey | null;
}) {
  const readiness = computeLessonReadinessLevels(contract);

  return (
    <section className="rounded-2xl border border-border bg-card p-4" dir="rtl">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <h2 className="text-lg font-bold text-foreground">مساحة عمل محتوى الدرس</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {header.subjectName} • {header.gradeName} • {header.trackNames}
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {header.lessonTitle}{" "}
            <span className="font-mono text-[11px] text-muted-foreground">
              ({header.lessonCode})
            </span>
          </p>
        </div>
        <Link
          to="/lessons/$lessonId"
          params={{ lessonId }}
          search={{ preview: 1 }}
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/15"
        >
          <Eye className="h-3.5 w-3.5" />
          معاينة كطالب (تشمل المسودات)
        </Link>
      </header>


      {/* 21G — readiness dashboard with an explicit "what is missing" answer. */}
      <div className="mt-3 grid grid-cols-2 gap-2 text-center text-[11px] sm:grid-cols-4">
        {[
          ["جاهزية الكتاب", readiness.bookReady, [] as V3CapabilityKey[]],
          ["جاهزية التعلم", readiness.learningReady, readiness.missingForLearning],
          ["جاهزية التقييم", readiness.assessmentReady, readiness.missingForAssessment],
          ["جاهزية كاملة", readiness.fullyReady, readiness.missing],
        ].map(([label, on, missing]) => (
          <div
            key={label as string}
            className={`rounded-lg border px-2 py-2 ${
              on ? STATUS_CLASS.READY : STATUS_CLASS.ABSENT
            }`}
          >
            <div className="font-medium">{label as string}</div>
            <div className="mt-0.5">{on ? "نعم" : "لا"}</div>
            {!on && (missing as V3CapabilityKey[]).length > 0 && (
              <div className="mt-1 text-[10px] leading-relaxed">
                ينقص: {explainMissing(missing as V3CapabilityKey[])}
              </div>
            )}
          </div>
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {v3View.map((v3, index) => {
          const key = v3.legacyKey;
          const cap = { ...contract[key], label: v3.label, icon: v3.icon };
          const edit = onEdit[key];

          const hasLifecycle = LIFECYCLE_CAPABILITIES.includes(key) && cap.present;
          const stage = lifecycle[key] ?? null;
          const nextStates = hasLifecycle ? allowedTransitions(stage) : [];
          const busy = pendingCapability === key;
          return (
            <li
              key={key}
              className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-3"
            >
              <span className="text-base">{cap.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">{index + 1}.</span>
                  <span className="text-sm font-medium text-foreground">{cap.label}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] ${STATUS_CLASS[cap.status]}`}
                  >
                    {matrixLabel(cap, stage)}
                  </span>
                  {hasLifecycle && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                      المسار التحريري: {stage ? STATUS_LABEL_AR[stage] : "غير مُدار"}
                    </span>
                  )}
                  {cap.count > 0 && (
                    <span className="text-[10px] text-muted-foreground">({cap.count})</span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                  <span>آخر تحديث: {fmtDate(cap.updatedAt)}</span>
                  <span className="font-mono">{cap.sourceRef}</span>
                  {cap.htmlRef && (
                    <span className="font-mono text-primary">HTML: {cap.htmlRef}</span>
                  )}
                </div>
                {cap.readinessReason && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    سبب عدم الجاهزية: {REASON_AR[cap.readinessReason]}
                  </p>
                )}
                {cap.note && (
                  <p className="mt-1 text-[11px] text-amber-600">{cap.note}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {edit ? (
                  <button
                    onClick={edit}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-muted"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    تحرير
                  </button>
                ) : (
                  <span className="text-[11px] text-muted-foreground">عبر الاستيراد</span>
                )}
                {hasLifecycle && onTransition
                  ? nextStates.map((to) => (
                      <button
                        key={to}
                        disabled={busy}
                        onClick={() => onTransition(key, to)}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50 ${
                          to === "READY"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15"
                            : "border-border bg-card text-foreground hover:bg-muted"
                        }`}
                      >
                        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {TRANSITION_LABEL_AR[to]}
                      </button>
                    ))
                  : null}
              </div>
            </li>
          );
        })}
      </ul>

      {/* 21B4E — legacy reference layer: not one of the final capabilities. */}
      <section className="mt-5 rounded-xl border border-dashed border-border bg-muted/40 p-3">
        <h3 className="text-xs font-bold text-foreground">مرجع قديم (Legacy)</h3>
        <p className="mt-1 text-[11px] text-muted-foreground">
          كتب المنهج الرسمية أصبحت على مستوى المادة (المادة × المسار × الفصل) ويصل إليها
          الطالب من "كتب المنهج" داخل المادة — لم تعد خطوة داخل الدرس. البيانات القديمة
          محفوظة ولم تُحذف.
        </p>
        <ul className="mt-2 space-y-1">
          {LEGACY_REFERENCE_CAPABILITIES.map((key) => {
            const cap = contract[key];
            return (
              <li
                key={key}
                className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground"
              >
                <span className="text-sm">{cap.icon}</span>
                <span className="font-medium text-foreground">{cap.label}</span>
                <span className={`rounded-full border px-2 py-0.5 ${STATUS_CLASS[cap.status]}`}>
                  {cap.status === "READY" ? "بيانات موجودة" : "لا توجد بيانات"}
                </span>
                <span className="font-mono">{cap.sourceRef}</span>
                {onEdit[key] && (
                  <button
                    onClick={onEdit[key]}
                    className="rounded-lg border border-border bg-card px-2 py-1 text-foreground hover:bg-muted"
                  >
                    عرض الملفات
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </section>
  );
}
