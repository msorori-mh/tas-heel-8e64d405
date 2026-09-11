import { useEffect, useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, CheckCircle2, ChevronLeft, Clock3, PlayCircle } from "lucide-react";
import { SubjectTextbooksSheet } from "@/components/textbooks/SubjectTextbooksSheet";
import {
  getSubjectSubCategory,
  groupSubjectsByMainCategory,
  type GroupableSubject,
} from "@/lib/subjects/subject-grouping";
import { getSubjectIcon } from "@/lib/subjects/subject-icon";
import { getSubjectVisualTone } from "@/lib/subjects/subject-visual-tone";
import { cn } from "@/lib/utils";

export type SubjectMeta = { lessons: number; completed: number };
const PREPARING_CONTENT_LABEL = "المحتوى قيد التجهيز";
const MOBILE_INITIAL_SUBJECTS = 6;

type SubjectGroupsGridProps = {
  subjects: GroupableSubject[];
  semester: 1 | 2;
  meta?: Record<string, SubjectMeta>;
};

function pct(m?: SubjectMeta) {
  if (!m || m.lessons === 0) return 0;
  return Math.min(100, Math.round((m.completed / m.lessons) * 100));
}

function subjectToneStyle(name: string, storedColor?: string | null): CSSProperties {
  const tone = getSubjectVisualTone(name, storedColor);
  return {
    "--subject-accent": tone.accent,
    "--subject-soft": tone.soft,
    "--subject-wash": tone.wash,
  } as CSSProperties;
}

function subjectState(meta?: SubjectMeta) {
  if (!meta || meta.lessons === 0) {
    return {
      label: "قريبًا",
      detail: "لم تُنشر دروس بعد",
      className: "bg-muted text-muted-foreground",
    };
  }
  if (meta.completed >= meta.lessons) {
    return {
      label: "مكتملة",
      detail: `${meta.lessons} درس مكتمل`,
      className: "bg-success/10 text-success",
    };
  }
  if (meta.completed > 0) {
    return {
      label: "قيد التقدم",
      detail: `${meta.completed} من ${meta.lessons} درس`,
      className: "bg-primary/10 text-primary",
    };
  }
  return {
    label: "جاهزة",
    detail: `${meta.lessons} درس متاح`,
    className: "bg-accent/10 text-accent-foreground",
  };
}

/**
 * Renders the student's subjects grouped by main category.
 * - Ordinary subjects (no " - " separator) open directly, as before.
 * - A main category with more than one section shows as a single card;
 *   tapping it drills into its sections, each linking to the original
 *   subject page by its own subject.id.
 */
export function SubjectGroupsGrid({ subjects, semester, meta }: SubjectGroupsGridProps) {
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const [showAllMobile, setShowAllMobile] = useState(false);
  const [groupIntent, setGroupIntent] = useState<"lessons" | "books">("lessons");
  const groups = groupSubjectsByMainCategory(subjects);
  const openGroup = openGroupKey ? groups.find((g) => g.id === openGroupKey) : undefined;

  useEffect(() => {
    setOpenGroupKey(null);
    setShowAllMobile(false);
  }, [semester]);

  if (openGroup) {
    const GroupIcon = getSubjectIcon(openGroup.key, openGroup.icon);
    const groupTone = subjectToneStyle(openGroup.key, openGroup.color);
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setOpenGroupKey(null)}
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          عودة إلى المواد
        </button>

        <div
          className="subject-card-tone flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3.5 shadow-sm"
          style={groupTone}
        >
          <span
            className="subject-icon-tone flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
            aria-hidden
          >
            <GroupIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-foreground">{openGroup.key}</div>
            <div className="text-[11px] text-muted-foreground">
              {groupIntent === "books"
                ? "اختر فرع المادة، ثم افتح كتب المنهج"
                : "اختر فرع المادة الذي تريد مذاكرته"}
            </div>
          </div>
        </div>

        <ul className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
          {openGroup.subjects.map((s) => (
            <li key={s.id}>
              <SubjectTile
                to={s.id}
                semester={semester}
                title={getSubjectSubCategory(s.name) || s.name}
                name={s.name}
                iconKey={s.icon}
                color={s.color ?? openGroup.color}
                meta={meta?.[s.id]}
              />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
        {groups.map((group, index) => {
          const mobileVisibility =
            !showAllMobile && index >= MOBILE_INITIAL_SUBJECTS ? "hidden sm:list-item" : undefined;
          if (!group.isGroup) {
            const s = group.subjects[0];
            return (
              <li key={s.id} className={mobileVisibility}>
                <SubjectTile
                  to={s.id}
                  semester={semester}
                  title={s.name}
                  name={s.name}
                  iconKey={s.icon}
                  color={s.color}
                  meta={meta?.[s.id]}
                />
              </li>
            );
          }

          const lessons = group.subjects.reduce((n, s) => n + (meta?.[s.id]?.lessons ?? 0), 0);
          const completed = group.subjects.reduce((n, s) => n + (meta?.[s.id]?.completed ?? 0), 0);
          const groupMeta: SubjectMeta = { lessons, completed };
          return (
            <li key={group.id} className={mobileVisibility}>
              <SubjectTile
                to={group.id}
                semester={semester}
                title={group.key}
                name={group.key}
                iconKey={group.icon}
                color={group.color}
                meta={groupMeta}
                sectionCount={group.subjects.length}
                onOpenGroup={(intent) => {
                  setGroupIntent(intent);
                  setOpenGroupKey(group.id);
                }}
              />
            </li>
          );
        })}
      </ul>

      {groups.length > MOBILE_INITIAL_SUBJECTS ? (
        <button
          type="button"
          aria-expanded={showAllMobile}
          onClick={() => setShowAllMobile((current) => !current)}
          className="mx-auto flex min-h-11 items-center justify-center rounded-xl border border-border bg-card px-5 text-sm font-bold text-primary shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
        >
          {showAllMobile ? "عرض أقل" : `عرض الكل (${groups.length})`}
        </button>
      ) : null}
    </div>
  );
}

function SubjectTile({
  to,
  semester,
  title,
  name,
  iconKey,
  color,
  meta,
  sectionCount,
  onOpenGroup,
}: {
  to: string;
  semester: 1 | 2;
  title: string;
  name: string;
  iconKey: string | null;
  color: string | null;
  meta?: SubjectMeta;
  sectionCount?: number;
  onOpenGroup?: (intent: "lessons" | "books") => void;
}) {
  const Icon = getSubjectIcon(name, iconKey);
  const value = pct(meta);
  const state = subjectState(meta);
  const available = Boolean(meta && meta.lessons > 0);
  const toneStyle = subjectToneStyle(name, color);
  const [booksOpen, setBooksOpen] = useState(false);
  const body = (
    <>
      <span
        className="subject-icon-tone flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-11 sm:w-11"
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="flex h-10 min-w-0 items-center sm:h-auto sm:flex-1 sm:self-stretch">
        <span className="flex w-full items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="line-clamp-2 text-sm font-black leading-5 text-foreground sm:text-[15px]">
              {title}
            </span>
            <span className="mt-0.5 hidden text-xs text-muted-foreground sm:block">
              {sectionCount ? `${sectionCount} فروع · ` : ""}
              {state.detail}
            </span>
          </span>
          <span
            aria-label={available ? state.detail : PREPARING_CONTENT_LABEL}
            className={`hidden shrink-0 rounded-full px-2 py-1 text-[11px] font-bold sm:inline-flex ${state.className}`}
          >
            {state.label}
          </span>
        </span>
      </span>
      <span className="col-span-2 block w-full sm:col-start-2">
        <span className="mb-1 flex items-center justify-between gap-1 text-[11px] leading-4">
          <span className="font-semibold text-muted-foreground">
            {available ? "التقدم" : "قيد التجهيز"}
          </span>
          <span className="font-black tabular-nums" style={{ color: "var(--subject-accent)" }}>
            {value}%
          </span>
        </span>
        <MiniBar value={value} label={`التقدم في ${title}`} tone />
        <span
          className={cn(
            "mt-3 hidden items-center gap-1 text-xs font-bold sm:inline-flex",
            available || onOpenGroup ? "text-primary" : "text-muted-foreground",
          )}
        >
          {available ? (
            meta && meta.completed > 0 ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <PlayCircle className="h-3.5 w-3.5" aria-hidden />
            )
          ) : (
            <Clock3 className="h-3.5 w-3.5" aria-hidden />
          )}
          {onOpenGroup ? "فتح فروع المادة" : available ? "فتح المادة" : PREPARING_CONTENT_LABEL}
        </span>
      </span>
      {available || onOpenGroup ? (
        <ChevronLeft
          className="col-start-3 row-span-2 row-start-1 hidden h-4 w-4 shrink-0 self-center text-muted-foreground transition-transform group-hover:-translate-x-0.5 sm:block motion-reduce:transition-none"
          aria-hidden
        />
      ) : null}
    </>
  );
  const bodyClassName =
    "group grid min-h-0 flex-1 grid-cols-[auto_minmax(0,1fr)] content-start items-center gap-x-2 gap-y-2 p-3 pb-2 text-right focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-3 sm:p-4";

  return (
    <div
      style={toneStyle}
      className={cn(
        "subject-card-accent subject-card-tone flex h-[148px] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-all sm:h-full sm:min-h-40 motion-reduce:transition-none",
        (available || onOpenGroup) &&
          "motion-safe:hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md active:scale-[0.995]",
      )}
    >
      {onOpenGroup ? (
        <button
          type="button"
          onClick={() => onOpenGroup("lessons")}
          aria-label={`فتح فروع مادة ${title}`}
          className={bodyClassName}
        >
          {body}
        </button>
      ) : available ? (
        <Link
          to="/subjects/$subjectId"
          params={{ subjectId: to }}
          search={{ semester }}
          className={bodyClassName}
        >
          {body}
        </Link>
      ) : (
        <div className={bodyClassName} aria-label={`${title}: ${PREPARING_CONTENT_LABEL}`}>
          {body}
        </div>
      )}

      <div className="shrink-0 border-t border-border/60 bg-muted/25 px-2 sm:px-3 sm:py-2">
        <button
          type="button"
          onClick={() => (onOpenGroup ? onOpenGroup("books") : setBooksOpen(true))}
          aria-label={`كتب منهج ${title}: عرض أو تنزيل`}
          className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-bold text-muted-foreground transition-colors hover:bg-card hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3"
        >
          <BookOpen className="h-4 w-4 shrink-0" aria-hidden />
          <span>كتب المنهج</span>
          <span className="hidden font-normal text-muted-foreground/80 sm:inline">
            عرض أو تنزيل
          </span>
        </button>
      </div>

      {!onOpenGroup && (
        <SubjectTextbooksSheet
          open={booksOpen}
          onOpenChange={setBooksOpen}
          subjectId={to}
          subjectName={title}
          semester={semester}
        />
      )}
    </div>
  );
}

function MiniBar({
  value,
  label = "نسبة التقدم",
  tone = false,
}: {
  value: number;
  label?: string;
  tone?: boolean;
}) {
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      className="block h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      <span
        className={cn(
          "block h-1.5 rounded-full transition-[width] motion-reduce:transition-none",
          tone ? "subject-progress-tone" : "progress-bar-fill",
        )}
        style={{ width: `${value}%` }}
      />
    </span>
  );
}
