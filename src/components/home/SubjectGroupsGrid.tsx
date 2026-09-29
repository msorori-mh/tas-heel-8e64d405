import { useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BookOpen,
  ChevronLeft,
  Clock3,
  Download,
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
import type { SubjectDownloadState } from "@/lib/subjects/subject-downloads";

export type SubjectMeta = {
  lessons: number;
  completed: number;
  started?: boolean;
  progressKnown?: boolean;
  resumeLesson?: { id: string; title: string };
};
const PREPARING_CONTENT_LABEL = "المحتوى قيد التجهيز";

type SubjectGroupsGridProps = {
  subjects: GroupableSubject[];
  semester: 1 | 2;
  meta?: Record<string, SubjectMeta>;
  downloads?: Record<string, SubjectDownloadState>;
};

function pct(m?: SubjectMeta) {
  if (!m || m.lessons === 0) return 0;
  return Math.max(0, Math.min(100, Math.round((m.completed / m.lessons) * 100)));
}

function subjectToneStyle(name: string, storedColor?: string | null): CSSProperties {
  const tone = getSubjectVisualTone(name, storedColor);
  return {
    "--subject-accent": tone.accent,
    "--subject-soft": tone.soft,
    "--subject-wash": tone.wash,
  } as CSSProperties;
}

function lessonCountLabel(count: number) {
  const number = count.toLocaleString("ar-u-nu-arab");
  if (count === 1) return "درس واحد متاح";
  if (count === 2) return "درسان متاحان";
  if (count % 100 >= 3 && count % 100 <= 10) return `${number} دروس متاحة`;
  return `${number} درسًا متاحًا`;
}

function progressLabel(meta?: SubjectMeta) {
  if (meta?.progressKnown === false) return "التقدم غير متاح";
  if (!meta?.completed) return meta?.started ? "بدأت التعلم" : "لم تبدأ بعد";
  const completed = Math.min(meta.completed, meta.lessons).toLocaleString("ar-u-nu-arab");
  return `أكملت ${completed} من ${meta.lessons.toLocaleString("ar-u-nu-arab")} دروس`;
}

/**
 * Renders the student's subjects grouped by main category.
 * - Ordinary subjects (no " - " separator) open directly, as before.
 * - A main category with more than one section shows as a single card;
 *   tapping it drills into its sections, each linking to the original
 *   subject page by its own subject.id.
 */
export function SubjectGroupsGrid({ subjects, semester, meta, downloads }: SubjectGroupsGridProps) {
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
                download={downloads?.[s.id]}
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
                download={downloads?.[s.id]}
              />
            </li>
          );
        }

        const lessons = group.subjects.reduce((n, s) => n + (meta?.[s.id]?.lessons ?? 0), 0);
        const completed = group.subjects.reduce((n, s) => n + (meta?.[s.id]?.completed ?? 0), 0);
        const groupMeta: SubjectMeta = {
          lessons,
          completed,
          started: group.subjects.some((s) => meta?.[s.id]?.started),
          progressKnown: group.subjects.every((s) => meta?.[s.id]?.progressKnown !== false),
        };
        const groupTone = subjectToneStyle(group.key, group.color);

        return (
          <li key={group.id}>
            <button
              type="button"
              onClick={() => setOpenGroupKey(group.id)}
              aria-label={`فتح فروع مادة ${group.key}`}
              style={groupTone}
              className="subject-card-accent subject-card-tone group flex min-h-24 w-full items-center justify-between gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card p-3 text-right shadow-sm transition-all motion-safe:hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
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
                    {lessons > 0 ? ` · ${lessonCountLabel(lessons)}` : ""}
                  </div>
                  {lessons > 0 && (
                    <div className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                      <span>{progressLabel(groupMeta)}</span>
                      {completed > 0 && groupMeta.progressKnown && (
                        <MiniBar value={pct(groupMeta)} label={`التقدم في ${group.key}`} tone />
                      )}
                    </div>
                  )}
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
  download,
}: {
  to: string;
  semester: 1 | 2;
  title: string;
  name: string;
  iconKey: string | null;
  color: string | null;
  meta?: SubjectMeta;
  download?: SubjectDownloadState;
}) {
  const Icon = getSubjectIcon(name, iconKey);
  const value = pct(meta);
  const available = Boolean(meta && meta.lessons > 0);
  const complete = available && meta!.completed >= meta!.lessons;
  const resume = meta?.progressKnown !== false && !complete ? meta?.resumeLesson : undefined;
  const action = resume
    ? "تابع درسك"
    : complete
      ? "راجع المادة"
      : meta?.progressKnown === false
        ? "فتح المادة"
        : meta?.started || meta?.completed
          ? "واصل التعلم"
          : "ابدأ التعلم";
  const [booksOpen, setBooksOpen] = useState(false);
  const header = (
    <>
      <span
        className="subject-icon-tone flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
        aria-hidden
      >
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-black leading-snug text-foreground">{title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span>{available ? lessonCountLabel(meta!.lessons) : PREPARING_CONTENT_LABEL}</span>
          {download && (
            <span className="inline-flex items-center gap-1 font-semibold text-primary">
              <Download className="h-3 w-3" aria-hidden />
              {download === "downloaded" ? "محتوى محمّل" : "تنزيل جزئي"}
            </span>
          )}
        </span>
      </span>
      {available && <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
    </>
  );
  const actionClass =
    "relative z-10 inline-flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary/10 px-2 text-xs font-bold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <article
      style={subjectToneStyle(name, color)}
      className={cn(
        "subject-card-accent subject-card-tone relative flex h-full flex-col rounded-2xl border border-border/70 bg-card p-3 shadow-sm transition-shadow motion-reduce:transition-none",
        available && "hover:border-primary/30 hover:shadow-md",
      )}
    >
      {available ? (
        <Link
          to="/subjects/$subjectId"
          params={{ subjectId: to }}
          search={{ semester }}
          aria-label={`فتح مادة ${title}`}
          className="flex min-h-11 items-center gap-2.5 rounded-xl after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          {header}
        </Link>
      ) : (
        <div
          className="flex min-h-11 items-center gap-2.5"
          aria-label={`${title}: ${PREPARING_CONTENT_LABEL}`}
        >
          {header}
        </div>
      )}

      {available && (
        <div className="mt-2 space-y-1">
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>{progressLabel(meta)}</span>
            {meta!.completed > 0 && meta?.progressKnown !== false && (
              <span className="font-bold text-primary">
                {value.toLocaleString("ar-u-nu-arab")}%
              </span>
            )}
          </div>
          {meta!.completed > 0 && meta?.progressKnown !== false && (
            <MiniBar value={value} label={`التقدم في ${title}`} tone />
          )}
          {resume && (
            <p className="truncate text-[11px] text-muted-foreground" title={resume.title}>
              آخر درس: {resume.title}
            </p>
          )}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        {available ? (
          resume ? (
            <Link
              to="/lessons/$lessonId"
              params={{ lessonId: resume.id }}
              className={actionClass}
              aria-label={`${action}: ${resume.title}`}
            >
              <PlayCircle className="h-4 w-4 shrink-0" aria-hidden />
              {action}
            </Link>
          ) : (
            <Link
              to="/subjects/$subjectId"
              params={{ subjectId: to }}
              search={{ semester }}
              className={actionClass}
              aria-label={`${action}: ${title}`}
            >
              <PlayCircle className="h-4 w-4 shrink-0" aria-hidden />
              {action}
            </Link>
          )
        ) : (
          <span className="flex min-h-11 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
            <Clock3 className="h-4 w-4" aria-hidden />
            قريبًا
          </span>
        )}
        <button
          type="button"
          onClick={() => setBooksOpen(true)}
          aria-label={`كتب المنهج: ${title} — عرض أو تنزيل`}
          className="relative z-10 inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BookOpen className="h-4 w-4" aria-hidden />
          كتب المنهج
        </button>
      </div>
      <SubjectTextbooksSheet
        open={booksOpen}
        onOpenChange={setBooksOpen}
        subjectId={to}
        subjectName={title}
        semester={semester}
      />
    </article>
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
