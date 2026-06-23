import { CalendarDays, ChevronLeft } from "lucide-react";

type SemesterPickerProps = {
  onSelect: (semester: 1 | 2) => void;
};

export function SemesterPicker({ onSelect }: SemesterPickerProps) {
  return (
    <section id="start-studying" className="scroll-mt-4">
      <h2 className="mb-3 text-sm font-bold text-foreground">اختر الفصل الدراسي</h2>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <SemesterCard
          label="الفصل الدراسي الأول"
          subtitle="مواد الفصل الأول"
          accent="from-primary/10 to-primary/5"
          onClick={() => onSelect(1)}
        />
        <SemesterCard
          label="الفصل الدراسي الثاني"
          subtitle="مواد الفصل الثاني"
          accent="from-blue-500/10 to-blue-500/5"
          onClick={() => onSelect(2)}
        />
      </div>
    </section>
  );
}

function SemesterCard({
  label,
  subtitle,
  accent,
  onClick,
}: {
  label: string;
  subtitle: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex w-full items-center justify-between rounded-xl border border-border/60 bg-gradient-to-br ${accent} p-4 text-right shadow-sm transition-shadow hover:shadow-md`}
    >
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-background text-primary shadow-sm">
          <CalendarDays className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-bold text-foreground">{label}</p>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <ChevronLeft className="h-4 w-4 text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
    </button>
  );
}
