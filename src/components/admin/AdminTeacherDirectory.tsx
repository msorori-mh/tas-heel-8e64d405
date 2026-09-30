import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  RefreshCw,
  Download,
  Search,
  GraduationCap,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  adminTeachersApi,
  emptyTeacherFilters,
  teacherCsv,
  type TeacherFilters,
  type TeacherRow,
} from "@/lib/admin-teachers";

const count = (n: number) => n.toLocaleString("ar-YE-u-nu-latn");
const date = (s: string | null) =>
  s
    ? new Date(s).toLocaleString("ar-YE-u-nu-latn", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Asia/Riyadh",
      })
    : "—";
const selectClass = "h-11 min-w-0 w-full rounded-lg border border-input bg-background px-3 text-sm";
const programStatus = { ACTIVE: "قيد التعلم", COMPLETED: "مكتمل", CANCELLED: "ملغى" };
function Status({ value }: { value: TeacherRow["status"] }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${value === "ACTIVE" ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
    >
      {value === "ACTIVE" ? "نشط" : "موقوف"}
    </span>
  );
}

export function AdminTeacherDirectory() {
  const [draft, setDraft] = useState<TeacherFilters>(emptyTeacherFilters);
  const [filters, setFilters] = useState<TeacherFilters>(emptyTeacherFilters);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["admin-teacher-directory", filters, page],
    queryFn: () => adminTeachersApi.list(filters, page),
    staleTime: 30_000,
  });
  const data = query.data;
  const apply = (e: FormEvent) => {
    e.preventDefault();
    setFilters({ ...draft });
    setPage(0);
  };
  const reset = () => {
    setDraft(emptyTeacherFilters);
    setFilters(emptyTeacherFilters);
    setPage(0);
  };
  const field = (key: keyof TeacherFilters, value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));
  const exportPage = () => {
    if (!data) return;
    const url = URL.createObjectURL(
      new Blob([teacherCsv(data.rows)], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `tamkeen-teachers-page-${page + 1}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const s = data?.summary;
  return (
    <section className="space-y-5" dir="rtl" aria-label="دليل المعلمين وإحصاءاتهم">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Users className="h-6 w-6 text-primary" /> المعلمون وإحصاءاتهم
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            بيانات المعلمين ومسارهم التدريبي في مكان واحد.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="min-h-11 gap-2"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} /> تحديث
          </Button>
          <Button
            variant="outline"
            className="min-h-11 gap-2"
            onClick={exportPage}
            disabled={!data?.rows.length || query.isFetching || query.isError}
          >
            <Download className="h-4 w-4" /> تصدير الصفحة
          </Button>
        </div>
      </div>
      <form onSubmit={apply} className="rounded-2xl border bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="min-w-0 space-y-1 text-sm">
            <span>البحث</span>
            <Input
              className="min-h-11"
              type="search"
              value={draft.query}
              maxLength={160}
              onChange={(e) => field("query", e.target.value)}
              placeholder="الاسم أو البريد أو الهاتف أو المدرسة"
            />
          </label>
          <label className="min-w-0 space-y-1 text-sm">
            <span>المحافظة</span>
            <select
              aria-label="المحافظة"
              className={selectClass}
              value={draft.governorateId}
              onChange={(e) => field("governorateId", e.target.value)}
            >
              <option value="">جميع المحافظات</option>
              {data?.governorates.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({count(g.count)})
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-1 text-sm">
            <span>المادة</span>
            <select
              aria-label="المادة"
              className={selectClass}
              value={draft.subjectId}
              onChange={(e) => field("subjectId", e.target.value)}
            >
              <option value="">جميع المواد</option>
              {data?.subjects.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({count(g.count)})
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-0 space-y-1 text-sm">
            <span>حالة الحساب</span>
            <select
              aria-label="حالة الحساب"
              className={selectClass}
              value={draft.status}
              onChange={(e) => field("status", e.target.value)}
            >
              <option value="">جميع الحالات</option>
              <option value="ACTIVE">نشط</option>
              <option value="SUSPENDED">موقوف</option>
            </select>
          </label>
          <label className="min-w-0 space-y-1 text-sm">
            <span>المسار التدريبي</span>
            <select
              aria-label="المسار التدريبي"
              className={selectClass}
              value={draft.activity}
              onChange={(e) => field("activity", e.target.value)}
            >
              <option value="">جميع المعلمين</option>
              <option value="UNENROLLED">لم يلتحق ببرنامج</option>
              <option value="LEARNING">لديه برنامج قيد التعلم</option>
              <option value="COMPLETED">أكمل برنامجاً</option>
              <option value="CERTIFIED">لديه شهادة سارية</option>
            </select>
          </label>
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <Button className="min-h-11 gap-2" type="submit">
              <Search className="h-4 w-4" /> تطبيق الفلاتر
            </Button>
            <Button className="min-h-11" variant="ghost" type="button" onClick={reset}>
              مسح الفلاتر
            </Button>
          </div>
        </div>
      </form>
      {query.isError ? (
        <div role="alert" className="rounded-xl border border-destructive/30 p-4 text-destructive">
          تعذر تحميل بيانات المعلمين.{" "}
          <button className="min-h-11 underline" onClick={() => query.refetch()}>
            إعادة المحاولة
          </button>
        </div>
      ) : query.isPending ? (
        <p role="status" className="py-12 text-center text-muted-foreground">
          جارٍ تحميل بيانات المعلمين…
        </p>
      ) : s && data ? (
        <>
          <div>
            <p className="mb-3 text-xs text-muted-foreground">
              الإحصاءات تخص جميع نتائج الفلاتر الحالية، وليست الصفحة الظاهرة فقط.
            </p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              {[
                {
                  label: "المعلمون",
                  value: s.teachers,
                  hint: `${count(s.active)} نشط · ${count(s.suspended)} موقوف`,
                  Icon: Users,
                },
                {
                  label: "التسجيلات في البرامج",
                  value: s.enrollments,
                  hint: `${count(s.unenrolled)} معلم لم يلتحق بعد`,
                  Icon: BookOpen,
                },
                {
                  label: "برامج مكتملة",
                  value: s.completed_programs,
                  hint: `${count(s.active_programs)} قيد التعلم · ${count(s.cancelled_programs)} ملغى`,
                  Icon: CheckCircle2,
                },
                {
                  label: "دروس مكتملة",
                  value: s.completed_lessons,
                  hint: "إجمالي إكمالات الدروس",
                  Icon: BookOpen,
                },
                {
                  label: "محاولات التقييم",
                  value: s.attempts,
                  hint: `${count(s.passed_attempts)} محاولة ناجحة`,
                  Icon: ClipboardCheck,
                },
                {
                  label: "شهادات سارية",
                  value: s.valid_certificates,
                  hint: `${count(s.revoked_certificates)} شهادة ملغاة`,
                  Icon: GraduationCap,
                },
              ].map(({ label, value, hint, Icon }) => (
                <article key={label} className="min-w-0 rounded-xl border bg-card p-4">
                  <Icon className="mb-3 h-5 w-5 text-primary" />
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="my-1 text-3xl font-bold">{count(value)}</p>
                  <p className="text-xs leading-5 text-muted-foreground">{hint}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold">المعلمون ({count(data.total)})</h2>
            <p className="text-xs text-muted-foreground">الأوقات بتوقيت اليمن والسعودية (UTC+3)</p>
          </div>
          {data.rows.length === 0 ? (
            <p
              role="status"
              className="rounded-xl border border-dashed p-8 text-center text-muted-foreground"
            >
              لا يوجد معلمون مطابقون للفلاتر الحالية.
            </p>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2">
              {data.rows.map((t) => (
                <article key={t.user_id} className="min-w-0 rounded-2xl border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="min-w-0 break-words font-bold">{t.full_name}</h3>
                    <Status value={t.status} />
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t.subject_name} · {t.governorate_name}
                  </p>
                  <p className="mt-1 break-words text-sm">{t.school_name}</p>
                  <p className="mt-2 break-all text-sm" dir="ltr">
                    {t.email || t.phone}
                  </p>
                  <div className="my-4 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-lg bg-muted px-2 py-1.5">
                      {count(t.enrollment_count)} تسجيل
                    </span>
                    <span className="rounded-lg bg-muted px-2 py-1.5">
                      {count(t.completed_programs)} مكتمل
                    </span>
                    <span className="rounded-lg bg-muted px-2 py-1.5">
                      {count(t.valid_certificates)} شهادة سارية
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    آخر نشاط تعلم:{" "}
                    {t.last_learning_at ? date(t.last_learning_at) : "لا يوجد نشاط تعلم مسجل"}
                  </p>
                  <Button
                    className="mt-3 min-h-11 w-full"
                    variant="outline"
                    onClick={() => setSelected(t.user_id)}
                    aria-label={`عرض ملف ${t.full_name}`}
                  >
                    عرض الملف والتقدم
                  </Button>
                </article>
              ))}
            </div>
          )}
          <nav className="flex items-center justify-between gap-2" aria-label="صفحات المعلمين">
            <Button
              className="min-h-11"
              variant="outline"
              onClick={() => setPage((p) => p - 1)}
              disabled={page === 0 || query.isFetching}
            >
              السابق
            </Button>
            <p className="text-sm">
              {count(page + 1)} / {count(Math.max(1, Math.ceil(data.total / 20)))}
            </p>
            <Button
              className="min-h-11"
              variant="outline"
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * 20 >= data.total || query.isFetching}
            >
              التالي
            </Button>
          </nav>
        </>
      ) : null}
      <Dialog
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl [&>button]:hidden"
          dir="rtl"
        >
          <DialogHeader className="text-right sm:text-right">
            <div className="flex items-start justify-between gap-3">
              <DialogTitle className="pt-3">ملف المعلم وتقدمه</DialogTitle>
              <Button
                variant="ghost"
                className="min-h-11 shrink-0"
                onClick={() => setSelected(null)}
              >
                إغلاق الملف
              </Button>
            </div>
            <DialogDescription>
              البيانات المهنية، والبرامج، ومحاولات التقييم، والشهادات.
            </DialogDescription>
          </DialogHeader>
          {selected && <TeacherDetails key={selected} userId={selected} />}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function TeacherDetails({ userId }: { userId: string }) {
  const query = useQuery({
    queryKey: ["admin-teacher-detail", userId],
    queryFn: () => adminTeachersApi.detail(userId),
    staleTime: 30_000,
  });
  if (query.isPending) return <p role="status">جارٍ تحميل ملف المعلم…</p>;
  if (query.isError)
    return (
      <p role="alert">
        تعذر تحميل الملف.{" "}
        <button className="min-h-11 underline" onClick={() => query.refetch()}>
          إعادة المحاولة
        </button>
      </p>
    );
  const { teacher: t, programs } = query.data;
  return (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap justify-between gap-2">
        <h2 className="break-words text-lg font-bold">{t.full_name}</h2>
        <Status value={t.status} />
      </div>
      <dl className="grid gap-3 rounded-xl bg-muted/40 p-4 sm:grid-cols-2">
        {[
          ["البريد الإلكتروني", t.email],
          ["الهاتف", t.phone],
          ["المادة", t.subject_name],
          ["المحافظة", t.governorate_name],
          ["المدرسة", t.school_name],
          ["المديرية والمنطقة", [t.school_district, t.school_locality].filter(Boolean).join(" · ")],
          ["ربط دليل المدارس", t.school_id ? "مرتبطة بالدليل" : "اسم مدخل يدوياً"],
          ["تاريخ الانضمام", date(t.created_at)],
          ["آخر تحديث للملف", date(t.updated_at)],
          ["آخر دخول للحساب", date(t.last_sign_in_at)],
          ["آخر نشاط تعلم", t.last_learning_at ? date(t.last_learning_at) : "لم يسجل نشاط تعلم"],
          [
            "أعلى نسبة تقييم",
            t.best_score_percent === null ? "لم يُقيّم بعد" : `${count(t.best_score_percent)}%`,
          ],
        ].map(([label, value]) => (
          <div className="min-w-0" key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words text-sm [overflow-wrap:anywhere]">{value || "—"}</dd>
          </div>
        ))}
      </dl>
      <p className="text-xs text-muted-foreground">
        آخر دخول يخص الحساب في المنصة. آخر نشاط تعلم يخص إكمال درس أو تسليم تقييم، ولا يثبت حضور
        محاضرة.
      </p>
      <h3 className="font-bold">البرامج والتقييمات والشهادات ({count(programs.length)})</h3>
      {programs.length === 0 ? (
        <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">
          لم يلتحق هذا المعلم بأي برنامج بعد.
        </p>
      ) : (
        programs.map((p) => (
          <article key={p.enrollment_id} className="min-w-0 space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <h4 className="break-words font-semibold">{p.title}</h4>
              <span className="text-xs text-muted-foreground">
                {programStatus[p.status]} · الإصدار {count(p.version_number)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              التحق في {date(p.enrolled_at)}
              {p.completed_at ? ` · أكمل في ${date(p.completed_at)}` : ""}
            </p>
            <div>
              <p className="mb-1 text-sm">
                {count(p.completed_lessons)} / {count(p.total_lessons)} درس مكتمل
              </p>
              <progress
                className="h-2 w-full accent-primary"
                max={Math.max(1, p.total_lessons)}
                value={p.completed_lessons}
                aria-label={`تقدم ${p.title}`}
              />
            </div>
            {p.certificate ? (
              <div className="rounded-lg bg-muted/50 p-3 text-sm">
                <p>{p.certificate.revoked_at ? "شهادة ملغاة" : "شهادة سارية"}</p>
                <p className="mt-1 break-all font-mono text-xs" dir="ltr">
                  {p.certificate.code}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  صدرت في {date(p.certificate.issued_at)}
                </p>
                {p.certificate.revoked_at && (
                  <p className="mt-1 text-xs">
                    أُلغيت في {date(p.certificate.revoked_at)} · {p.certificate.revocation_reason}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">لم تصدر شهادة لهذا البرنامج.</p>
            )}
            <details>
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
                محاولات التقييم ({count(p.attempts.length)})
              </summary>
              {p.attempts.length === 0 ? (
                <p className="text-sm text-muted-foreground">لا توجد محاولات تقييم.</p>
              ) : (
                <ul className="space-y-2">
                  {p.attempts.map((a) => (
                    <li
                      className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted/40 p-3 text-sm"
                      key={a.attempt_id}
                    >
                      <span>
                        المحاولة {count(a.attempt_number)} · {a.passed ? "اجتاز" : "لم يجتز"}
                      </span>
                      <span>
                        {count(a.score)} / {count(a.total)} (
                        {count(Math.round((a.score * 100) / a.total))}%)
                      </span>
                      <time
                        className="w-full text-xs text-muted-foreground"
                        dateTime={a.completed_at}
                      >
                        {date(a.completed_at)}
                      </time>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </article>
        ))
      )}
    </div>
  );
}
