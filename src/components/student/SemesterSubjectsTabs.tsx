import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SemesterSubjectsView } from "@/components/student/SemesterSubjectsView";
import type { Semester } from "@/lib/subject-semester";

/** Both catalog entry routes use the same RTL, keyboard-accessible semester tabs. */
export function SemesterSubjectsTabs({
  semester,
  onSemesterChange,
}: {
  semester: Semester;
  onSemesterChange: (semester: Semester) => void;
}) {
  return (
    <Tabs
      dir="rtl"
      value={String(semester)}
      onValueChange={(value) => onSemesterChange(value === "2" ? 2 : 1)}
    >
      <TabsList
        aria-label="الفصل الدراسي"
        className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl border border-border/60 bg-muted/60 p-1"
      >
        {([1, 2] as const).map((value) => (
          <TabsTrigger
            key={value}
            value={String(value)}
            className="min-h-11 rounded-lg px-3 py-2 text-sm font-bold focus-visible:ring-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
          >
            {value === 1 ? "الفصل الأول" : "الفصل الثاني"}
          </TabsTrigger>
        ))}
      </TabsList>
      {([1, 2] as const).map((value) => (
        <TabsContent key={value} value={String(value)} className="mt-3">
          <SemesterSubjectsView semester={value} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
