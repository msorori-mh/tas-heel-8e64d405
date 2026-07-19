import { Gift } from "lucide-react";
import {
  FREE_ACCESS_BADGE,
  FREE_ACCESS_SHORT,
  STUDENT_FREE_ACCESS,
} from "@/lib/student-free-access";

/** Home banner: free-access notice (payment/subscription CTAs frozen). */
export function HomeSubscriptionBanner() {
  if (!STUDENT_FREE_ACCESS) return null;

  return (
    <div
      className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 text-[11px]"
      dir="rtl"
    >
      <Gift className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden />
      <div className="min-w-0 space-y-0.5">
        <p className="font-semibold text-foreground">{FREE_ACCESS_BADGE}</p>
        <p className="leading-relaxed text-muted-foreground">{FREE_ACCESS_SHORT}</p>
      </div>
    </div>
  );
}
