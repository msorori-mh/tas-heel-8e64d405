import { cn } from "@/lib/utils";

export const STUDENT_TAMKEEN_MARK_SRC = "/brand/student-tamkeen-mark.png";

export function StudentTamkeenMark({ className, alt = "" }: { className?: string; alt?: string }) {
  return (
    <img
      src={STUDENT_TAMKEEN_MARK_SRC}
      alt={alt}
      width={512}
      height={512}
      className={cn("shrink-0 object-contain", className)}
    />
  );
}
