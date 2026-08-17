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


      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px]">
        {[
          ["جاهزية الكتاب", readiness.bookReady],
          ["جاهزية التعلم", readiness.learningReady],
          ["جاهزية كاملة", readiness.fullyReady],
        ].map(([label, on]) => (
          <div
            key={label as string}
            className={`rounded-lg border px-2 py-2 ${
              on ? STATUS_CLASS.READY : STATUS_CLASS.ABSENT
            }`}
          >
            <div className="font-medium">{label as string}</div>
            <div className="mt-0.5">{on ? "نعم" : "لا"}</div>
          </div>
        ))}
      </div>

      <ul className="mt-4 space-y-2">
        {STUDENT_CAPABILITY_ORDER.map((key, index) => {
          const cap = contract[key];
          const edit = onEdit[key];
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
                    {STATUS_AR[cap.status]}
                  </span>
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
            </li>
          );
        })}
      </ul>
    </section>
  );
}
