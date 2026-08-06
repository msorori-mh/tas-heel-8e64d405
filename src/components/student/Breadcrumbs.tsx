import { Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { Fragment } from "react";

export type Crumb = {
  label: string;
  to?: string;
  params?: Record<string, string>;
  search?: Record<string, unknown>;
};

/** Shared RTL breadcrumb trail for the student journey pages. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="مسار التنقل" className="min-w-0">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-xs text-muted-foreground">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          return (
            <Fragment key={`${item.label}-${i}`}>
              <li className="min-w-0">
                {item.to && !isLast ? (
                  <Link
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    to={item.to as any}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    params={item.params as any}
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    search={item.search as any}
                    className="rounded transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    className="block max-w-[16rem] truncate font-medium text-foreground"
                    aria-current={isLast ? "page" : undefined}
                  >
                    {item.label}
                  </span>
                )}
              </li>
              {!isLast && (
                <li aria-hidden className="text-muted-foreground/60">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
