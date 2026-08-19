import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, FileSearch, Loader2, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  GOLDEN_REVIEW_ROLES,
  GOLDEN_REVIEW_TRANSITIONS,
  evaluateGoldenReviewTransition,
  type GoldenReviewEvidence,
  type GoldenReviewRole,
  type GoldenReviewStatus,
} from "@/lib/content-factory/golden-lesson-review";
import {
  GOLDEN_PACKAGE_MAX_MANIFEST_BYTES,
  parseGoldenLessonManifest,
  previewGoldenLessonStaging,
  type GoldenLessonStagingPreview,
} from "@/lib/content-factory/golden-lesson-staging";

const EVIDENCE_LABEL: Record<keyof GoldenReviewEvidence, string> = {
  packageValidationPassed: "نجح فحص عقد الحزمة",
  officialProvenanceChecked: "راجع مسؤول المحتوى توثيق المصدر الرسمي",
  answerSeparationChecked: "تم التحقق من فصل الإجابات عن الحمولة العامة",
  responsivePreviewChecked: "تمت معاينة الجوال وسطح المكتب",
};

const STATUS_LABEL: Record<GoldenReviewStatus, string> = {
  DRAFT: "مسودة",
  SUBMITTED: "مرسلة للمراجعة",
  CONTENT_APPROVED: "اعتماد المحتوى",
  APPROVED_FOR_STAGING: "معتمدة للتجهيز",
};

async function sha256Text(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function GoldenLessonManifestReviewPanel() {
  const [preview, setPreview] = useState<GoldenLessonStagingPreview | null>(null);
  const [manifestHash, setManifestHash] = useState<string | null>(null);
  const [status, setStatus] = useState<GoldenReviewStatus>("DRAFT");
  const [role, setRole] = useState<GoldenReviewRole>("CONTENT_EDITOR");
  const [evidence, setEvidence] = useState<GoldenReviewEvidence>({
    packageValidationPassed: false,
    officialProvenanceChecked: false,
    answerSeparationChecked: false,
    responsivePreviewChecked: false,
  });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const next = useMemo(
    () => GOLDEN_REVIEW_TRANSITIONS.find((item) => item.from === status),
    [status],
  );

  const loadManifest = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    setMessage(null);
    setStatus("DRAFT");
    try {
      if (file.size > GOLDEN_PACKAGE_MAX_MANIFEST_BYTES) throw new Error("MANIFEST_TOO_LARGE");
      const raw = await file.text();
      const result = previewGoldenLessonStaging(parseGoldenLessonManifest(raw));
      setPreview(result);
      setManifestHash(await sha256Text(raw));
      setEvidence((current) => ({ ...current, packageValidationPassed: result.valid }));
      setMessage(result.valid ? "نجح Dry-Run للحزمة — لم تُنفّذ أي كتابة." : "فشل Dry-Run: صحح الأخطاء قبل المراجعة.");
    } catch (error) {
      setPreview(null);
      setManifestHash(null);
      setMessage(error instanceof Error && error.message === "MANIFEST_TOO_LARGE" ? "Manifest أكبر من 1MB." : "Manifest JSON غير صالح.");
    } finally {
      setBusy(false);
    }
  };

  const advanceReview = () => {
    if (!next) return;
    const decision = evaluateGoldenReviewTransition(status, next.to, role, evidence);
    if (!decision.allowed) {
      setMessage(decision.code === "ROLE_FORBIDDEN" ? "الدور المختار لا يملك هذا الانتقال." : `أدلة ناقصة: ${decision.missingEvidence.map((key) => EVIDENCE_LABEL[key]).join("، ")}`);
      return;
    }
    setStatus(decision.nextStatus);
    setMessage(`تم الانتقال محليًا إلى: ${STATUS_LABEL[decision.nextStatus]}. الكتابات المنفذة: 0`);
  };

  return (
    <section dir="rtl" aria-labelledby="golden-review-heading" className="rounded-2xl border border-primary/25 bg-card p-5 shadow-card space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-primary" />
        <h2 id="golden-review-heading" className="text-lg font-semibold">Dry‑Run ومراجعة حزمة الدرس</h2>
        <Badge variant="secondary">Local staging</Badge>
        <Badge variant="outline">0 writes</Badge>
      </div>
      <p className="text-sm text-muted-foreground">ارفع Manifest الناتج من المصنع. تُعرض خطة التجهيز والأدوار محليًا فقط؛ لا تجهيز خادمي ولا تنفيذ إنتاجي.</p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="golden-manifest-file">Manifest JSON</Label>
          <Input id="golden-manifest-file" type="file" accept=".json,application/json" disabled={busy} onChange={(event) => void loadManifest(event.target.files?.[0])} className="min-h-[44px]" />
        </div>
        <div className="space-y-2">
          <Label>الدور الحالي</Label>
          <Select value={role} onValueChange={(value) => setRole(value as GoldenReviewRole)}>
            <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
            <SelectContent>{GOLDEN_REVIEW_ROLES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {busy && <p className="text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />فحص Manifest وحساب SHA‑256…</p>}
      {manifestHash && <p className="font-mono text-[10px] break-all text-muted-foreground">manifest_sha256={manifestHash}</p>}

      {preview && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant={preview.valid ? "default" : "destructive"}>{preview.valid ? "DRY-RUN PASS" : "DRY-RUN FAIL"}</Badge>
            <Badge variant="outline">{preview.packageCode}</Badge>
            <Badge variant="outline">drafts planned: {preview.stagedDraftsPlanned}</Badge>
            <Badge variant="outline">domain writes: {preview.domainWritesPerformed}</Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs">
              <thead><tr className="border-b text-muted-foreground"><th className="p-2 text-start">#</th><th className="p-2 text-start">القدرة</th><th className="p-2 text-start">الهدف</th><th className="p-2 text-start">الإجراء</th></tr></thead>
              <tbody>{preview.actions.map((item) => <tr key={item.capability} className="border-b"><td className="p-2">{item.order}</td><td className="p-2 font-mono">{item.capability}</td><td className="p-2 font-mono">{item.target}</td><td className="p-2"><Badge variant="outline">{item.action}</Badge></td></tr>)}</tbody>
            </table>
          </div>
          {preview.findings.length > 0 && <ul className="space-y-1 text-sm">{preview.findings.map((finding, index) => <li key={`${finding.code}-${index}`} className="rounded-lg border px-3 py-2"><Badge variant={finding.severity === "ERROR" ? "destructive" : "outline"} className="ms-2">{finding.severity}</Badge>{finding.messageAr}</li>)}</ul>}
        </div>
      )}

      <div className="rounded-xl border p-4 space-y-3">
        <div className="flex items-center justify-between gap-2"><span className="font-medium">حالة المراجعة</span><Badge>{STATUS_LABEL[status]}</Badge></div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {(Object.keys(EVIDENCE_LABEL) as (keyof GoldenReviewEvidence)[]).map((key) => (
            <label key={key} className="flex min-h-[44px] items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <input type="checkbox" checked={evidence[key]} disabled={key === "packageValidationPassed"} onChange={(event) => setEvidence((current) => ({ ...current, [key]: event.target.checked }))} />
              {EVIDENCE_LABEL[key]}
            </label>
          ))}
        </div>
        <Button type="button" onClick={advanceReview} disabled={!preview?.valid || !next} className="min-h-[44px] gap-2">
          {next ? <><CheckCircle2 className="h-4 w-4" />الانتقال إلى {STATUS_LABEL[next.to]}</> : <><ShieldAlert className="h-4 w-4" />انتهت المراجعة المصدرية</>}
        </Button>
      </div>
      {message && <p role="status" className="text-sm rounded-lg border bg-muted/30 px-3 py-2 flex items-start gap-2"><FileSearch className="h-4 w-4 mt-0.5 shrink-0" />{message}</p>}
    </section>
  );
}
