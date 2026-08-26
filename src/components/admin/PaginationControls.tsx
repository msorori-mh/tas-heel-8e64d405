"use client";

import { ChevronRight, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalCount?: number;
  pageSize?: number;
}

const PaginationControls = ({
  page,
  totalPages,
  onPageChange,
  totalCount,
  pageSize = 20,
}: PaginationControlsProps) => {
  if (totalPages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, totalCount || page * pageSize);

  return (
    <div className="mt-6 flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
      <p className="text-sm text-muted-foreground">
        {totalCount != null ? `${from}–${to} من ${totalCount}` : `صفحة ${page} من ${totalPages}`}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="icon"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        {totalPages <= 7 ? (
          Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Button
              key={p}
              variant={p === page ? "default" : "outline"}
              size="icon"
              onClick={() => onPageChange(p)}
              className="hidden sm:inline-flex"
            >
              {p}
            </Button>
          ))
        ) : (
          <>
            {[1, 2].map((p) => (
              <Button
                key={p}
                variant={p === page ? "default" : "outline"}
                size="icon"
                onClick={() => onPageChange(p)}
                className="hidden sm:inline-flex"
              >
                {p}
              </Button>
            ))}
            {page > 3 && <span className="px-1 text-muted-foreground hidden sm:inline">…</span>}
            {page > 2 && page < totalPages - 1 && (
              <Button variant="default" size="icon" className="hidden sm:inline-flex">
                {page}
              </Button>
            )}
            {page < totalPages - 2 && (
              <span className="px-1 text-muted-foreground hidden sm:inline">…</span>
            )}
            {[totalPages - 1, totalPages].map((p) => (
              <Button
                key={p}
                variant={p === page ? "default" : "outline"}
                size="icon"
                onClick={() => onPageChange(p)}
                className="hidden sm:inline-flex"
              >
                {p}
              </Button>
            ))}
          </>
        )}
        <Button
          variant="outline"
          size="icon"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export default PaginationControls;
