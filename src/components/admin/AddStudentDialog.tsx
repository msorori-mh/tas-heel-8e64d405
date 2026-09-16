import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { adminCreateStudent } from "@/lib/admin-students.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export function AddStudentDialog() {
  const create = useServerFn(adminCreateStudent);
  const queries = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await create({ data: { full_name: name, email } });
      setOpen(false);
      setName("");
      setEmail("");
      toast.success("تمت إضافة الطالب. يدخل بحساب Google بنفس البريد ويكمل بياناته الدراسية.");
      void queries.invalidateQueries({ queryKey: ["admin-students"] });
      void queries.invalidateQueries({ queryKey: ["admin-student-filter-options"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذر إضافة الطالب.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        إضافة طالب
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!saving.current) setOpen(value);
        }}
      >
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>إضافة طالب</DialogTitle>
            <DialogDescription>
              أدخل بريد حساب Google الخاص بالطالب. سيدخل بنفس البريد ويكمل الصف والمحافظة والمدرسة
              عند أول دخول. لا تُرسل رسالة بريدية تلقائيًا.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="student-name">اسم الطالب</Label>
              <Input
                id="student-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={200}
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="student-email">بريد Google للطالب</Label>
              <Input
                id="student-email"
                type="email"
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                maxLength={254}
                disabled={busy}
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? "جارٍ إضافة الطالب…" : "إضافة الطالب"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setOpen(false)}
              >
                إلغاء
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
