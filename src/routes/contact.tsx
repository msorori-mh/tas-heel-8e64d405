import { useAuth } from "@/hooks/use-auth";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "تواصل معنا — تمكين" },
      {
        name: "description",
        content:
          "تواصل مع فريق تمكين عبر البريد أو نموذج التواصل للحصول على الدعم والإجابة على استفساراتك.",
      },
      { property: "og:title", content: "تواصل معنا — تمكين" },
      {
        property: "og:description",
        content:
          "تواصل مع فريق تمكين عبر البريد أو نموذج التواصل للحصول على الدعم والإجابة على استفساراتك.",
      },
      { property: "og:url", content: "https://studentamkeen.com/contact" },
    ],
    links: [{ rel: "canonical", href: "https://studentamkeen.com/contact" }],
  }),
  component: ContactPage,
});

function ContactPage() {
  const { user, profile } = useAuth();
  const [enteredName, setName] = useState<string | null>(null);
  const [enteredEmail, setEmail] = useState<string | null>(null);
  const name = enteredName ?? profile?.full_name ?? "";
  const email = enteredEmail ?? user?.email ?? "";
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErr("يرجى كتابة الاسم.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setErr("يرجى كتابة بريد إلكتروني صحيح.");
      return;
    }
    if (message.trim().length < 10) {
      setErr("يرجى كتابة رسالة من 10 أحرف على الأقل.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.from("contact_submissions").insert({
        full_name: name.trim(),
        email: email.trim(),
        subject: "رسالة من نموذج التواصل",
        message: message.trim(),
      });
      if (error) throw error;
      setDone(true);
    } catch {
      setErr("تعذّر إرسال الرسالة. تحقق من الاتصال وحاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Link to="/" className="text-sm text-muted-foreground">
          → الرئيسية
        </Link>
        <h1 className="mt-3 text-3xl font-bold">تواصل معنا</h1>
        <p className="mt-2 text-muted-foreground">
          راسلنا مباشرة على{" "}
          <a href="mailto:support@studentamkeen.com" className="text-primary">
            support@studentamkeen.com
          </a>{" "}
          أو استخدم النموذج التالي:
        </p>

        <section id="faq" className="mt-6 space-y-3 rounded-2xl border bg-card p-5">
          <h2 className="font-bold">الأسئلة الشائعة</h2>
          <details>
            <summary className="min-h-11 cursor-pointer font-semibold">
              كيف أستخدم المحتوى دون إنترنت؟
            </summary>
            <p className="text-sm leading-relaxed">
              نزّل محتوى المادة من التطبيق، وانتظر اكتمال التنزيل، ثم افتح الدروس المحفوظة. تتطلب
              الاختبارات الوزارية اتصالًا بالإنترنت.
            </p>
          </details>
          <details>
            <summary className="min-h-11 cursor-pointer font-semibold">
              لماذا لا تظهر درجة في المراجعة الذاتية؟
            </summary>
            <p className="text-sm leading-relaxed">
              قارن إجابتك النصية بالإجابة النموذجية. لا تمنح المراجعة الذاتية درجة آلية ولا تدخل في
              متوسط النتائج المصححة.
            </p>
          </details>
          <details>
            <summary className="min-h-11 cursor-pointer font-semibold">
              كيف أعدّل بياناتي الدراسية؟
            </summary>
            <p className="text-sm leading-relaxed">
              افتح «حسابي» ثم تعديل الملف الشخصي، واختر البيانات المناسبة لك.
            </p>
          </details>
        </section>
        <div className="mt-6 rounded-2xl border bg-card p-6 shadow-card">
          {done ? (
            <p className="text-primary">شكراً لتواصلك. سنرد عليك قريباً.</p>
          ) : (
            <form noValidate onSubmit={submit} className="space-y-3">
              <div>
                <Label htmlFor="n">الاسم</Label>
                <Input id="n" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="e">البريد الإلكتروني</Label>
                <Input
                  id="e"
                  type="email"
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <Label htmlFor="m">الرسالة</Label>
                <textarea
                  id="m"
                  className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-32"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  minLength={10}
                />
              </div>
              {err && (
                <p role="alert" className="text-sm text-destructive">
                  {err}
                </p>
              )}
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "..." : "إرسال"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
