import { Link, useRouterState } from "@tanstack/react-router";

const CONTENT_CENTER_TABS = [
  { href: "/admin/curriculum", label: "هيكل المنهج" },
  { href: "/admin/subjects", label: "المواد والمسارات" },
  { href: "/admin/textbooks", label: "كتب المواد" },
  { href: "/admin/units", label: "الوحدات" },
  { href: "/admin/lessons", label: "الدروس" },
  { href: "/admin/import", label: "الاستيراد والنشر" },
] as const;

export const CONTENT_CENTER_PATHS = CONTENT_CENTER_TABS.map((tab) => tab.href);

export function isContentCenterPath(path: string) {
  return CONTENT_CENTER_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}

export function ContentImportCenterNav() {
  const currentPath = useRouterState({ select: (state) => state.location.pathname });

  return (
    <section className="mb-5 space-y-3" dir="rtl" aria-label="مركز استيراد المحتوى">
      <div>
        <h1 className="text-xl font-bold text-foreground">مركز استيراد المحتوى</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          نقطة واحدة لإدارة الهيكل والمواد والكتب والوحدات والدروس، ثم استيراد الملفات وفحصها ونشرها
          ضمن سياق الصف والمسار والفصل والمادة.
        </p>
      </div>
      <nav
        className="flex gap-2 overflow-x-auto rounded-xl border border-border bg-card p-2"
        aria-label="تبويبات استيراد المحتوى"
      >
        {CONTENT_CENTER_TABS.map((tab) => {
          const active = currentPath === tab.href || currentPath.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              to={tab.href}
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </section>
  );
}
