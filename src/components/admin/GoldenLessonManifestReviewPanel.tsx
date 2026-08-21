import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ClipboardCheck, Database, FileSearch, Loader2, RefreshCw, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { GoldenLessonPackage } from "@/lib/content-factory/golden-lesson-contract";
import { stageApprovedGoldenLessonDomainBundle } from "@/lib/content-factory/golden-lesson-domain-staging.functions";
import { bindApprovedGoldenLessonIdentity } from "@/lib/content-factory/golden-lesson-identity-binding.functions";
import { GOLDEN_REVIEW_TRANSITIONS, type GoldenReviewEvidence, type GoldenReviewStatus } from "@/lib/content-factory/golden-lesson-review";
import {
  advanceGoldenLessonReview,
  getGoldenLessonPackageHistory,
  getGoldenLessonPersistenceCapability,
  listGoldenLessonPackages,
  ownerApproveGoldenLessonForStaging,
  stageGoldenLessonManifest,
  type GoldenPackageReview,
  type GoldenPackageSummary,
  type GoldenPackageVersion,
} from "@/lib/content-factory/golden-lesson-persistence.functions";
import { GOLDEN_PACKAGE_MAX_MANIFEST_BYTES, parseGoldenLessonManifest, previewGoldenLessonStaging, type GoldenLessonStagingPreview } from "@/lib/content-factory/golden-lesson-staging";

const EVIDENCE_LABEL: Record<keyof GoldenReviewEvidence, string> = {
  packageValidationPassed: "نجح فحص عقد الحزمة",
  officialProvenanceChecked: "راجع مسؤول المحتوى توثيق المصدر الرسمي",
  answerSeparationChecked: "تم التحقق من فصل الإجابات عن الحمولة العامة",
  responsivePreviewChecked: "تمت معاينة الجوال وسطح المكتب",
};
const STATUS_LABEL: Record<GoldenReviewStatus, string> = {
  DRAFT: "مسودة", SUBMITTED: "مرسلة للمراجعة", CONTENT_APPROVED: "اعتماد المحتوى", APPROVED_FOR_STAGING: "معتمدة للتجهيز",
};
async function sha256Text(raw: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function GoldenLessonManifestReviewPanel() {
  const checkCapability = useServerFn(getGoldenLessonPersistenceCapability);
  const loadPackages = useServerFn(listGoldenLessonPackages);
  const loadHistory = useServerFn(getGoldenLessonPackageHistory);
  const saveManifest = useServerFn(stageGoldenLessonManifest);
  const advanceReview = useServerFn(advanceGoldenLessonReview);
  const ownerApprove = useServerFn(ownerApproveGoldenLessonForStaging);
  const stageDomain = useServerFn(stageApprovedGoldenLessonDomainBundle);
  const bindIdentity = useServerFn(bindApprovedGoldenLessonIdentity);
  const [persistence, setPersistence] = useState<{ available: boolean; reason: string }>({ available: false, reason: "CHECKING" });
  const [packages, setPackages] = useState<GoldenPackageSummary[]>([]);
  const [selected, setSelected] = useState<GoldenPackageSummary | null>(null);
  const [versions, setVersions] = useState<GoldenPackageVersion[]>([]);
  const [reviews, setReviews] = useState<GoldenPackageReview[]>([]);
  const [manifest, setManifest] = useState<GoldenLessonPackage | null>(null);
  const [preview, setPreview] = useState<GoldenLessonStagingPreview | null>(null);
  const [manifestHash, setManifestHash] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<GoldenReviewEvidence>({ packageValidationPassed: false, officialProvenanceChecked: false, answerSeparationChecked: false, responsivePreviewChecked: false });
  const [ownerReason, setOwnerReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const capability = await checkCapability();
      setPersistence(capability);
      if (capability.available) setPackages(await loadPackages());
      else { setPackages([]); setSelected(null); }
    } catch (error) {
      setPersistence({ available: false, reason: "CAPABILITY_CHECK_FAILED" });
      setMessage(error instanceof Error ? error.message : "تعذر فحص مخطط التخزين.");
    }
  }, [checkCapability, loadPackages]);
  useEffect(() => { void refresh(); }, [refresh]);

  const selectPackage = useCallback(async (pkg: GoldenPackageSummary) => {
    setSelected(pkg); setBusy(true);
    try {
      const history = await loadHistory({ data: pkg.id });
      setVersions(history.versions); setReviews(history.reviews);
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تحميل السجل."); }
    finally { setBusy(false); }
  }, [loadHistory]);

  const next = useMemo(() => selected ? GOLDEN_REVIEW_TRANSITIONS.find((item) => item.from === selected.reviewStatus) : undefined, [selected]);
  const loadManifest = async (file?: File) => {
    if (!file) return; setBusy(true); setMessage(null);
    try {
      if (file.size > GOLDEN_PACKAGE_MAX_MANIFEST_BYTES) throw new Error("MANIFEST_TOO_LARGE");
      const raw = await file.text(); const parsed = parseGoldenLessonManifest(raw); const result = previewGoldenLessonStaging(parsed);
      setManifest(parsed as GoldenLessonPackage); setPreview(result); setManifestHash(await sha256Text(raw));
      setEvidence((current) => ({ ...current, packageValidationPassed: result.valid }));
      setMessage(result.valid ? "نجح Dry-Run المحلي. الحفظ في staging متاح فقط بعد تطبيق المخطط." : "فشل Dry-Run: صحح الأخطاء.");
    } catch (error) {
      setManifest(null); setPreview(null); setManifestHash(null);
      setMessage(error instanceof Error && error.message === "MANIFEST_TOO_LARGE" ? "Manifest أكبر من 1MB." : "Manifest JSON غير صالح.");
    } finally { setBusy(false); }
  };
  const persistManifest = async () => {
    if (!manifest || !manifestHash || !preview?.valid || !persistence.available) return;
    setBusy(true); setMessage(null);
    try {
      const result = await saveManifest({ data: { manifest, clientManifestSha256: manifestHash } });
      setMessage(`حُفظت بيانات staging: الإصدار ${result.version}، الكتابات ${result.writesPerformed}، كتابات المحتوى 0.`);
      await refresh();
      const current = (await loadPackages()).find((pkg: GoldenPackageSummary) => pkg.id === result.packageId);
      if (current) await selectPackage(current);
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر حفظ staging."); }
    finally { setBusy(false); }
  };
  const persistTransition = async () => {
    if (!selected || !next || !persistence.available) return;
    setBusy(true); setMessage(null);
    try {
      const result = await advanceReview({ data: { packageId: selected.id, expectedVersion: selected.currentVersion, toStatus: next.to, evidence, note: null } });
      let automaticPreparation = "";
      if (result.status === "APPROVED_FOR_STAGING") {
        const staged = await stageDomain({ data: { packageId: selected.id, version: selected.currentVersion } });
        await bindIdentity({ data: { batchId: staged.batchId } });
        automaticPreparation = " وتم تجهيزها وربطها بالدرس تلقائيًا.";
      }
      setMessage(`تم تحديث حالة المراجعة إلى ${STATUS_LABEL[result.status as GoldenReviewStatus]}${automaticPreparation}`);
      const latest = await loadPackages(); setPackages(latest);
      const current = latest.find((pkg: GoldenPackageSummary) => pkg.id === selected.id); if (current) await selectPackage(current);
    } catch (error) { setMessage(error instanceof Error ? error.message : "رفض الخادم الانتقال."); }
    finally { setBusy(false); }
  };
  const persistOwnerApproval = async () => {
    if (!selected || !persistence.available || ownerReason.trim().length < 20) return;
    setBusy(true); setMessage(null);
    try {
      const result = await ownerApprove({ data: {
        packageId: selected.id,
        expectedVersion: selected.currentVersion,
        evidence,
        reason: ownerReason,
      } });
      setMessage(`تم اعتماد مالك المنصة للتجهيز مع سجل تدقيق. كتابات المحتوى: ${result.domainWritesPerformed}.`);
      const latest = await loadPackages(); setPackages(latest);
      const current = latest.find((pkg: GoldenPackageSummary) => pkg.id === selected.id); if (current) await selectPackage(current);
    } catch (error) { setMessage(error instanceof Error ? error.message : "رفض الخادم اعتماد مالك المنصة."); }
    finally { setBusy(false); }
  };
  const stageAndBindSelectedPackage = async () => {
    if (!selected || selected.reviewStatus !== "APPROVED_FOR_STAGING") return;
    setBusy(true); setMessage(null);
    try {
      const staged = await stageDomain({ data: { packageId: selected.id, version: selected.currentVersion } });
      const bound = await bindIdentity({ data: { batchId: staged.batchId } });
      setMessage(`تم تجهيز الحزمة وربط هوية الدرس. batch=${staged.batchId.slice(0, 8)}… · binding=${bound.bindingId.slice(0, 8)}… · كتابات المحتوى 0. حدّث لوحة CF11 أدناه.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تجهيز الحزمة وربط الدرس."); }
    finally { setBusy(false); }
  };

  return (
    <section dir="rtl" aria-labelledby="golden-review-heading" className="rounded-2xl border border-primary/25 bg-card p-5 shadow-card space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <ClipboardCheck className="h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <h2 id="golden-review-heading" className="text-lg font-semibold">مسودات الدروس الواردة للمراجعة</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            اختر المسودة، تحقق من الأدلة، ثم اطلب التعديل أو اعتمدها. التجهيز التقني يتم تلقائيًا بعد الاعتماد.
          </p>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => void refresh()} disabled={busy}>
          <RefreshCw className="h-4 w-4" />تحديث
        </Button>
      </div>
      {!persistence.available && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">خدمة المراجعة غير متاحة حاليًا؛ أوقِف الاعتماد حتى عودتها.</p>}
      {busy && <p className="text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />جارٍ التحقق…</p>}

      {persistence.available && <div className="grid gap-4 lg:grid-cols-2"><div className="rounded-xl border p-4 space-y-2"><h3 className="font-medium">المسودات الواردة</h3>{packages.length === 0 && <p className="text-sm text-muted-foreground">لا توجد حزم محفوظة.</p>}{packages.map((pkg) => <button key={pkg.id} type="button" onClick={() => void selectPackage(pkg)} className="w-full min-h-[44px] rounded-lg border p-3 text-start hover:bg-muted/50"><span className="font-mono text-xs">{pkg.packageCode}</span><span className="float-left"><Badge>{STATUS_LABEL[pkg.reviewStatus]}</Badge> <Badge variant="outline">v{pkg.currentVersion}</Badge></span></button>)}</div>
        <div className="rounded-xl border p-4 space-y-3"><h3 className="font-medium">سجل الإصدارات والمراجعة</h3>{selected ? <><p className="font-mono text-xs">{selected.packageCode}</p><div className="max-h-48 overflow-auto space-y-1">{versions.map((version) => <p key={version.version} className="rounded border p-2 text-xs">الإصدار {version.version}</p>)}{reviews.map((review, index) => <p key={`${review.createdAt}-${index}`} className="rounded border p-2 text-xs">v{review.packageVersion}: {review.fromStatus} → {review.toStatus} · {review.actorRole}</p>)}</div></> : <p className="text-sm text-muted-foreground">اختر حزمة.</p>}</div></div>}

      <div className="rounded-xl border p-4 space-y-3"><div className="flex items-center justify-between gap-2"><span className="font-medium">قرار المراجعة</span><Badge>{selected ? STATUS_LABEL[selected.reviewStatus] : "اختر حزمة"}</Badge></div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{(Object.keys(EVIDENCE_LABEL) as (keyof GoldenReviewEvidence)[]).map((key) => <label key={key} className="flex min-h-[44px] items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={evidence[key]} disabled={key === "packageValidationPassed"} onChange={(event) => setEvidence((current) => ({ ...current, [key]: event.target.checked }))}/>{EVIDENCE_LABEL[key]}</label>)}</div>
        <Button type="button" onClick={() => void persistTransition()} disabled={busy || !persistence.available || !selected || !next} className="min-h-[44px] gap-2">{next ? <><CheckCircle2 className="h-4 w-4" />الانتقال إلى {STATUS_LABEL[next.to]}</> : <><ShieldAlert className="h-4 w-4" />لا انتقال متاح</>}</Button>
        {false && selected?.reviewStatus === "APPROVED_FOR_STAGING" && <Button type="button" variant="secondary" onClick={() => void stageAndBindSelectedPackage()} disabled={busy || !persistence.available} className="min-h-[44px] gap-2">
          <Database className="h-4 w-4" />تجهيز الحزمة وربط هوية الدرس
        </Button>}
        {false && selected && (selected.reviewStatus === "SUBMITTED" || selected.reviewStatus === "CONTENT_APPROVED") && <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-2">
          <Label htmlFor="owner-approval-reason">سبب اعتماد مالك المنصة (موثّق في سجل المراجعة)</Label>
          <Input id="owner-approval-reason" value={ownerReason} onChange={(event) => setOwnerReason(event.target.value)} placeholder="اكتب سبب الإطلاق العاجل بعد اكتمال التحقق" disabled={busy} />
          <Button type="button" variant="outline" onClick={() => void persistOwnerApproval()} disabled={busy || !persistence.available || ownerReason.trim().length < 20 || !Object.values(evidence).every(Boolean)} className="min-h-[44px] gap-2">
            <ShieldAlert className="h-4 w-4" />اعتماد مالك المنصة للتجهيز
          </Button>
        </div>}
      </div>
      {message && <p role="status" className="text-sm rounded-lg border bg-muted/30 px-3 py-2 flex items-start gap-2"><FileSearch className="h-4 w-4 mt-0.5 shrink-0" />{message}</p>}
    </section>
  );
}
