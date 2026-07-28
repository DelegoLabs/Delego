"use client";

import { Button } from "@delego/ui";

export interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

/** Previous/next pager with a "showing X–Y of N" summary. */
export function Pagination({
  page,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
}: PaginationProps) {
  if (totalItems === 0) return null;

  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination-summary">
        Showing {firstItem}–{lastItem} of {totalItems}
      </span>
      <div className="pagination-controls">
        <Button
          variant="secondary"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          ariaLabel="Previous page"
        >
          ← Prev
        </Button>
        <span className="pagination-status" aria-current="page">
          Page {page} of {totalPages}
        </span>
        <Button
          variant="secondary"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          ariaLabel="Next page"
        >
          Next →
        </Button>
      </div>
    </nav>
  );
}
