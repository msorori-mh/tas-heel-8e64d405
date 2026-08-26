import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, Sparkles, AlertCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Breadcrumbs } from "@/components/student/Breadcrumbs";
import { Progress } from "@/components/ui/progress";
import { ChipButton } from "@/components/common/ChipButton";
import { EmptyState } from "@/components/common/EmptyState";
import { ListSkeleton } from "@/components/common/ListSkeleton";
import { ReviewCard } from "@/components/review/ReviewCard";
import { FocusReader, type FocusReaderItem } from "@/components/review/FocusReader";
import { fetchReviewItems, fetchReviewSubjects } from "@/lib/review/review-data";
import { buildReviewIndex, filterReviewItems } from "@/lib/review/review-types";
import { reviewPercent } from "@/lib/review/review-format";

export const Route = createFileRoute("/_authenticated/quick-review")({
  head: () => ({
    meta: [
      { title: "المراجعة السريعة — تمكين" },
      {
        name: "description",
        content: "راجع ملخصات دروسك بسرعة في وضع البطاقات مع تتبع ما أنجزته.",
      },
      { property: "og:title", content: "المراجعة السريعة — تمكين" },
      {
        property: "og:description",
        content: "راجع ملخصات دروسك بسرعة في وضع البطاقات مع تتبع ما أنجزته.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QuickReviewPage,
});

function QuickReviewPage() {
  const { profile, user, loading } = useAuth();
  const navigate = useNavigate();
  const [subjectFilter, setSubjectFilter] = useState<string | null>(null);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  const gradeKey = profile?.grade_uuid ?? (profile?.grade_id ? String(profile.grade_id) : null);

  const query = useQuery({
    enabled: !!gradeKey && !!user?.id,
    staleTime: 2 * 60 * 1000,
    // Scope id in the key so caches never bleed across track/grade/user.
    queryKey: ["quick-review", user?.id ?? null, gradeKey, profile?.curriculum_track_id ?? null],
    queryFn: async () => {
      const subjects = await fetchReviewSubjects(gradeKey!);
      const items = await fetchReviewItems({ subjects, userId: user!.id });
      return buildReviewIndex(items, subjects);
    },
  });

  const index = query.data;
  const filtered = useMemo(
    () => filterReviewItems(index?.items ?? [], subjectFilter),
    [index?.items, subjectFilter],
  );
  const completedInView = filtered.filter((i) => i.isCompleted).length;
  const percent = reviewPercent(completedInView, filtered.length);

  const focusItems: FocusReaderItem[] = useMemo(
    () =>
      filtered.map((i) => ({
        id: i.lessonId,
        title: i.lessonTitle,
        body: i.summary,
        subtitle: i.unitTitle ? `${i.subjectName} · ${i.unitTitle}` : i.subjectName,
        points: i.keyPoints,
        tip: i.studyTip,
        isCompleted: i.isCompleted,
      })),
    [filtered],
  );

  const header = (
    <>
      <Breadcrumbs items={[{ label: "الرئيسية", to: "/app" }, { label: "المراجعة السريعة" }]} />
      <header className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <h1 className="text-headline text-foreground">المراجعة السريعة</h1>
          <p className="text-xs text-muted-foreground">
            ملخصات دروسك في بطاقات سريعة — بلا إنترنت ثقيل وبلا اختبارات.
          </p>
        </div>
      </header>
    </>
  );

  if (loading || query.isLoading) {
    return (
      <div className="space-y-5" dir="rtl">
        {header}
        <ListSkeleton rows={4} />
      </div>
    );
  }

  if (query.error) {
    return (
      <div className="space-y-5" dir="rtl">
        {header}
        <EmptyState
          icon={AlertCircle}
          title="تعذّر تحميل الملخصات"
          description="تحقق من اتصالك ثم أعد المحاولة."
          actionLabel="إعادة المحاولة"
          onAction={() => query.refetch()}
        />
      </div>
    );
  }

  if (!gradeKey) {
    return (
      <div className="space-y-5" dir="rtl">
        {header}
        <EmptyState
          icon={BookOpen}
          title="أكمل بيانات ملفك أولاً"
          description="نحتاج صفّك ومنهجك الدراسي لعرض ملخصات مناسبة لك."
          actionLabel="فتح الإعدادات"
          onAction={() => navigate({ to: "/settings" })}
        />
      </div>
    );
  }

  const groups = index?.groups ?? [];

  return (
    <div className="space-y-5 pb-4" dir="rtl">
      {header}

      {(index?.total ?? 0) === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="لا توجد ملخصات متاحة بعد"
          description="ستظهر هنا ملخصات الدروس فور إضافتها لمنهجك."
          actionLabel="تصفح المواد"
          onAction={() => navigate({ to: "/semesters" })}
        />
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-4 shadow-card">
            <div className="mb-1.5 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {subjectFilter ? "تقدمك في المادة المحددة" : "تقدمك في كل الملخصات"}
              </span>
              <span className="font-bold tabular-nums text-foreground">
                {completedInView} / {filtered.length}
              </span>
            </div>
            <Progress value={percent} className="h-2.5" />
          </section>

          <div
            role="tablist"
            aria-label="تصفية حسب المادة"
            className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          >
            <ChipButton
              active={subjectFilter === null}
              label="الكل"
              count={index?.total ?? 0}
              onClick={() => {
                setSubjectFilter(null);
                setFocusIndex(null);
              }}
            />
            {groups.map((g) => (
              <ChipButton
                key={g.id}
                active={subjectFilter === g.id}
                label={g.name}
                count={g.count}
                onClick={() => {
                  setSubjectFilter(g.id);
                  setFocusIndex(null);
                }}
              />
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="لا توجد ملخصات في هذه المادة"
              description="جرّب مادة أخرى أو اعرض الكل."
              actionLabel="عرض الكل"
              onAction={() => setSubjectFilter(null)}
            />
          ) : (
            <ul className="space-y-3">
              {filtered.map((item, i) => (
                <li key={item.lessonId}>
                  <ReviewCard item={item} index={i} onFocus={() => setFocusIndex(i)} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <FocusReader
        open={focusIndex !== null}
        startIndex={focusIndex ?? 0}
        items={focusItems}
        onClose={() => setFocusIndex(null)}
        onOpenItem={(item) => navigate({ to: "/lessons/$lessonId", params: { lessonId: item.id } })}
      />
    </div>
  );
}
