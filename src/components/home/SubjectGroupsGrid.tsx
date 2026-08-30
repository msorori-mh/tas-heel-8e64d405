import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ArrowRight, BookOpen, Layers } from "lucide-react";
import { SubjectTextbooksSheet } from "@/components/textbooks/SubjectTextbooksSheet";
import {
  getSubjectSubCategory,
  groupSubjectsByMainCategory,
  type GroupableSubject,
} from "@/lib/subjects/subject-grouping";
import { getSubjectIcon } from "@/lib/subjects/subject-icon";

export type SubjectMeta = { lessons: number; completed: number };

type SubjectGroupsGridProps = {
  subjects: GroupableSubject[];
  semester: 1 | 2;
  meta?: Record<string, SubjectMeta>;
};

function pct(m?: SubjectMeta) {
  if (!m || m.lessons === 0) return 0;
  return Math.min(100, Math.round((m.completed / m.lessons) * 100));
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
  const openGroup = openGroupKey ? groups.find((g) => g.key === openGroupKey) : undefined;

  if (openGroup) {
    const GroupIcon = getSubjectIcon(openGroup.key, openGroup.icon);
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

        <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card p-3.5 shadow-sm">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            style={openGroup.color ? { backgroundColor: `${openGroup.color}1a` } : undefined}
            aria-hidden
          >
            <GroupIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-foreground">{openGroup.key}</div>
            <div className="text-[11px] text-muted-foreground">اختر القسم الذي تريد مذاكرته</div>
          </div>
        </div>

        <ul className="grid gap-2.5 sm:grid-cols-2">
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
    <ul className="grid gap-2.5 sm:grid-cols-2">
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

        return (
          <li key={group.key}>
            <button
              type="button"
              onClick={() => setOpenGroupKey(group.key)}
              className="group flex w-full items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3.5 text-right shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                  aria-hidden
                >
                  <Layers className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-foreground">{group.key}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {group.subjects.length} أقسام
                    {lessons > 0 ? ` · ${lessons} درس` : ""}
                  </div>
                  {lessons > 0 && <MiniBar value={pct(groupMeta)} />}
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
  const [booksOpen, setBooksOpen] = useState(false);
  return (
    <div className="relative">
      <Link
        to="/subjects/$subjectId"
        params={{ subjectId: to }}
        search={{ semester }}
        className="group flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md"
      >
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
            style={color ? { backgroundColor: `${color}1a`, color } : undefined}
            aria-hidden
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-foreground">{title}</div>
            <div className="text-[11px] text-muted-foreground">
              {meta && meta.lessons > 0
                ? `${meta.completed}/${meta.lessons} درس`
                : "المحتوى قيد التجهيز"}
            </div>
            {meta && meta.lessons > 0 && <MiniBar value={value} />}
          </div>
        </div>
        <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
      </Link>

      {/* 21B — compact, secondary entry point to the curriculum textbooks. */}
      <button
        type="button"
        onClick={() => setBooksOpen(true)}
        className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-border/60 bg-muted/40 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <BookOpen className="h-3.5 w-3.5" />
        كتب المنهج
      </button>

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

function MiniBar({ value }: { value: number }) {
  return (
    <div className="mt-1.5 h-1 w-full rounded-full bg-muted" aria-hidden>
      <div className="progress-bar-fill h-1 rounded-full" style={{ width: `${value}%` }} />
    </div>
  );
}
