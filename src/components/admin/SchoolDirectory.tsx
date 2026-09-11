import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
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
import { supabase } from "@/integrations/supabase/client";
import { schoolDirectoryApi as api } from "@/lib/schools/student-school-api";
import type { ManagedSchool, SchoolReview } from "@/lib/schools/directory-api";
import type { School } from "@/lib/schools/school-choice";

const location = (school: School) => `${school.district} — ${school.locality}`;
const selectClass =
  "min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm";
function useSearchText(value: string) {
  const [search, setSearch] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSearch(value.trim()), 250);
    return () => clearTimeout(timer);
  }, [value]);
  return search;
}

export function SchoolDirectory() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"pending" | "directory">("pending");
  const [query, setQuery] = useState("");
  const [gov, setGov] = useState("");
  const [page, setPage] = useState(0);
  const [review, setReview] = useState<SchoolReview | null>(null);
  const [merge, setMerge] = useState<ManagedSchool | null>(null);
  const search = useSearchText(query);
  const govs = useQuery({
    queryKey: ["schools-admin", "governorates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("governorates")
        .select("id,name")
        .order("sort_order");
      if (error) throw error;
      return data ?? [];
    },
  });
  const pending = useQuery({
    queryKey: ["schools-admin", "pending", search, gov, page],
    enabled: tab === "pending",
    queryFn: () => api.pending(search, gov, page),
  });
  const directory = useQuery({
    queryKey: ["schools-admin", "directory", search, gov, page],
    enabled: tab === "directory",
    queryFn: () => api.list(search, gov, page),
  });
  const active = tab === "pending" ? pending : directory;
  const changed = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["schools-admin"] }),
      qc.invalidateQueries({ queryKey: ["admin-students"] }),
      qc.invalidateQueries({ queryKey: ["admin-student-filter-options"] }),
    ]);
    setReview(null);
    setMerge(null);
  };
  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h1 className="text-2xl font-bold">دليل المدارس</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          راجع المدرسة وموقعها قبل اعتمادها. كل طلب يخص الملف المعروض فقط.
        </p>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="عرض المدارس">
        <Button
          aria-pressed={tab === "pending"}
          variant={tab === "pending" ? "default" : "outline"}
          onClick={() => {
            setTab("pending");
            setPage(0);
          }}
        >
          بانتظار المراجعة
        </Button>
        <Button
          aria-pressed={tab === "directory"}
          variant={tab === "directory" ? "default" : "outline"}
          onClick={() => {
            setTab("directory");
            setPage(0);
          }}
        >
          المدارس المعتمدة
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="school-admin-search">البحث باسم المدرسة</Label>
          <Input
            id="school-admin-search"
            value={query}
            maxLength={180}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
          />
        </div>
        <div>
          <Label htmlFor="school-admin-gov">المحافظة</Label>
          <select
            id="school-admin-gov"
            className={selectClass}
            value={gov}
            onChange={(e) => {
              setGov(e.target.value);
              setPage(0);
            }}
          >
            <option value="">جميع المحافظات</option>
            {govs.data?.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {govs.isError && <p role="alert">تعذّر تحميل المحافظات.</p>}
        </div>
      </div>
      {active.isLoading ? (
        <p role="status">جارٍ تحميل المدارس…</p>
      ) : active.isError ? (
        <div role="alert">
          تعذّر تحميل القائمة.{" "}
          <Button variant="outline" onClick={() => void active.refetch()}>
            إعادة المحاولة
          </Button>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {active.data?.count ?? 0}{" "}
            {tab === "pending" ? "ملفًا بانتظار المراجعة" : "مدرسة معتمدة"}
          </p>
          {!active.data?.rows.length && (
            <p className="rounded-lg border p-5">لا توجد نتائج في هذه الصفحة.</p>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            {tab === "pending"
              ? pending.data?.rows.map((row) => (
                  <article
                    key={`${row.kind}-${row.user_id}`}
                    className="min-w-0 space-y-2 rounded-xl border bg-card p-4"
                  >
                    <h2 className="break-words font-bold">{row.school_name}</h2>
                    <p className="text-sm">
                      {row.governorate_name ?? "المحافظة غير محددة"} —{" "}
                      {row.school_district ?? "المديرية غير محددة"} —{" "}
                      {row.school_locality ?? "الحي أو القرية غير محدد"}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {row.kind === "student" ? "طالب" : "معلم"}:{" "}
                      {row.full_name || "الاسم غير مكتمل"}
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setReview(row)}
                      disabled={!row.governorate_id}
                    >
                      مراجعة المدرسة
                    </Button>
                    {!row.governorate_id && (
                      <p className="text-xs text-muted-foreground">
                        يجب استكمال المحافظة في ملف صاحب الطلب قبل اعتماد المدرسة.
                      </p>
                    )}
                  </article>
                ))
              : directory.data?.rows.map((school) => (
                  <article
                    key={school.id}
                    className="min-w-0 space-y-2 rounded-xl border bg-card p-4"
                  >
                    <h2 className="break-words font-bold">{school.name}</h2>
                    <p className="text-sm">
                      {school.governorate_name} — {location(school)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {school.student_count} طالبًا · {school.teacher_count} معلمًا
                    </p>
                    <Button variant="outline" onClick={() => setMerge(school)}>
                      مراجعة تكرار ودمج
                    </Button>
                  </article>
                ))}
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" disabled={!page} onClick={() => setPage((p) => p - 1)}>
              السابق
            </Button>
            <span>صفحة {page + 1}</span>
            <Button
              variant="outline"
              disabled={(page + 1) * 25 >= (active.data?.count ?? 0)}
              onClick={() => setPage((p) => p + 1)}
            >
              التالي
            </Button>
          </div>
        </>
      )}
      {review && (
        <ReviewDialog
          key={`${review.kind}-${review.user_id}`}
          row={review}
          onClose={() => setReview(null)}
          onSaved={changed}
        />
      )}
      {merge && (
        <MergeDialog
          key={merge.id}
          source={merge}
          onClose={() => setMerge(null)}
          onSaved={changed}
        />
      )}
    </div>
  );
}

function SchoolTarget({
  governorateId,
  query,
  setQuery,
  targetId,
  setTargetId,
  excludeId,
}: {
  governorateId: string;
  query: string;
  setQuery: (text: string) => void;
  targetId: string;
  setTargetId: (id: string) => void;
  excludeId?: string;
}) {
  const search = useSearchText(query);
  const results = useQuery({
    queryKey: ["schools-admin", "search", governorateId, search],
    queryFn: () => api.search(governorateId, search, ""),
  });
  return (
    <div className="space-y-2">
      <Label htmlFor="school-target-query">البحث في مدارس المحافظة المعتمدة</Label>
      <Input
        id="school-target-query"
        value={query}
        maxLength={180}
        onChange={(e) => {
          setQuery(e.target.value);
          setTargetId("");
        }}
      />
      <Label htmlFor="school-target">المدرسة المعتمدة</Label>
      <select
        id="school-target"
        className={selectClass}
        value={targetId}
        onChange={(e) => setTargetId(e.target.value)}
        required
        disabled={results.isFetching || results.isError}
      >
        <option value="">اختر المدرسة وموقعها</option>
        {results.data
          ?.filter((s) => s.id !== excludeId)
          .map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {location(s)}
            </option>
          ))}
      </select>
      {results.isError ? (
        <p role="alert">
          تعذّر البحث.{" "}
          <button type="button" onClick={() => void results.refetch()}>
            إعادة المحاولة
          </button>
        </p>
      ) : results.isFetching ? (
        <p role="status">جارٍ البحث…</p>
      ) : !results.data?.filter((s) => s.id !== excludeId).length ? (
        <p className="text-sm">لا توجد نتائج. جرّب جزءًا آخر من الاسم.</p>
      ) : null}
      {results.data?.length === 25 && (
        <p className="text-sm">اكتب مزيدًا من الاسم لتضييق النتائج.</p>
      )}
    </div>
  );
}

function ReviewDialog({
  row,
  onClose,
  onSaved,
}: {
  row: SchoolReview;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [mode, setMode] = useState("link");
  const [name, setName] = useState(row.school_name);
  const [district, setDistrict] = useState(row.school_district ?? "");
  const [locality, setLocality] = useState(row.school_locality ?? "");
  const [query, setQuery] = useState(row.school_name);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const details = useQuery({
    queryKey: ["schools-admin", "details", target],
    enabled: !!target,
    queryFn: () => api.details(target),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>مراجعة المدرسة</DialogTitle>
          <DialogDescription>
            {row.full_name} — {row.school_name} — {row.governorate_name}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!confirmed || busy) return;
            setBusy(true);
            try {
              if (mode === "link") {
                if (!details.data || details.isFetching) return;
                await api.review(row, details.data);
              } else
                await api.review(row, {
                  name: name.trim(),
                  governorate_id: row.governorate_id!,
                  district: district.trim(),
                  locality: locality.trim(),
                });
              toast.success("تم اعتماد المدرسة وربط الملف بها.");
              await onSaved();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "تعذّر الاعتماد.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="space-y-4">
            <label className="flex gap-2">
              <input
                type="radio"
                name="school-review-mode"
                checked={mode === "link"}
                onChange={() => {
                  setMode("link");
                  setConfirmed(false);
                }}
              />
              ربط بمدرسة موجودة
            </label>
            <label className="flex gap-2">
              <input
                type="radio"
                name="school-review-mode"
                checked={mode === "new"}
                onChange={() => {
                  setMode("new");
                  setConfirmed(false);
                }}
              />
              اعتماد مدرسة جديدة
            </label>
            {mode === "link" ? (
              <SchoolTarget
                governorateId={row.governorate_id!}
                query={query}
                setQuery={setQuery}
                targetId={target}
                setTargetId={(id) => {
                  setTarget(id);
                  setConfirmed(false);
                }}
              />
            ) : (
              <>
                <div>
                  <Label htmlFor="school-review-name">الاسم المعتمد</Label>
                  <Input
                    id="school-review-name"
                    value={name}
                    minLength={2}
                    maxLength={180}
                    required
                    onChange={(e) => {
                      setName(e.target.value);
                      setConfirmed(false);
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="school-review-district">المديرية</Label>
                  <Input
                    id="school-review-district"
                    value={district}
                    minLength={2}
                    maxLength={120}
                    required
                    onChange={(e) => {
                      setDistrict(e.target.value);
                      setConfirmed(false);
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="school-review-locality">الحي أو القرية</Label>
                  <Input
                    id="school-review-locality"
                    value={locality}
                    minLength={2}
                    maxLength={120}
                    required
                    onChange={(e) => {
                      setLocality(e.target.value);
                      setConfirmed(false);
                    }}
                  />
                </div>
              </>
            )}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              تحققت من اسم المدرسة وموقعها وأن هذا الملف يخصها.
            </label>
            <Button
              type="submit"
              disabled={
                !confirmed ||
                (mode === "link" && (!details.data || details.isFetching || details.isError))
              }
            >
              اعتماد وربط الملف
            </Button>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MergeDialog({
  source,
  onClose,
  onSaved,
}: {
  source: ManagedSchool;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [query, setQuery] = useState(source.name);
  const [target, setTarget] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const details = useQuery({
    queryKey: ["schools-admin", "details", target],
    enabled: !!target,
    queryFn: () => api.details(target),
  });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent dir="rtl" className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>مراجعة دمج مدرسة مكررة</DialogTitle>
          <DialogDescription>
            اختر السجل المعتمد الذي سيبقى في الدليل. ستنتقل إليه ارتباطات الطلاب والمعلمين، ويُحفظ
            السجل السابق في سجل الدمج.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!details.data || !confirmed || busy || details.isFetching) return;
            setBusy(true);
            try {
              const result = await api.merge(source, details.data);
              toast.success(`تم الدمج ونقل ${result.students} طالبًا و${result.teachers} معلمًا.`);
              await onSaved();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "تعذّر الدمج.");
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset disabled={busy} className="space-y-4">
            <div className="rounded-lg border p-3">
              <strong>السجل المكرر: {source.name}</strong>
              <p>
                {source.governorate_name} — {location(source)}
              </p>
              <p>
                {source.student_count} طالبًا · {source.teacher_count} معلمًا
              </p>
            </div>
            <SchoolTarget
              governorateId={source.governorate_id}
              query={query}
              setQuery={setQuery}
              targetId={target}
              setTargetId={(id) => {
                setTarget(id);
                setConfirmed(false);
              }}
              excludeId={source.id}
            />
            {details.data && (
              <div className="rounded-lg border p-3">
                <strong>السجل الذي سيبقى: {details.data.name}</strong>
                <p>
                  {details.data.governorate_name} — {location(details.data)}
                </p>
                <p>
                  {details.data.student_count} طالبًا · {details.data.teacher_count} معلمًا
                </p>
              </div>
            )}
            {details.isError && <p role="alert">تعذّر تحميل تفاصيل المدرسة المختارة.</p>}
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              راجعت الموقع وتأكدت أن السجلين يخصان المدرسة نفسها.
            </label>
            <Button
              type="submit"
              disabled={!confirmed || !details.data || details.isFetching || details.isError}
            >
              دمج ونقل الارتباطات
            </Button>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
