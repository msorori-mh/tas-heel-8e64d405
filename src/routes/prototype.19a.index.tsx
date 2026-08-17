import { createFileRoute, Link } from "@tanstack/react-router";

/**
 * TAMKEEN_FOCUSED_MOMENTUM_V2_PROTOTYPE_19A — prototype index (visual only).
 */
export const Route = createFileRoute("/prototype/19a/")({
  head: () => ({
    meta: [
      { title: "نموذج Focused Momentum V2 | تمكين" },
      {
        name: "description",
        content: "نموذج بصري لثلاث شاشات في تمكين: صفحة التعريف، رئيسية الطالب، صفحة الدرس.",
      },
      { property: "og:title", content: "نموذج Focused Momentum V2 | تمكين" },
      {
        property: "og:description",
        content: "مراجعة بصرية لاتجاه التصميم المعتمد في تمكين.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PrototypeIndex,
});

const SCREENS = [
  { to: "/prototype/19a/landing", label: "صفحة التعريف" },
  { to: "/prototype/19a/home", label: "رئيسية الطالب" },
  { to: "/prototype/19a/lesson", label: "صفحة الدرس" },
] as const;

function PrototypeIndex() {
  return (
    <main className="mx-auto w-full max-w-[560px] px-4 py-8">
      <h1 className="mb-4 text-[20px] font-extrabold">نموذج Focused Momentum V2</h1>
      <ul className="space-y-2">
        {SCREENS.map((s) => (
          <li key={s.to}>
            <Link
              to={s.to}
              className="fm-card fm-press block px-4 py-3 text-[15px] font-semibold text-foreground"
            >
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
