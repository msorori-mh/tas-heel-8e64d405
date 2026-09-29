// Isolate sheet data loading; these checks exercise the card's independent books action.
export function SubjectTextbooksSheet({
  open,
  onOpenChange,
  subjectName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subjectName: string;
}) {
  return open ? (
    <div
      role="dialog"
      aria-label="كتب المنهج"
      style={{
        position: "fixed",
        inset: 24,
        background: "white",
        padding: 24,
        zIndex: 100,
        boxShadow: "0 0 0 100vmax #0005",
      }}
    >
      <h2>كتب المنهج — {subjectName}</h2>
      <button onClick={() => onOpenChange(false)}>إغلاق</button>
    </div>
  ) : null;
}
