import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  BadgeCheck,
  FlaskConical,
  ImageUp,
  Layers,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Rocket,
  Undo2,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/hooks/use-auth";
import { V3_LIFECYCLE_CAPABILITIES } from "@/lib/lessons/capability-mapping";
import {
  attestGoldenLessonCf11Ready,
  getGoldenLessonCf11Batches,
  materializeGoldenLessonBatch,
  publishGoldenLessonCf11,
  revokeGoldenLessonCf11Ready,
  verifyGoldenLessonCf11Assets,
  type Cf11BatchStatus,
} from "@/lib/content-factory/golden-lesson-publication.functions";

/**
 * CF11-R6: READY is enabled only when the live lifecycle SET equals the canonical set exactly.
 * A count of seven proves nothing — a substituted, duplicated or retired capability name must
 * block attestation — so the expected set is imported from the single canonical source
 * (`src/lib/lessons/capability-mapping.ts`) and compared sorted, element by element.
 */
const CF11_EXPECTED_CAPABILITIES = [...V3_LIFECYCLE_CAPABILITIES].sort();


function short(value: string | null | undefined) {
  return value ? `${value.slice(0, 8)}…` : "—";
}

/**
 * CF11 operator console. Every human transition is executed with the signed-in operator's own
 * token; separation of duties means the person who published to REVIEW cannot attest READY.
 */
export function GoldenLessonCf11OperatorPanel() {
  const { user } = useAuth();
  const loadBatches = useServerFn(getGoldenLessonCf11Batches);
  const materialize = useServerFn(materializeGoldenLessonBatch);
  const verifyAssets = useServerFn(verifyGoldenLessonCf11Assets);
  const publish = useServerFn(publishGoldenLessonCf11);
  const attest = useServerFn(attestGoldenLessonCf11Ready);
  const revoke = useServerFn(revokeGoldenLessonCf11Ready);

  const [batches, setBatches] = useState<Cf11BatchStatus[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const [note, setNote] = useState("");
  const [revokeReason, setRevokeReason] = useState("");
  /**
   * Write-plan hashes captured from the DRY_RUN the operator actually reviewed, per batch.
   * EXECUTE is impossible until the matching hash exists: the server rejects a plan hash that
   * no longer describes the pending writes, so a stale review can never be executed.
   */
  const [plans, setPlans] = useState<Record<string, { cf10?: string; cf11?: string }>>({});

  const selected = useMemo(
    () => batches.find((batch) => batch.batchId === selectedId) ?? null,
    [batches, selectedId],
  );
  const selectedPlans = selectedId ? plans[selectedId] ?? {} : {};

  const refresh = useCallback(async () => {
    setBusy("refresh");
    try {
      const rows = await loadBatches();
      setBatches(rows);
      setAvailable(true);
      if (!rows.some((row) => row.batchId === selectedId)) setSelectedId(rows[0]?.batchId ?? null);
    } catch (error) {
      setAvailable(false);
      setMessage(error instanceof Error ? error.message : "تعذر قراءة دفعات CF11.");
    } finally {
      setBusy(null);
    }
  }, [loadBatches, selectedId]);
  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (
    key: string,
    action: () => Promise<unknown>,
    capture?: { batchId: string; stage: "cf10" | "cf11" },
  ) => {
    setBusy(key); setMessage(null);
    try {
      const result = await action();
      setMessage(JSON.stringify(result));
      const sha = (result as { planSha256?: string | null } | null)?.planSha256;
      if (capture && typeof sha === "string") {
        setPlans((current) => ({
          ...current,
          [capture.batchId]: { ...current[capture.batchId], [capture.stage]: sha },
        }));
      }
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "رفض الخادم العملية.");
    } finally {
      setBusy(null);
    }
  };

  const approved = selected?.reviewStatus === "APPROVED_FOR_STAGING";
  const bound = Boolean(selected?.bindingId);
  const readyCount = (selected?.lifecycle ?? []).filter((row) => row.status === "READY").length;
  const inReview = (selected?.lifecycle ?? []).filter((row) => row.status === "REVIEW").length;
  const liveCapabilities = useMemo(
    () => [...(selected?.lifecycle ?? [])].map((row) => row.capability).sort(),
    [selected],
  );
  /** Exact-set diagnosis: what is missing, what is foreign, and which rows are not in REVIEW. */
  const setDiff = useMemo(() => {
    const rows = selected?.lifecycle ?? [];
    const live = rows.map((row) => row.capability);
    const missing = CF11_EXPECTED_CAPABILITIES.filter((cap) => !live.includes(cap));
    const extra = [...new Set(live.filter((cap) => !CF11_EXPECTED_CAPABILITIES.includes(cap as never)))].sort();
    const duplicated = [...new Set(live.filter((cap, i) => live.indexOf(cap) !== i))].sort();
    const notInReview = rows.filter((row) => row.status !== "REVIEW").map((row) => `${row.capability}:${row.status}`).sort();
    /**
     * CF11-R7: set equality is not enough. A row parked at OPTIONAL/NA is silently excused from
     * the readiness contract, so it blocks attestation exactly like a missing capability does.
     */
    const notRequired = rows
      .filter((row) => row.applicability !== "REQUIRED")
      .map((row) => `${row.capability}:${row.applicability}`)
      .sort();
    const allReady = rows.length > 0 && rows.every((row) => row.status === "READY");
    const exact = missing.length === 0 && extra.length === 0 && duplicated.length === 0
      && live.length === CF11_EXPECTED_CAPABILITIES.length && notRequired.length === 0;
    return { missing, extra, duplicated, notInReview, notRequired, allReady, exact };
  }, [selected]);
  const isPublisher = Boolean(selected?.publishedBy && user?.id && selected.publishedBy === user.id);
  const canAttest = Boolean(selected?.published) && !selected?.readyAttestedAt && !isPublisher
    && !selected?.readyRevokedAt && setDiff.exact && setDiff.notInReview.length === 0;
  /** Withdrawal: only an attested, not-yet-withdrawn publication whose seven rows are all READY. */
  const isAttester = Boolean(
    selected?.readyAttestedBy && user?.id && selected.readyAttestedBy === user.id,
  );
  const canRevoke = Boolean(selected?.readyAttestedAt) && !selected?.readyRevokedAt
    && !isAttester && setDiff.exact && setDiff.allReady;
  /**
   * CF11-R8: publication (DRY_RUN and EXECUTE alike) performs zero asset writes, so the explicit
   * "تحقق ورفع الأصول" step must have produced machine attestations first.
   */
  const assetsVerified = (selected?.attestedAssets ?? 0) > 0;


  return (
    <section dir="rtl" aria-labelledby="cf11-operator-heading"
      className="rounded-2xl border border-primary/25 bg-card p-5 shadow-card space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Rocket className="h-5 w-5 text-primary" />
        <h2 id="cf11-operator-heading" className="text-lg font-semibold">نشر الدرس الذهبي (CF11)</h2>
        <Badge variant={available ? "default" : "secondary"}>{available ? "CF11 متاح" : "CF11 غير مطبق"}</Badge>
        <Badge variant="outline" className="font-mono text-[10px]">المشغّل: {short(user?.id)}</Badge>
        <Button type="button" size="sm" variant="ghost" onClick={() => void refresh()} disabled={busy !== null}>
          <RefreshCw className="h-4 w-4" />تحديث
        </Button>
      </div>

      {!available && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          لوحة CF11 معطّلة fail-closed حتى تطبيق مهاجرة CF11 في الإنتاج. لا تنفَّذ أي كتابة.
        </p>
      )}

      <div className="rounded-xl border p-4 space-y-2">
        <h3 className="font-medium">الدفعات المجهّزة</h3>
        {batches.length === 0 && <p className="text-sm text-muted-foreground">لا توجد دفعات.</p>}
        {batches.map((batch) => (
          <button key={batch.batchId} type="button" onClick={() => setSelectedId(batch.batchId)}
            aria-pressed={batch.batchId === selectedId}
            className={`w-full min-h-[44px] rounded-lg border p-3 text-start text-sm hover:bg-muted/50 ${batch.batchId === selectedId ? "border-primary bg-primary/5" : ""}`}>
            <span className="font-mono text-xs">{batch.externalLessonCode ?? short(batch.batchId)}</span>
            <span className="float-left flex flex-wrap gap-1">
              <Badge variant="outline">v{batch.packageVersion}</Badge>
              <Badge variant={batch.reviewStatus === "APPROVED_FOR_STAGING" ? "default" : "secondary"}>
                {batch.reviewStatus ?? "بلا مراجعة"}
              </Badge>
              {batch.materialized && <Badge variant="outline">CF10</Badge>}
              {batch.published && <Badge variant="outline">REVIEW</Badge>}
              {batch.readyAttestedAt && !batch.readyRevokedAt && <Badge>READY</Badge>}
              {batch.readyRevokedAt && <Badge variant="destructive">مسحوب</Badge>}
            </span>
          </button>
        ))}
      </div>

      {selected && (
        <div className="rounded-xl border p-4 space-y-4">
          <div className="grid gap-2 text-xs sm:grid-cols-2">
            <p>الدرس: <span className="font-mono">{short(selected.lessonId)}</span></p>
            <p>الربط: <span className="font-mono">{short(selected.bindingId)}</span></p>
            <p>نشر إلى المراجعة بواسطة: <span className="font-mono">{short(selected.publishedBy)}</span></p>
            <p>اعتمد READY بواسطة: <span className="font-mono">{short(selected.readyAttestedBy)}</span></p>
            <p>قدرات REVIEW: {inReview} · قدرات READY: {readyCount}</p>
            <p>الأصول: منشورة {selected.declaredAssets} · موثّقة رفعاً {selected.attestedAssets}</p>
            <p>سُحب الاعتماد بواسطة: <span className="font-mono">{short(selected.readyRevokedBy)}</span></p>
            <p className="sm:col-span-2 font-mono text-[10px] break-all">
              خطة CF10: {selectedPlans.cf10 ? short(selectedPlans.cf10) : "لم تُراجَع"} · خطة CF11:{" "}
              {selectedPlans.cf11 ? short(selectedPlans.cf11) : "لم تُراجَع"}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className="min-h-[44px] gap-2"
              disabled={busy !== null || !approved || !bound || selected.materialized}
              onClick={() => void run("materialize-dry",
                () => materialize({ data: { batchId: selected.batchId, mode: "DRY_RUN" } }),
                { batchId: selected.batchId, stage: "cf10" })}>
              <FlaskConical className="h-4 w-4" />معاينة CF10
            </Button>
            <Button type="button" variant="secondary" className="min-h-[44px] gap-2"
              disabled={busy !== null || !approved || !bound || selected.materialized || !selectedPlans.cf10}
              onClick={() => void run("materialize", () => materialize({
                data: {
                  batchId: selected.batchId,
                  mode: "EXECUTE",
                  expectedPlanSha256: selectedPlans.cf10!,
                },
              }))}>
              <Layers className="h-4 w-4" />تجسيد CF10
            </Button>
            <Button type="button" variant="secondary" className="min-h-[44px] gap-2"
              disabled={busy !== null || !bound}
              onClick={() => void run("assets", () => verifyAssets({ data: { batchId: selected.batchId } }))}>
              <ImageUp className="h-4 w-4" />تحقق ورفع الأصول
            </Button>
            <Button type="button" variant="outline" className="min-h-[44px] gap-2"
              disabled={busy !== null || !approved || !selected.materialized || !assetsVerified}
              onClick={() => void run("dry",
                () => publish({ data: { batchId: selected.batchId, mode: "DRY_RUN" } }),
                { batchId: selected.batchId, stage: "cf11" })}>
              <FlaskConical className="h-4 w-4" />CF11 DRY_RUN
            </Button>
            <Button type="button" className="min-h-[44px] gap-2"
              disabled={busy !== null || !approved || !selected.materialized || !assetsVerified || selected.published || !selectedPlans.cf11}
              onClick={() => void run("publish", () => publish({
                data: {
                  batchId: selected.batchId,
                  mode: "EXECUTE",
                  expectedPlanSha256: selectedPlans.cf11!,
                },
              }))}>
              <BadgeCheck className="h-4 w-4" />نشر إلى REVIEW
            </Button>
            {selected.lessonId && (
              <Button asChild type="button" variant="ghost" className="min-h-[44px]">
                <a href={`/lessons/${selected.lessonId}`} target="_blank" rel="noreferrer">معاينة الطالب</a>
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            الترتيب الإلزامي: «تحقق ورفع الأصول» ← CF11 DRY_RUN ← CF11 EXECUTE. النشر بمرحلتيه لا
            يرفع أصلاً ولا يوثّقه إطلاقاً؛ إن لم تكن الأصول موثّقة مسبقاً يرفض الخادم بـ
            CF11_ASSETS_NOT_VERIFIED. DRY_RUN لا يكتب أي شيء، والتنفيذ يرسل بصمة الخطة نفسها
            ويرفضها الخادم إذا تغيّرت.
          </p>



          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />اعتماد READY (فصل المهام: لا يجوز لناشر المراجعة اعتماد READY)
            </p>
            <div className="space-y-1">
              <Label htmlFor="cf11-note">ملاحظة المراجعة البشرية</Label>
              <Textarea id="cf11-note" value={note} onChange={(event) => setNote(event.target.value)}
                rows={2} placeholder="ما الذي تمت مراجعته فعلياً قبل الاعتماد؟" />
            </div>
            {isPublisher && (
              <p className="text-xs text-amber-600">لا يمكنك اعتماد READY لأنك نفّذت النشر إلى REVIEW.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="min-h-[44px]"
                disabled={busy !== null || !canAttest || note.trim().length < 8}
                onClick={() => void run("attest-dry", () => attest({ data: { batchId: selected.batchId, mode: "DRY_RUN", evidence: { reviewedContent: true, reviewedSecurity: true, note: note.trim() } } }))}>
                فحص الاعتماد (DRY_RUN)
              </Button>
              <Button type="button" className="min-h-[44px]"
                disabled={busy !== null || !canAttest || note.trim().length < 8}
                onClick={() => void run("attest", () => attest({ data: { batchId: selected.batchId, mode: "EXECUTE", evidence: { reviewedContent: true, reviewedSecurity: true, note: note.trim() } } }))}>
                اعتماد READY
              </Button>
            </div>
            <div className="space-y-1 text-[11px] text-muted-foreground">
              <p>
                القدرات الحيّة ({liveCapabilities.length}/{CF11_EXPECTED_CAPABILITIES.length}):{" "}
                {liveCapabilities.length > 0 ? liveCapabilities.join("، ") : "لا توجد قدرات مسجّلة"}
              </p>
              {setDiff.missing.length > 0 && (
                <p className="text-amber-600">قدرات ناقصة: {setDiff.missing.join("، ")}</p>
              )}
              {setDiff.extra.length > 0 && (
                <p className="text-amber-600">قدرات دخيلة: {setDiff.extra.join("، ")}</p>
              )}
              {setDiff.duplicated.length > 0 && (
                <p className="text-amber-600">قدرات مكرّرة: {setDiff.duplicated.join("، ")}</p>
              )}
              {setDiff.notInReview.length > 0 && (
                <p className="text-amber-600">حالات غير REVIEW: {setDiff.notInReview.join("، ")}</p>
              )}
              {setDiff.notRequired.length > 0 && (
                <p className="text-amber-600">قدرات ليست REQUIRED: {setDiff.notRequired.join("، ")}</p>
              )}
              {!setDiff.exact && (
                <p>الاعتماد مرفوض ما لم تطابق المجموعة الحيّة المجموعة القانونية بالضبط.</p>
              )}
            </div>

          </div>

          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <Undo2 className="h-4 w-4" />سحب الاعتماد (إخفاء عن الطلاب)
            </p>
            <p className="text-[11px] text-muted-foreground">
              السحب يعيد القدرات السبع جميعاً إلى DRAFT ذرّياً — وهي الحالة غير المرئية الوحيدة
              المدعومة بعد READY — ويحفظ أدلة الاعتماد الأصلية في سجل إلحاقي. لا يجوز لمن اعتمد
              READY أن يسحبه، والسحب نهائي: لا يمكن إعادة اعتماد النشر نفسه بعده.
            </p>
            <div className="space-y-1">
              <Label htmlFor="cf11-revoke-reason">سبب السحب (١٢ حرفاً فأكثر)</Label>
              <Input id="cf11-revoke-reason" value={revokeReason}
                onChange={(event) => setRevokeReason(event.target.value)}
                placeholder="لماذا يجب إخفاء هذا الدرس الآن؟" />
            </div>
            {isAttester && (
              <p className="text-xs text-amber-600">لا يمكنك سحب اعتماد قمت أنت باعتماده.</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="min-h-[44px]"
                disabled={busy !== null || !canRevoke || revokeReason.trim().length < 12}
                onClick={() => void run("revoke-dry", () => revoke({
                  data: { batchId: selected.batchId, mode: "DRY_RUN", reason: revokeReason.trim() },
                }))}>
                معاينة السحب (DRY_RUN)
              </Button>
              <Button type="button" variant="destructive" className="min-h-[44px]"
                disabled={busy !== null || !canRevoke || revokeReason.trim().length < 12}
                onClick={() => void run("revoke", () => revoke({
                  data: { batchId: selected.batchId, mode: "EXECUTE", reason: revokeReason.trim() },
                }))}>
                سحب الاعتماد
              </Button>
            </div>
          </div>
        </div>
      )}

      {busy && <p className="text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />جارٍ التنفيذ…</p>}
      {message && (
        <p role="status" className="rounded-lg border bg-muted/30 px-3 py-2 font-mono text-[11px] break-all">{message}</p>
      )}
    </section>
  );
}
