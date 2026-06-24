import { useEffect, useMemo, useState } from 'react';
import {
  Banner,
  Button,
  Spinner,
  TextInput,
  useConfirm,
} from '@primer/react';
import {
  DownloadIcon,
  PeopleIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
  UploadIcon,
  XIcon,
} from '@primer/octicons-react';
import { OVERRIDES_PER_PAGE, useAllOverrides, useDeleteBudget, useUserUsage } from '../hooks/useBudgets';
import { useConnection } from '../context/connection';
import { useToast } from '../context/toast';
import { BudgetClientError } from '../api/client';
import { type Budget } from '../types/budget';
import { buildOverridesCsv, downloadCsv } from '../utils/bulkImport';
import { OverridesTable } from './OverridesTable';
import { OverrideEditDialog } from './OverrideEditDialog';
import { BulkUploadDialog } from './BulkUploadDialog';
import { BulkDeleteDialog } from './BulkDeleteDialog';
import { PaginationFooter } from './PaginationFooter';

function errorMessage(err: unknown): string {
  if (err instanceof BudgetClientError) {
    return `${err.message}${err.status ? ` (HTTP ${err.status})` : ''}`;
  }
  return (err as Error).message;
}

type DialogState =
  | { type: 'none' }
  | { type: 'add' }
  | { type: 'edit'; budget: Budget }
  | { type: 'bulk' }
  | { type: 'delete'; budgets: Budget[]; allMatching: boolean };

export function OverridesPanel() {
  const { client, clientKey } = useConnection();
  const { addToast } = useToast();
  const confirm = useConfirm();
  const deleteBudget = useDeleteBudget();

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selection, setSelection] = useState<{ scope: string; ids: Set<string> }>(
    { scope: '', ids: new Set() },
  );
  const [dialog, setDialog] = useState<DialogState>({ type: 'none' });
  const [downloading, setDownloading] = useState(false);

  // Debounce the search box.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const {
    data: allBudgets = [],
    isLoading,
    isFetching,
    isError,
    error,
  } = useAllOverrides();
  const usage = useUserUsage(search);

  // The Budgets API has no server-side search, so the full override list is
  // fetched once (and cached); filtering, paging and selection all happen here.
  const trimmed = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      trimmed
        ? allBudgets.filter((b) => b.user?.toLowerCase().includes(trimmed))
        : allBudgets,
    [allBudgets, trimmed],
  );
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / OVERRIDES_PER_PAGE));
  const safePage = Math.min(page, pageCount);
  const pageStart = (safePage - 1) * OVERRIDES_PER_PAGE;
  const pageItems = useMemo(
    () => filtered.slice(pageStart, pageStart + OVERRIDES_PER_PAGE),
    [filtered, pageStart],
  );

  // The list endpoint returns no per-row usage; merge in the searched user's
  // consumed amount (the one `effective_budget` the API exposes) when present.
  const displayItems = useMemo(() => {
    const eff = usage.data;
    if (!eff) return pageItems;
    return pageItems.map((b) =>
      b.id === eff.id ? { ...b, consumed_amount: eff.consumed_amount } : b,
    );
  }, [pageItems, usage.data]);

  // Selection persists across pages within the same connection + search.
  const scopeKey = `${clientKey}|${trimmed}`;
  const EMPTY = useMemo(() => new Set<string>(), []);
  const selected = selection.scope === scopeKey ? selection.ids : EMPTY;

  const updateSelected = (updater: (prev: Set<string>) => Set<string>) =>
    setSelection((prev) => {
      const base = prev.scope === scopeKey ? prev.ids : new Set<string>();
      return { scope: scopeKey, ids: updater(base) };
    });

  const pageIds = pageItems.map((b) => b.id);
  const allOnPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPageSelected = pageIds.some((id) => selected.has(id));
  const allMatchingSelected =
    filtered.length > 0 && filtered.every((b) => selected.has(b.id));
  const selectedCount = filtered.reduce(
    (n, b) => (selected.has(b.id) ? n + 1 : n),
    0,
  );

  const toggle = (id: string) =>
    updateSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    updateSelected((prev) => {
      const next = new Set(prev);
      if (pageIds.every((id) => prev.has(id))) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });

  const selectAllMatching = () =>
    updateSelected(() => new Set(filtered.map((b) => b.id)));

  const clearSelection = () => setSelection({ scope: scopeKey, ids: new Set() });

  // The visible page auto-clamps via `safePage`, so deleting just needs to drop
  // the now-stale selection — no manual page math required.
  const afterDelete = () => setSelection({ scope: scopeKey, ids: new Set() });

  const onDeleteOne = async (budget: Budget) => {
    const ok = await confirm({
      title: `Delete override for ${budget.user}?`,
      content:
        'This removes the user-specific cap. The universal budget will apply to this user instead.',
      confirmButtonContent: 'Delete',
      confirmButtonType: 'danger',
    });
    if (!ok) return;
    try {
      await deleteBudget.mutateAsync(budget.id);
      addToast({ variant: 'success', message: `Deleted override for ${budget.user}.` });
    } catch (err) {
      addToast({
        variant: 'danger',
        title: 'Delete failed',
        message: errorMessage(err),
      });
    }
  };

  const openBulkDelete = () => {
    if (!client) return;
    const chosen = filtered.filter((b) => selected.has(b.id));
    if (chosen.length === 0) return;
    setDialog({
      type: 'delete',
      budgets: chosen,
      allMatching: chosen.length === filtered.length,
    });
  };

  const onDownloadAll = () => {
    if (allBudgets.length === 0) {
      addToast({ variant: 'warning', message: 'No override budgets to download.' });
      return;
    }
    setDownloading(true);
    try {
      const rows = allBudgets
        .filter((b) => b.user)
        .map((b) => ({ username: b.user as string, budgetAmount: b.budget_amount }))
        .sort((a, b) => a.username.localeCompare(b.username));
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`override-budgets-${stamp}.csv`, buildOverridesCsv(rows));
      addToast({
        variant: 'success',
        message: `Downloaded ${rows.length} override budget${rows.length === 1 ? '' : 's'}.`,
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="card">
      <div className="card__header">
        <PeopleIcon size={20} />
        <div className="card__title-group">
          <h2>Override budgets</h2>
          <p className="card__subtitle">
            Per-user AI Credits caps that take precedence over the universal
            budget.
          </p>
        </div>
      </div>

      <div className="card__body">
        <div className="table-toolbar">
          <div className="table-toolbar__search">
            <TextInput
              block
              leadingVisual={SearchIcon}
              placeholder="Search by username"
              value={searchInput}
              aria-label="Search override budgets by username"
              onChange={(e) => setSearchInput(e.target.value)}
              trailingAction={
                searchInput ? (
                  <TextInput.Action
                    onClick={() => setSearchInput('')}
                    icon={XIcon}
                    aria-label="Clear search"
                  />
                ) : undefined
              }
            />
          </div>
          <span className="table-toolbar__spacer" />
          {selectedCount > 0 && (
            <Button
              variant="danger"
              leadingVisual={TrashIcon}
              onClick={openBulkDelete}
            >
              {allMatchingSelected && total > OVERRIDES_PER_PAGE
                ? `Delete all ${total.toLocaleString()} matching`
                : `Delete selected (${selectedCount.toLocaleString()})`}
            </Button>
          )}
          <Button
            leadingVisual={DownloadIcon}
            onClick={onDownloadAll}
            loading={downloading}
            disabled={total === 0}
          >
            Download all
          </Button>
          <Button
            leadingVisual={UploadIcon}
            onClick={() => setDialog({ type: 'bulk' })}
          >
            Bulk upload
          </Button>
          <Button
            variant="primary"
            leadingVisual={PlusIcon}
            onClick={() => setDialog({ type: 'add' })}
          >
            Add override
          </Button>
        </div>

        {isError && (
          <Banner
            variant="critical"
            title="Failed to load override budgets"
            description={errorMessage(error)}
          />
        )}

        {!isError && isLoading && (
          <div className="center-pad">
            <Spinner />
          </div>
        )}

        {!isError && !isLoading && pageItems.length === 0 && (
          <div className="empty-state">
            <PeopleIcon size={28} />
            {search ? (
              <p>No override budgets match “{search}”.</p>
            ) : (
              <p>No override budgets yet. Add one or bulk upload a file.</p>
            )}
            <Button
              variant="primary"
              leadingVisual={PlusIcon}
              onClick={() => setDialog({ type: 'add' })}
            >
              Add override
            </Button>
          </div>
        )}

        {!isError && !isLoading && pageItems.length > 0 && (
          <>
            {allOnPageSelected && total > pageItems.length && (
              <div className="select-all-banner">
                {allMatchingSelected ? (
                  <>
                    <span>
                      All <strong>{total.toLocaleString()}</strong> matching
                      override budgets are selected.
                    </span>
                    <Button variant="invisible" size="small" onClick={clearSelection}>
                      Clear selection
                    </Button>
                  </>
                ) : (
                  <>
                    <span>
                      All <strong>{pageItems.length}</strong> on this page are
                      selected.
                    </span>
                    <Button
                      variant="invisible"
                      size="small"
                      onClick={selectAllMatching}
                    >
                      Select all {total.toLocaleString()} matching
                    </Button>
                  </>
                )}
              </div>
            )}
            <OverridesTable
              budgets={displayItems}
              selected={selected}
              onToggle={toggle}
              onToggleAll={toggleAll}
              allSelected={allOnPageSelected}
              someSelected={someOnPageSelected}
              onEdit={(b) => setDialog({ type: 'edit', budget: b })}
              onDelete={onDeleteOne}
            />
            <PaginationFooter
              page={safePage}
              pageCount={pageCount}
              total={total}
              loading={isFetching}
              onPageChange={setPage}
            />
          </>
        )}
      </div>

      {dialog.type === 'add' && (
        <OverrideEditDialog mode="create" onClose={() => setDialog({ type: 'none' })} />
      )}
      {dialog.type === 'edit' && (
        <OverrideEditDialog
          mode="edit"
          budget={dialog.budget}
          onClose={() => setDialog({ type: 'none' })}
        />
      )}
      {dialog.type === 'bulk' && (
        <BulkUploadDialog onClose={() => setDialog({ type: 'none' })} />
      )}
      {dialog.type === 'delete' && (
        <BulkDeleteDialog
          targets={dialog.budgets}
          allMatching={dialog.allMatching}
          onClose={() => setDialog({ type: 'none' })}
          onComplete={afterDelete}
        />
      )}
    </section>
  );
}
