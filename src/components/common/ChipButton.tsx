/**
 * Filter chip with count (structure reused from Mufadala QuickReview.tsx:538-571,
 * restyled with Tamkeen tokens).
 */
export function ChipButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        "inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-card text-muted-foreground hover:bg-muted",
      ].join(" ")}
    >
      <span className="truncate">{label}</span>
      <span className="tabular-nums text-[11px] opacity-80">{count}</span>
    </button>
  );
}
