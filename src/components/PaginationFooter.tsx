import { Pagination, Spinner } from '@primer/react';
import { OVERRIDES_PER_PAGE } from '../hooks/useBudgets';

interface Props {
  page: number;
  pageCount: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
}

export function PaginationFooter({
  page,
  pageCount,
  total,
  loading,
  onPageChange,
}: Props) {
  const start = total === 0 ? 0 : (page - 1) * OVERRIDES_PER_PAGE + 1;
  const end = Math.min(total, page * OVERRIDES_PER_PAGE);

  return (
    <div className="pagination-bar">
      <span className="muted row">
        {loading && <Spinner size="small" />}
        Showing {start}–{end} of {total}
      </span>
      {pageCount > 1 && (
        <Pagination
          pageCount={pageCount}
          currentPage={page}
          showPages
          onPageChange={(e, n) => {
            e.preventDefault();
            onPageChange(n);
          }}
        />
      )}
    </div>
  );
}
