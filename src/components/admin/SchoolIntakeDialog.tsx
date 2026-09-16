import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { schoolDirectoryApi as api } from "@/lib/schools/student-school-api";
import {
  intakeStatusLabels,
  type SchoolIntakeRow,
  type SchoolIntakeResponse,
} from "@/lib/schools/intake";

export function SchoolIntakeDialog({
  mode,
  governorates,
  onClose,
  onSaved,
}: {
  mode: "single" | "excel";
  governorates: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState<SchoolIntakeRow>({
    governorate_id: "",
    district: "",
    name: "",
    locality: "",
  });
  const [rows, setRows] = useState<SchoolIntakeRow[]>([]);
  const [result, setResult] = useState<SchoolIntakeResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const fresh = result?.rows.filter((r) => r.status === "new").length ?? 0;
  const added = result?.rows.filter((r) => r.status === "added").length ?? 0;
  const invalid = result?.rows.filter((r) => r.status === "invalid").length ?? 0;
  const duplicates =
    result?.rows.filter((r) => r.status === "exists" || r.status === "duplicate_file").length ?? 0;
  const fieldErrors = mode === "single" ? result?.rows[0]?.errors : undefined;
  const change = (key: keyof SchoolIntakeRow, value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setResult(null);
    setError("");
  };
  async function run(input: SchoolIntakeRow[], commit: boolean) {
    const response = await api.intake(input, commit);
    setResult(response);
    setConfirmed(false);
    if (commit && response.rows.some((r) => r.status === "added")) {
      await onSaved();
      if (mode === "single" || !response.rows.some((r) => r.status === "invalid")) {
        toast.success(
          mode === "single"
            ? "تمت إضافة المدرسة بنجاح."
            : `اكتمل الاستيراد: أُضيفت ${response.rows.filter((r) => r.status === "added").length} مدرسة.`,
        );
        onClose();
      }
    }
  }
  async function action(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر إتمام العملية.");
      setResult(null);
      setConfirmed(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        dir="rtl"
        className="flex flex-col w-[95vw] max-w-[95vw] max-h-[90dvh] overflow-hidden p-4 sm:max-w-3xl sm:p-6 [&>*]:min-w-0"
      >
        <DialogHeader className="min-w-0 shrink-0 pr-6 text-right sm:text-right">
          <DialogTitle>
            {mode === "single"
              ? "إضافة مدرسة"
              : result?.committed
                ? "نتيجة استيراد المدارس"
                : "استيراد المدارس من Excel"}
          </DialogTitle>
          <DialogDescription>
            تُضاف المدارس إلى الدليل لاختيار الطلاب والمعلمين. لا تتغير ارتباطات الملفات الحالية.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {mode === "single" ? (
          <form
            className="min-h-0 overflow-y-auto"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (!busy) void action(() => run([form], true));
            }}
          >
            <fieldset disabled={busy} className="space-y-4">
              <div>
                <Label htmlFor="intake-governorate">المحافظة</Label>
                <select
                  id="intake-governorate"
                  className="min-h-11 w-full rounded-md border bg-background px-3"
                  value={form.governorate_id}
                  onChange={(e) => change("governorate_id", e.target.value)}
                  aria-invalid={!!fieldErrors?.governorate}
                  aria-describedby="intake-governorate-error"
                >
                  <option value="">اختر المحافظة أولًا</option>
                  {governorates.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
                <p
                  id="intake-governorate-error"
                  role={fieldErrors?.governorate ? "alert" : undefined}
                  className="text-sm text-destructive"
                >
                  {fieldErrors?.governorate}
                </p>
              </div>
              {(
                [
                  ["district", "المديرية", 120],
                  ["name", "اسم المدرسة", 180],
                  ["locality", "الحي أو القرية (اختياري)", 120],
                ] as const
              ).map(([key, label, max]) => (
                <div key={key}>
                  <Label htmlFor={`intake-${key}`}>{label}</Label>
                  <Input
                    id={`intake-${key}`}
                    value={form[key]}
                    maxLength={max}
                    onChange={(e) => change(key, e.target.value)}
                    aria-invalid={!!fieldErrors?.[key]}
                    aria-describedby={`intake-${key}-error`}
                  />
                  <p
                    id={`intake-${key}-error`}
                    role={fieldErrors?.[key] ? "alert" : undefined}
                    className="text-sm text-destructive"
                  >
                    {fieldErrors?.[key]}
                  </p>
                </div>
              ))}
              {result?.rows[0]?.status === "exists" && (
                <p role="status">هذه المدرسة موجودة مسبقًا في الدليل؛ لم يُنشأ سجل مكرر.</p>
              )}
              {added > 0 && <p role="status">تمت إضافة المدرسة وأصبحت متاحة للاختيار.</p>}
              <Button type="submit" disabled={busy || added > 0}>
                {busy ? "جارٍ الحفظ…" : "حفظ المدرسة"}
              </Button>
            </fieldset>
          </form>
        ) : (
          <div className="min-h-0 min-w-0 space-y-4 overflow-y-auto">
            {!result?.committed && (
              <>
                <p className="text-sm">
                  ملف xlsx، حتى ٥٠٠ مدرسة و٥ ميجابايت. استخدم أسماء المحافظات من القالب. الحي أو
                  القرية اختياري.
                </p>
                <Button
                  variant="outline"
                  disabled={busy || !governorates.length}
                  onClick={() =>
                    void action(async () => {
                      const { downloadSchoolTemplate } = await import("@/lib/schools/intake-xlsx");
                      await downloadSchoolTemplate(governorates);
                    })
                  }
                >
                  تنزيل قالب Excel
                </Button>
                <div>
                  <Label htmlFor="school-intake-file">ملف المدارس</Label>
                  <Input
                    id="school-intake-file"
                    type="file"
                    accept=".xlsx"
                    disabled={busy}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      setRows([]);
                      setResult(null);
                      setConfirmed(false);
                      setError("");
                      if (!file) return;
                      void action(async () => {
                        if (!file.name.toLowerCase().endsWith(".xlsx"))
                          throw new Error("اختر ملفًا بصيغة xlsx.");
                        if (file.size > 5 * 1024 * 1024)
                          throw new Error("الحد الأقصى لحجم الملف ٥ ميجابايت.");
                        const { readSchoolWorkbook } = await import("@/lib/schools/intake-xlsx");
                        const parsed = await readSchoolWorkbook(await file.arrayBuffer());
                        setRows(parsed);
                        await run(parsed, false);
                      });
                    }}
                  />
                </div>
              </>
            )}
            {busy && <p role="status">جارٍ معالجة الملف…</p>}
            {!!rows.length && !result && !busy && (
              <Button variant="outline" onClick={() => void action(() => run(rows, false))}>
                إعادة المعاينة
              </Button>
            )}
            {result && (
              <>
                <p role="status">
                  {result.committed ? `أُضيفت: ${added}` : `مدارس جديدة: ${fresh}`} · مكررة أو
                  موجودة: {duplicates} · تحتاج تصحيحًا: {invalid}
                </p>
                <div className="max-h-72 space-y-2 overflow-y-auto sm:hidden">
                  {result.rows.map((r, i) => (
                    <article key={i} className="space-y-1 rounded-lg border p-3 text-sm">
                      <p className="font-bold">{rows[i].name || "اسم المدرسة ناقص"}</p>
                      <p>
                        الصف {r.source_row} · {intakeStatusLabels[r.status]}
                      </p>
                      <p>
                        {rows[i].governorate || "المحافظة ناقصة"} —{" "}
                        {rows[i].district || "المديرية ناقصة"}
                      </p>
                      {rows[i].locality && <p>{rows[i].locality}</p>}
                      {Object.values(r.errors).map((message, j) => (
                        <p key={j} className="text-destructive">
                          {message}
                        </p>
                      ))}
                    </article>
                  ))}
                </div>
                <div className="hidden max-h-72 overflow-auto rounded-lg border sm:block">
                  <table className="w-full min-w-[600px] text-right text-sm">
                    <thead>
                      <tr>
                        {[
                          "الصف",
                          "المحافظة",
                          "المديرية",
                          "المدرسة",
                          "الحي أو القرية",
                          "الحالة / السبب",
                        ].map((h) => (
                          <th className="p-2" key={h}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2">{r.source_row}</td>
                          <td className="p-2">{rows[i].governorate}</td>
                          <td className="p-2">{rows[i].district}</td>
                          <td className="p-2">{rows[i].name}</td>
                          <td className="p-2">{rows[i].locality || "—"}</td>
                          <td className="p-2">
                            {intakeStatusLabels[r.status]}
                            {Object.values(r.errors).map((m, j) => (
                              <p key={j} className="text-destructive">
                                {m}
                              </p>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {invalid > 0 && (
                  <p className="text-sm">
                    {result.committed
                      ? `اكتمل الاستيراد، وبقي ${invalid} صفوف تحتاج تصحيحًا. نزّل النتيجة لمعرفة الأسباب، ثم صحّح الصفوف وأعد استيرادها. المدارس المضافة محفوظة ولن تتكرر.`
                      : "صحّح الصفوف في Excel وأعد رفع الملف، أو استورد المدارس الجديدة الصالحة فقط. إعادة استيراد المدارس الموجودة لا تكررها."}
                  </p>
                )}
                {!result.committed && fresh > 0 && (
                  <>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        disabled={busy}
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      راجعت المعاينة وأوافق على إضافة {fresh} مدرسة جديدة صالحة وتجاوز بقية الصفوف.
                    </label>
                    <Button
                      disabled={busy || !confirmed}
                      onClick={() => void action(() => run(rows, true))}
                    >
                      تأكيد استيراد المدارس
                    </Button>
                  </>
                )}
                {result.committed && (
                  <p className="text-sm">هذه النتيجة النهائية؛ أُعيد فحص التكرار أثناء الحفظ.</p>
                )}
              </>
            )}
          </div>
        )}
        {mode === "excel" && result && (
          <div className="flex shrink-0 flex-col gap-2 border-t pt-3 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  const { downloadSchoolResults } = await import("@/lib/schools/intake-xlsx");
                  await downloadSchoolResults(rows, result.rows);
                })
              }
            >
              تنزيل نتيجة الفحص
            </Button>
            {result.committed && (
              <Button disabled={busy} onClick={onClose}>
                إنهاء والعودة للمدارس
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
