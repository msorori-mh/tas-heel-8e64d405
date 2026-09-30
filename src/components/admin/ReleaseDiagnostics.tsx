import { GitCommitHorizontal } from "lucide-react";
import type { ReleaseInfo } from "@/lib/release-info";

export function ReleaseDiagnostics({ release }: { release: ReleaseInfo }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5" data-testid="release-diagnostics">
      <div className="flex items-center gap-2">
        <GitCommitHorizontal className="h-5 w-5 shrink-0 text-primary" />
        <h2 className="text-sm font-bold text-foreground">تشخيص الإصدار المنشور</h2>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="text-muted-foreground">
            {release.identityKind === "source"
              ? "بصمة ملفات المصدر (SHA-256)"
              : "التزام الإصدار (Git)"}
          </dt>
          <dd className="mt-1 select-all break-all font-mono text-foreground" dir="ltr">
            {release.verifiable ? release.id : "غير معروف"}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted-foreground">وقت بناء النسخة (UTC)</dt>
          <dd className="mt-1 break-all font-mono text-foreground" dir="ltr">
            {release.builtAt === "unknown" ? "غير معروف" : release.builtAt}
          </dd>
        </div>
      </dl>
      {release.identityKind === "source" && (
        <p className="mt-3 text-xs text-muted-foreground">
          بصمة محسوبة من ملفات المصدر وقت البناء.
        </p>
      )}
      {!release.verifiable && (
        <p role="alert" className="mt-3 text-xs text-destructive">
          تعذر إثبات بصمة هذا الإصدار؛ لا تعتمد النسخة للنشر قبل إعادة بناء موثقة.
        </p>
      )}
    </div>
  );
}
