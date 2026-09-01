import { useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Layers,
  PlayCircle,
} from "lucide-react";
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
  const groups = groupSubjectsByMainCategory(subjects);
  const openGroup = openGroupKey ? groups.find((g) => g.id === openGroupKey) : undefined;

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
              اختر فرع المادة الذي تريد مذاكرته
            </div>
          </div>
        </div>

        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {groups.map((group) => {
        if (!group.isGroup) {
          const s = group.subjects[0];
          return (
            <li key={s.id}>
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
        const groupTone = subjectToneStyle(group.key, group.color);

        return (
          <li key={group.id}>
            <button
              type="button"
              onClick={() => setOpenGroupKey(group.id)}
              aria-label={`فتح فروع مادة ${group.key}`}
              style={groupTone}
              className="subject-card-accent subject-card-tone group flex min-h-32 w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card p-4 text-right shadow-sm transition-all motion-safe:hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  className="subject-icon-tone flex h-10 w-10 shrink-0 items-center justify-center rounded-lg"
                  aria-hidden
                >
                  <Layers className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-foreground">{group.key}</div>
                  <div className="text-[11px] text-muted-foreground">
                    مادة أساسية ·{" "}
                    {group.subjects.length === 1 ? "فرع واحد" : `${group.subjects.length} فروع`}
                    {lessons > 0 ? ` · ${lessons} درس` : ""}
                  </div>
                  {lessons > 0 && <MiniBar value={pct(groupMeta)} tone />}
                </div>
              </div>
              <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        );
      })}
    </ul>
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
}: {
  to: string;
  semester: 1 | 2;
  title: string;
  name: string;
  iconKey: string | null;
  color: string | null;
  meta?: SubjectMeta;
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
        className="subject-icon-tone flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start justify-between gap-2">
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-black text-foreground">{title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{state.detail}</span>
          </span>
          <span
            aria-label={available ? state.detail : PREPARING_CONTENT_LABEL}
            className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${state.className}`}
          >
            {state.label}
          </span>
        </span>
        {available ? (
          <span className="mt-3 block">
            <span className="mb-1.5 flex items-center justify-between gap-2 text-[11px]">
              <span className="font-semibold text-muted-foreground">التقدم</span>
              <span className="font-black" style={{ color: "var(--subject-accent)" }}>
                {value}%
              </span>
            </span>
            <MiniBar value={value} label={`التقدم في ${title}`} tone />
          </span>
        ) : null}
        <span
          className={cn(
            "mt-3 inline-flex items-center gap-1 text-xs font-bold",
            available ? "text-primary" : "text-muted-foreground",
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
          {available ? "فتح المادة" : PREPARING_CONTENT_LABEL}
        </span>
      </span>
      {available ? (
        <ChevronLeft
          className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5 motion-reduce:transition-none"
          aria-hidden
        />
      ) : null}
    </>
  );

  return (
    <div
      style={toneStyle}
      className={cn(
        "subject-card-accent subject-card-tone flex h-full min-h-40 flex-col overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-all motion-reduce:transition-none",
        available &&
          "motion-safe:hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md active:scale-[0.995]",
      )}
    >
      {available ? (
        <Link
          to="/subjects/$subjectId"
          params={{ subjectId: to }}
          search={{ semester }}
          className="group flex flex-1 items-start gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {body}
        </Link>
      ) : (
        <div
          className="flex flex-1 items-start gap-3 p-4"
          aria-label={`${title}: ${PREPARING_CONTENT_LABEL}`}
        >
          {body}
        </div>
      )}

      {/* 21B — curriculum books remain independent, but now live inside the card surface. */}
      <div className="border-t border-border/60 bg-muted/25 px-3 py-2">
        <button
          type="button"
          onClick={() => setBooksOpen(true)}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-3 text-xs font-bold text-muted-foreground transition-colors hover:bg-card hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BookOpen className="h-4 w-4" aria-hidden />
          كتب المنهج
          <span className="font-normal text-muted-foreground/80">عرض أو تنزيل</span>
        </button>
      </div>

      <SubjectTextbooksSheet
        open={booksOpen}
        onOpenChange={setBooksOpen}
        subjectId={to}
        subjectName={title}
        semester={semester}
      />
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
