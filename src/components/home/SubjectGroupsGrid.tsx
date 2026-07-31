import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, ChevronLeft, ArrowRight, Layers } from "lucide-react";
import {
  getSubjectSubCategory,
  groupSubjectsByMainCategory,
  type GroupableSubject,
} from "@/lib/subjects/subject-grouping";

type SubjectGroupsGridProps = {
  subjects: GroupableSubject[];
  semester: 1 | 2;
};

/**
 * Renders the student's subjects grouped by main category.
 * - Ordinary subjects (no " - " separator) open directly, as before.
 * - A main category with more than one section shows as a single card;
 *   tapping it drills into its sections, each linking to the original
 *   subject page by its own subject.id.
 */
export function SubjectGroupsGrid({ subjects, semester }: SubjectGroupsGridProps) {
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const groups = groupSubjectsByMainCategory(subjects);
  const openGroup = openGroupKey ? groups.find((g) => g.key === openGroupKey) : undefined;

  if (openGroup) {
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
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
            style={{ backgroundColor: openGroup.color ?? undefined }}
            aria-hidden
          >
            {openGroup.key?.[0] ?? <BookOpen className="h-4 w-4" />}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold text-foreground">{openGroup.key}</div>
            <div className="text-[11px] text-muted-foreground">اختر القسم الذي تريد مذاكرته</div>
          </div>
        </div>

        <ul className="grid gap-2.5 sm:grid-cols-2">
          {openGroup.subjects.map((s) => (
            <li key={s.id}>
              <Link
                to="/subjects/$subjectId"
                params={{ subjectId: s.id }}
                search={{ semester }}
                className="group flex items-center justify-between rounded-xl border border-border/60 bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                    style={{ backgroundColor: s.color ?? openGroup.color ?? undefined }}
                    aria-hidden
                  >
                    {getSubjectSubCategory(s.name)?.[0] ?? <BookOpen className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-foreground">
                      {getSubjectSubCategory(s.name) || s.name}
                    </div>
                    <div className="text-[11px] text-primary">ابدأ المذاكرة</div>
                  </div>
                </div>
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </Link>
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
              <Link
                to="/subjects/$subjectId"
                params={{ subjectId: s.id }}
                search={{ semester }}
                className="group flex items-center justify-between rounded-xl border border-border/60 bg-card p-3.5 shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                    style={{ backgroundColor: s.color ?? undefined }}
                    aria-hidden
                  >
                    {s.name?.[0] ?? <BookOpen className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-foreground">{s.name}</div>
                    <div className="text-[11px] text-primary">ابدأ المذاكرة</div>
                  </div>
                </div>
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              </Link>
            </li>
          );
        }

        return (
          <li key={group.key}>
            <button
              type="button"
              onClick={() => setOpenGroupKey(group.key)}
              className="group flex w-full items-center justify-between rounded-xl border border-border/60 bg-card p-3.5 text-right shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"
                  style={{ backgroundColor: group.color ?? undefined }}
                  aria-hidden
                >
                  <Layers className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-bold text-foreground">{group.key}</div>
                  <div className="text-[11px] text-primary">{group.subjects.length} أقسام</div>
                </div>
              </div>
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
