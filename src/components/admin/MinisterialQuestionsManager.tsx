import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Lock, Pencil, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MinisterialMediaImage } from "@/components/ministerial/MinisterialMediaImage";
import {
  deleteMinisterialModelQuestion,
  listMinisterialModelQuestions,
  updateMinisterialModelQuestion,
  uploadMinisterialQuestionImage,
  type MinisterialAdminQuestion,
  type MinisterialAdminQuestionMedia,
  type MinisterialModelRow,
} from "@/lib/ministerial/ministerial-admin-api";
import {
  ADEN_MEDIA_PLACEMENTS,
  MEDIA_PLACEMENT_LABEL_AR,
  MEDIA_PLACEMENT_SORT_ORDER,
  MINISTERIAL_MEDIA_PLACEMENTS,
  formatMediaBytes,
  type MinisterialMediaPlacement,
  type MinisterialPackageMedia,
} from "@/lib/ministerial/ministerial-media-contract";
import { clearMinisterialMediaCache } from "@/lib/ministerial/ministerial-media-client";

/**
 * Draft media state for one placement while editing:
 *   - `keep`    → existing image stays (RPC copies it to the new revision)
 *   - `replace` → a freshly uploaded object replaces it
 *   - `remove`  → no image for this placement in the new revision
 */
type MediaDraft =
  | { kind: "keep"; existing: MinisterialAdminQuestionMedia }
  | {
      kind: "replace";
      existing: MinisterialAdminQuestionMedia | null;
      next: MinisterialPackageMedia;
    }
  | { kind: "remove"; existing: MinisterialAdminQuestionMedia };

type MediaDraftMap = Partial<Record<MinisterialMediaPlacement, MediaDraft>>;

function initialDrafts(question: MinisterialAdminQuestion): MediaDraftMap {
  const drafts: MediaDraftMap = {};
  for (const item of question.media ?? [])
    drafts[item.placement] = { kind: "keep", existing: item };
  return drafts;
}

function draftsChanged(drafts: MediaDraftMap): boolean {
  return Object.values(drafts).some((draft) => draft && draft.kind !== "keep");
}

/** Exact media set the RPC should attach to the new revision. */
function draftsToMedia(
  drafts: MediaDraftMap,
  placements: readonly MinisterialMediaPlacement[],
): MinisterialPackageMedia[] {
  const out: MinisterialPackageMedia[] = [];
  for (const placement of placements) {
    const draft = drafts[placement];
    if (!draft || draft.kind === "remove") continue;
    if (draft.kind === "replace") {
      out.push(draft.next);
      continue;
    }
    const existing = draft.existing;
    if (!existing.sha256) {
      throw new Error(
        `تعذر الاحتفاظ بـ${MEDIA_PLACEMENT_LABEL_AR[placement]}: بصمة الصورة مفقودة.`,
      );
    }
    out.push({
      placement,
      file_name: `${placement.toLowerCase()}.${existing.mime_type === "image/png" ? "png" : existing.mime_type === "image/webp" ? "webp" : "jpg"}`,
      sha256: existing.sha256,
      mime_type: existing.mime_type as MinisterialPackageMedia["mime_type"],
      file_size: existing.file_size ?? 0,
      alt_text_ar: existing.alt_text_ar,
    });
  }
  return out.sort(
    (left, right) =>
      MEDIA_PLACEMENT_SORT_ORDER[left.placement] - MEDIA_PLACEMENT_SORT_ORDER[right.placement],
  );
}

export function MinisterialQuestionsManager({
  model,
  onChanged,
}: {
  model: MinisterialModelRow;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [questions, setQuestions] = useState<MinisterialAdminQuestion[]>([]);
  const [editing, setEditing] = useState<MinisterialAdminQuestion | null>(null);
  const [mediaDrafts, setMediaDrafts] = useState<MediaDraftMap>({});
  const [uploadingPlacement, setUploadingPlacement] = useState<MinisterialMediaPlacement | null>(
    null,
  );
  const [busy, setBusy] = useState(false);

  const placements: readonly MinisterialMediaPlacement[] =
    model.track_code === "sanaa" ? MINISTERIAL_MEDIA_PLACEMENTS : ADEN_MEDIA_PLACEMENTS;
  const hasSessions = useMemo(
    () => questions.some((question) => question.has_sessions),
    [questions],
  );

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setQuestions(await listMinisterialModelQuestions(model.id));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تحميل الأسئلة");
    } finally {
      setBusy(false);
    }
  }, [model.id]);
  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  function startEditing(question: MinisterialAdminQuestion) {
    setEditing(structuredClone(question));
    setMediaDrafts(initialDrafts(question));
  }

  function cancelEditing() {
    setEditing(null);
    setMediaDrafts({});
  }

  async function pickImage(placement: MinisterialMediaPlacement, file: File | null) {
    if (!file || !editing) return;
    const current = mediaDrafts[placement];
    const suggestedAlt =
      current && current.kind !== "remove"
        ? current.kind === "replace"
          ? current.next.alt_text_ar
          : current.existing.alt_text_ar
        : MEDIA_PLACEMENT_LABEL_AR[placement];
    const altText = window.prompt("وصف الصورة (نص بديل للطلاب ضعاف البصر):", suggestedAlt);
    if (altText === null) return;
    setUploadingPlacement(placement);
    try {
      const next = await uploadMinisterialQuestionImage({ file, placement, altText });
      setMediaDrafts((drafts) => ({
        ...drafts,
        [placement]: {
          kind: "replace",
          existing:
            current && current.kind !== "replace" ? current.existing : (current?.existing ?? null),
          next,
        },
      }));
      toast.success(
        `رُفعت ${MEDIA_PLACEMENT_LABEL_AR[placement]} (${formatMediaBytes(next.file_size)}). احفظ التعديل لاعتمادها.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل رفع الصورة");
    } finally {
      setUploadingPlacement(null);
    }
  }

  function removeImage(placement: MinisterialMediaPlacement) {
    setMediaDrafts((drafts) => {
      const current = drafts[placement];
      if (!current) return drafts;
      const next = { ...drafts };
      if (current.kind === "replace") {
        if (current.existing) next[placement] = { kind: "remove", existing: current.existing };
        else delete next[placement];
      } else {
        next[placement] = { kind: "remove", existing: current.existing };
      }
      return next;
    });
  }

  function restoreImage(placement: MinisterialMediaPlacement) {
    setMediaDrafts((drafts) => {
      const current = drafts[placement];
      if (!current || current.kind !== "remove") return drafts;
      return { ...drafts, [placement]: { kind: "keep", existing: current.existing } };
    });
  }

  async function save() {
    if (!editing) return;
    setBusy(true);
    try {
      const media = draftsChanged(mediaDrafts) ? draftsToMedia(mediaDrafts, placements) : undefined;
      await updateMinisterialModelQuestion(
        model.id,
        editing,
        media ? "تعديل إداري من شاشة النموذج (مع تغيير الوسائط)" : "تعديل إداري من شاشة النموذج",
        media,
      );
      if (media) clearMinisterialMediaCache();
      toast.success("تم تعديل السؤال وأعيد النموذج إلى مسودة للمراجعة.");
      cancelEditing();
      await load();
      onChanged();
    } catch (error) {
      const message = error instanceof Error ? error.message : "فشل التعديل";
      toast.error(
        message.includes("MINISTERIAL_EDIT_BLOCKED_SESSIONS_EXIST")
          ? "لا يمكن تعديل السؤال بعد وجود محاولات طلابية على هذا النموذج."
          : message.includes("MINISTERIAL_MEDIA_OBJECT_MISSING")
            ? "إحدى الصور لم تصل إلى التخزين. أعد رفعها ثم احفظ مرة أخرى."
            : message,
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove(question: MinisterialAdminQuestion) {
    if (!confirm(`حذف السؤال ${question.question_code} من هذا النموذج؟`)) return;
    setBusy(true);
    try {
      await deleteMinisterialModelQuestion(
        model.id,
        question.question_id,
        "حذف إداري من شاشة النموذج",
      );
      toast.success("تم حذف السؤال من النموذج وأعيد النموذج إلى مسودة.");
      await load();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "فشل الحذف");
    } finally {
      setBusy(false);
    }
  }

  function renderMediaSlot(placement: MinisterialMediaPlacement) {
    const draft = mediaDrafts[placement];
    const inputId = `ministerial-media-${placement}`;
    const isUploading = uploadingPlacement === placement;
    return (
      <div key={placement} className="rounded-md border border-border/70 bg-background p-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium">{MEDIA_PLACEMENT_LABEL_AR[placement]}</span>
          <div className="flex items-center gap-1">
            <input
              id={inputId}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              disabled={busy || hasSessions || isUploading}
              onChange={(event) => {
                void pickImage(placement, event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
            <Button
              asChild
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              disabled={busy || hasSessions || isUploading}
            >
              <label htmlFor={inputId} className="cursor-pointer">
                <ImagePlus className="ms-1 h-3.5 w-3.5" aria-hidden />
                {isUploading
                  ? "جارٍ الرفع…"
                  : draft && draft.kind !== "remove"
                    ? "استبدال"
                    : "إضافة صورة"}
              </label>
            </Button>
            {draft && draft.kind !== "remove" && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-destructive"
                disabled={busy || hasSessions}
                onClick={() => removeImage(placement)}
              >
                <X className="ms-1 h-3.5 w-3.5" aria-hidden />
                حذف
              </Button>
            )}
            {draft?.kind === "remove" && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                disabled={busy}
                onClick={() => restoreImage(placement)}
              >
                تراجع عن الحذف
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2">
          {!draft && <p className="text-xs text-muted-foreground">لا توجد صورة.</p>}
          {draft?.kind === "keep" && (
            <MinisterialMediaImage
              mediaId={draft.existing.media_id}
              alt={draft.existing.alt_text_ar}
              variant="inline"
            />
          )}
          {draft?.kind === "replace" && (
            <p className="text-xs text-foreground">
              صورة جديدة جاهزة: {draft.next.file_name} · {formatMediaBytes(draft.next.file_size)} ·{" "}
              <span className="font-mono">{draft.next.sha256.slice(0, 12)}…</span>
            </p>
          )}
          {draft?.kind === "remove" && (
            <p className="text-xs text-destructive">ستُحذف هذه الصورة عند الحفظ.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) cancelEditing();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Pencil className="ms-1 h-4 w-4" />
          الأسئلة
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>أسئلة {model.model_label ?? model.model_code}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          يمكن التعديل والحذف ما دام النموذج بلا محاولات طلابية. أي تعديل ينشئ نسخة جديدة للسؤال
          ويعيد النموذج تلقائيًا إلى مسودة قبل إعادة النشر.
        </p>
        {hasSessions && (
          <p className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-foreground">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            توجد محاولات طلابية على هذا النموذج؛ التعديل والحذف واستبدال الصور موقوفة.
          </p>
        )}
        {busy && questions.length === 0 ? (
          <p>جاري التحميل…</p>
        ) : (
          questions.map((question) => (
            <div
              key={question.question_id}
              className="flex items-start justify-between gap-3 rounded-md border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>
                    #{question.display_order} · {question.question_code}
                  </span>
                  {question.media?.length > 0 && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {question.media.length} صورة
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm">{question.question_text}</p>
                {question.media?.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {question.media.map((item) => (
                      <div key={item.media_id} className="space-y-0.5">
                        <MinisterialMediaImage
                          mediaId={item.media_id}
                          alt={item.alt_text_ar}
                          variant="inline"
                        />
                        <p className="text-[10px] text-muted-foreground">
                          {MEDIA_PLACEMENT_LABEL_AR[item.placement]}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  disabled={question.has_sessions}
                  onClick={() => startEditing(question)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="destructive"
                  disabled={question.has_sessions}
                  onClick={() => void remove(question)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))
        )}
        {!busy && questions.length === 0 && (
          <p className="text-sm text-muted-foreground">لا توجد أسئلة في النموذج.</p>
        )}
        {editing && (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <Label>نص السؤال</Label>
            <Textarea
              value={editing.question_text}
              onChange={(e) => setEditing({ ...editing, question_text: e.target.value })}
            />
            {model.track_code === "sanaa" &&
              editing.options.map((option, index) => (
                <div key={option.option_code} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="correct-option"
                    checked={option.is_correct}
                    onChange={() =>
                      setEditing({
                        ...editing,
                        options: editing.options.map((item, i) => ({
                          ...item,
                          is_correct: i === index,
                        })),
                      })
                    }
                  />
                  <Input
                    value={option.body}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        options: editing.options.map((item, i) =>
                          i === index ? { ...item, body: e.target.value } : item,
                        ),
                      })
                    }
                  />
                </div>
              ))}
            {model.track_code === "aden" && (
              <>
                <Label>الإجابة النموذجية</Label>
                <Textarea
                  value={editing.model_answer ?? ""}
                  onChange={(e) => setEditing({ ...editing, model_answer: e.target.value })}
                />
              </>
            )}
            <Label>الشرح</Label>
            <Textarea
              value={editing.explanation ?? ""}
              onChange={(e) => setEditing({ ...editing, explanation: e.target.value })}
            />
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>الترتيب</Label>
                <Input
                  type="number"
                  min={1}
                  value={editing.display_order}
                  onChange={(e) =>
                    setEditing({ ...editing, display_order: Number(e.target.value) })
                  }
                />
              </div>
              <div>
                <Label>الدرجة</Label>
                <Input
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={editing.marks}
                  onChange={(e) => setEditing({ ...editing, marks: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>الصور (PNG/JPG/WebP حتى 8MB — لا SVG)</Label>
              <div className="grid gap-2 sm:grid-cols-2">{placements.map(renderMediaSlot)}</div>
              <p className="text-[11px] text-muted-foreground">
                استبدال أو حذف صورة ينشئ نسخة جديدة من السؤال؛ النسخة المنشورة السابقة لا تُعدّل.
              </p>
            </div>
            <div className="flex gap-2">
              <Button disabled={busy || uploadingPlacement !== null} onClick={() => void save()}>
                حفظ التعديل
              </Button>
              <Button variant="outline" onClick={cancelEditing}>
                إلغاء
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
