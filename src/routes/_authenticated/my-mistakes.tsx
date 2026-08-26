import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertCircle, NotebookPen } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import { Button } from "@/components/ui/button";
import { ChipButton } from "@/components/common/ChipButton";
import { EmptyState } from "@/components/common/EmptyState";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { MistakeCard } from "@/components/mistakes/MistakeCard";
import {
  listMyMistakes,
  MistakesUnavailableError,
  type MistakeScope,
  type MistakeSort,
  type MistakeStatusFilter,
} from "@/lib/mistakes/my-mistakes-api";

export const Route = createFileRoute("/_authenticated/my-mistakes")({
  head: () => ({
    meta: [
      { title: "دفتر أخطائي — تمكين" },
      {
        name: "description",
        content: "راجع الأسئلة التي أخطأت فيها أو تركتها فارغة، مرتبة حسب المادة والدرس والتكرار.",
      },
      { property: "og:title", content: "دفتر أخطائي — تمكين" },
      {
        property: "og:description",
        content: "راجع الأسئلة التي أخطأت فيها أو تركتها فارغة، مرتبة حسب المادة والدرس والتكرار.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MyMistakesPage,
});

const PAGE_SIZE = 20;

const STATUS_TABS: { key: MistakeStatusFilter; label: string }[] = [
  { key: "ALL", label: "الكل" },
  { key: "WRONG", label: "أخطأت فيها" },
  { key: "BLANK", label: "تركتها فارغة" },
  { key: "REPEATED", label: "متكررة" },
  { key: "MASTERED_LATER", label: "أتقنتها لاحقاً" },
];

const SCOPE_TABS: { key: MistakeScope; label: string }[] = [
  { key: "ALL", label: "كل المحاولات" },
  { key: "ORDINARY", label: "اختبارات عادية" },
  { key: "MINISTERIAL", label: "نماذج وزارية" },
];

function MyMistakesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<MistakeStatusFilter>("ALL");
  const [scope, setScope] = useState<MistakeScope>("ALL");
  const [subjectId, setSubjectId] = useState<string | null>(null);
  const [sort, setSort] = useState<MistakeSort>("recent");
  const [page, setPage] = useState(0);

  const query = useQuery({
    enabled: !!user?.id,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
    queryKey: ["my-mistakes", user?.id ?? null, status, scope, subjectId, sort, page],
    queryFn: () =>
      listMyMistakes({
        status,
        scope,
        subjectId,
        sort,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
  });

  const data = query.data;
  const items = data?.items ?? [];

  const reset = (fn: () => void) => {
    fn();
    setPage(0);
  };

  const header = (
    <>
      <Breadcrumbs items={[{ label: "الرئيسية", to: "/app" }, { label: "دفتر أخطائي" }]} />
      <header className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <NotebookPen className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-headline text-foreground">دفتر أخطائي</h1>
          <p className="text-xs text-muted-foreground">
            كل سؤال أخطأت فيه أو تركته فارغاً — من محاولاتك السابقة، بلا كشف للإجابة الصحيحة.
          </p>
        </div>
      </header>
    </>
  );

  if (loading || (query.isLoading && !data)) {
    return (
      <div className="space-y-5" dir="rtl">
        {header}
        <ListSkeleton rows={4} />
      </div>
    );
  }

  if (query.error) {
    const unavailable = query.error instanceof MistakesUnavailableError;
    return (
      <div className="space-y-5" dir="rtl">
        {header}
        <EmptyState
          icon={AlertCircle}
          title={unavailable ? "دفتر الأخطاء غير مفعّل بعد" : "تعذّر تحميل دفتر الأخطاء"}
          description={
            unavailable
              ? "سيظهر الدفتر فور تفعيل التحديث على الخادم."
              : "تحقق من اتصالك ثم أعد المحاولة."
          }
          actionLabel="إعادة المحاولة"
          onAction={() => query.refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4" dir="rtl">
      {header}

      <div
        role="tablist"
        aria-label="تصفية حسب الحالة"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {STATUS_TABS.map((t) => (
          <ChipButton
            key={t.key}
            active={status === t.key}
            label={t.label}
            count={t.key === status ? (data?.total ?? 0) : 0}
            onClick={() => reset(() => setStatus(t.key))}
          />
        ))}
      </div>

      <div
        role="tablist"
        aria-label="تصفية حسب نوع المحاولة"
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
      >
        {SCOPE_TABS.map((t) => (
          <ChipButton
            key={t.key}
            active={scope === t.key}
            label={t.label}
            count={0}
            onClick={() => reset(() => setScope(t.key))}
          />
        ))}
      </div>

      {(data?.subjects.length ?? 0) > 0 && (
        <div
          role="tablist"
          aria-label="تصفية حسب المادة"
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        >
          <ChipButton
            active={subjectId === null}
            label="كل المواد"
            count={data?.subjects.reduce((s, x) => s + x.count, 0) ?? 0}
            onClick={() => reset(() => setSubjectId(null))}
          />
          {(data?.subjects ?? []).map((s) => (
            <ChipButton
              key={s.subject_id}
              active={subjectId === s.subject_id}
              label={s.subject_name ?? "مادة"}
              count={s.count}
              onClick={() => reset(() => setSubjectId(s.subject_id))}
            />
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="tabular-nums">{data?.total ?? 0} سؤال</span>
        <div className="flex gap-2">
          <ChipButton
            active={sort === "recent"}
            label="الأحدث"
            count={0}
            onClick={() => reset(() => setSort("recent"))}
          />
          <ChipButton
            active={sort === "most_repeated"}
            label="الأكثر تكراراً"
            count={0}
            onClick={() => reset(() => setSort("most_repeated"))}
          />
        </div>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="لا توجد أخطاء في هذا التصنيف"
          description="ابدأ اختباراً أو نموذجاً وزارياً، وسيسجَّل هنا كل سؤال أخطأت فيه أو تركته فارغاً."
          actionLabel="تصفح المواد"
          onAction={() => navigate({ to: "/semesters" })}
        />
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.question_id}>
                <MistakeCard
                  item={item}
                  onReviewLesson={(lessonId) =>
                    navigate({ to: "/lessons/$lessonId", params: { lessonId } })
                  }
                  onReviewAttempt={(path) => navigate({ to: path })}
                />
              </li>
            ))}
          </ul>

          {(page > 0 || (data?.has_more ?? false)) && (
            <nav className="flex items-center justify-between gap-2" aria-label="تنقل الصفحات">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                السابق
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">صفحة {page + 1}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={!(data?.has_more ?? false)}
                onClick={() => setPage((p) => p + 1)}
              >
                التالي
              </Button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
