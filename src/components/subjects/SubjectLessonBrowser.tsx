import { useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { BookOpen, CheckCircle2, ChevronLeft, ClipboardList, Search, X } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { STUDENT_FREE_ACCESS } from "@/lib/student-free-access";

export type Unit = {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_free: boolean;
  semester: number | null;
};

export type Lesson = {
  id: string;
  title: string;
  duration: string | null;
  unit_id: string | null;
  sort_order: number;
  semester: number | null;
};

// Normalize only for matching; the original lesson titles remain unchanged.
function searchText(text: string) {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ـ/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .trim();
}

/** Searches the already scoped index, including the flat index saved for offline use. */
export function SubjectLessonBrowser({
  units,
  lessons,
  completed: done,
}: {
  units: Unit[];
  lessons: Lesson[];
  completed: Set<string>;
}) {
  const [query, setQuery] = useState("");
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const words = searchText(query).split(/\s+/).filter(Boolean);
  const searching = words.length > 0;
  const visibleLessons = searching
    ? lessons.filter((lesson) => {
        const title = searchText(lesson.title);
        return words.every((word) => title.includes(word));
      })
    : lessons;
  const lessonsByUnit = new Map<string | null, Lesson[]>();
  for (const lesson of visibleLessons) {
    const unitId = lesson.unit_id ?? null;
    if (!lessonsByUnit.has(unitId)) lessonsByUnit.set(unitId, []);
    lessonsByUnit.get(unitId)!.push(lesson);
  }
  const orphans = lessonsByUnit.get(null) ?? [];
  const hasUnits = units.length > 0;
  const defaultOpen =
    units.find((unit) =>
      lessons.some((lesson) => lesson.unit_id === unit.id && !done.has(lesson.id)),
    )?.id ?? units[0]?.id;
  const visibleUnits = units
    .map((unit, index) => ({ unit, index: index + 1 }))
    .filter(({ unit }) => !searching || lessonsByUnit.has(unit.id));
  const unitBlocks = (
    <>
      {visibleUnits.map(({ unit: u, index }) => (
        <UnitBlock
          key={u.id}
          unitId={u.id}
          index={index}
          title={u.title}
          description={u.description}
          isFree={u.is_free}
          lessons={lessonsByUnit.get(u.id) ?? []}
          completed={done}
        />
      ))}
      {orphans.length > 0 && (
        <UnitBlock
          value="__orphans"
          title="دروس أخرى"
          description={null}
          isFree={null}
          lessons={orphans}
          completed={done}
        />
      )}
    </>
  );
  function clearSearch() {
    setQuery("");
    input.current?.focus();
  }
  return (
    <div className="min-w-0 space-y-3" dir="rtl">
      {lessons.length > 0 && (
        <div role="search" aria-label="البحث في دروس المادة">
          <label htmlFor={inputId} className="mb-2 block text-sm font-semibold">
            البحث عن درس
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={input}
              id={inputId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="اكتب عنوان الدرس…"
              aria-describedby={`${inputId}-results`}
              autoComplete="off"
              className="h-11 bg-card pl-12 pr-10 [&::-webkit-search-cancel-button]:appearance-none"
            />
            {query.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute left-0 top-0 h-11 w-11"
                aria-label="مسح البحث"
                onClick={clearSearch}
              >
                <X className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
          <p
            id={`${inputId}-results`}
            role="status"
            aria-live="polite"
            className="mt-2 text-xs text-muted-foreground"
          >
            {searching
              ? `نتائج البحث: ${visibleLessons.length} من ${lessons.length} درس`
              : "ابحث بعنوان الدرس داخل هذه المادة."}
          </p>
        </div>
      )}
      {searching && visibleLessons.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground">
          لا توجد دروس مطابقة. جرّب كلمة أخرى أو امسح البحث لعرض جميع الدروس.
        </p>
      ) : hasUnits ? (
        searching ? (
          <Accordion
            key="search"
            type="multiple"
            value={[
              ...visibleUnits.map(({ unit }) => unit.id),
              ...(orphans.length ? ["__orphans"] : []),
            ]}
            className="space-y-2.5"
          >
            {unitBlocks}
          </Accordion>
        ) : (
          <Accordion
            key="browse"
            type="single"
            collapsible
            defaultValue={defaultOpen}
            className="space-y-2.5"
          >
            {unitBlocks}
          </Accordion>
        )
      ) : (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h2 className="mb-3 text-sm font-bold text-foreground">الدروس</h2>
          <LessonList lessons={visibleLessons} completed={done} />
        </section>
      )}
    </div>
  );
}

function UnitBlock({
  unitId,
  value,
  index,
  title,
  description,
  isFree,
  lessons,
  completed,
}: {
  unitId?: string;
  value?: string;
  index?: number;
  title: string;
  description: string | null;
  isFree: boolean | null;
  lessons: Lesson[];
  completed: Set<string>;
}) {
  const doneCount = lessons.filter((l) => completed.has(l.id)).length;

  return (
    <AccordionItem
      value={unitId ?? value ?? title}
      className="rounded-2xl border border-border bg-card px-4 shadow-card"
    >
      <AccordionTrigger className="gap-3 text-right hover:no-underline">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="min-w-0 break-words text-sm font-bold text-foreground">
              {index && !/^الوحدة\s/.test(title.trim()) ? (
                <span className="text-muted-foreground">الوحدة {index}: </span>
              ) : null}
              {title}
            </h2>
            {isFree !== null && !STUDENT_FREE_ACCESS && (
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  isFree
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                    : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                }`}
              >
                {isFree ? "مجانية" : "ضمن الاشتراك"}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {lessons.length} درس · مكتمل {doneCount}
          </p>
        </div>
      </AccordionTrigger>

      <AccordionContent className="pb-4">
        {description && (
          <p className="mb-3 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}

        {lessons.length === 0 ? (
          unitId ? (
            <p className="text-xs text-muted-foreground">لا توجد دروس في هذه الوحدة بعد.</p>
          ) : null
        ) : (
          <LessonList lessons={lessons} completed={completed} />
        )}

        {unitId && (
          <div className="mt-3">
            <Link
              to="/units/$unitId/practice"
              params={{ unitId }}
              className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-secondary/40"
              aria-label="اختبار الوحدة"
            >
              <ClipboardList className="h-4 w-4 shrink-0" />
              <div className="min-w-0 text-right">
                <div className="font-medium">اختبار الوحدة</div>
                <div className="text-xs">اختبر فهمك بعد إكمال دروس الوحدة.</div>
              </div>
            </Link>
          </div>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

function LessonList({ lessons, completed }: { lessons: Lesson[]; completed: Set<string> }) {
  return (
    <ul className="space-y-2">
      {lessons.map((l) => {
        const isDone = completed.has(l.id);
        return (
          <li key={l.id}>
            <Link
              to="/lessons/$lessonId"
              params={{ lessonId: l.id }}
              className="flex items-center justify-between rounded-lg border border-border bg-background p-3 transition-colors hover:bg-secondary/40"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                    isDone ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/10 text-primary"
                  }`}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-foreground">{l.title}</div>
                  {l.duration && (
                    <div className="text-xs text-muted-foreground">
                      {l.duration} {/^\d+$/.test(l.duration) ? "دقيقة" : ""}
                    </div>
                  )}
                </div>
              </div>
              <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
