import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Dialog, Label } from '@primer/react';
import { AlertIcon, DownloadIcon } from '@primer/octicons-react';
import { useConnection } from '../context/connection';
import { useToast } from '../context/toast';
import { type Budget } from '../types/budget';
import { runBulk, type BulkProgress } from '../utils/pool';
import { buildOverridesCsv, downloadCsv } from '../utils/bulkImport';
import { BulkProgressView } from './BulkProgressView';

interface Props {
  /** The exact budgets to delete (already resolved client-side). */
  targets: Budget[];
  /** True when these targets are every override matching the current search. */
  allMatching?: boolean;
  onClose: () => void;
  /** Called after the run finishes (or is cancelled) so the parent can refresh. */
  onComplete: () => void;
}

type Phase = 'confirm' | 'running' | 'done';

/** Below this, a bulk delete is quick enough not to warrant a slow-job warning. */
const BIG_JOB_THRESHOLD = 200;

export function BulkDeleteDialog({
  targets,
  allMatching = false,
  onClose,
  onComplete,
}: Props) {
  const { client } = useConnection();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>('confirm');
  const [progress, setProgress] = useState<BulkProgress>({
    done: 0,
    ok: 0,
    failed: 0,
    total: targets.length,
  });
  const [unfinished, setUnfinished] = useState<Budget[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const count = targets.length;
  const isBigJob = count >= BIG_JOB_THRESHOLD;

  async function start() {
    if (!client || count === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setStartedAt(Date.now());

    setPhase('running');
    setProgress({ done: 0, ok: 0, failed: 0, total: count });

    const outcome = await runBulk<Budget>({
      items: targets,
      concurrency: 6,
      signal: controller.signal,
      onProgress: setProgress,
      worker: (budget, signal) => client.deleteBudget(budget.id, signal),
    });

    void queryClient.invalidateQueries({ queryKey: ['overrides-all'] });
    void queryClient.invalidateQueries({ queryKey: ['override-usage'] });
    setUnfinished([...outcome.failedItems, ...outcome.remaining]);
    setPhase('done');
    onComplete();

    const { ok, failed, cancelled, remaining } = outcome;
    addToast({
      variant: failed || cancelled ? 'warning' : 'success',
      title: cancelled ? 'Bulk delete stopped' : 'Bulk delete complete',
      message: `${ok} deleted${failed ? `, ${failed} failed` : ''}${
        cancelled ? `, ${remaining.length} not processed` : ''
      }.`,
    });
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function downloadUnfinished() {
    const rows = unfinished
      .filter((b) => b.user)
      .map((b) => ({ username: b.user as string, budgetAmount: b.budget_amount }))
      .sort((a, b) => a.username.localeCompare(b.username));
    if (rows.length === 0) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`unfinished-deletes-${stamp}.csv`, buildOverridesCsv(rows));
  }

  const footerButtons = (() => {
    if (phase === 'confirm') {
      return [
        { content: 'Cancel', onClick: onClose },
        {
          content: `Delete ${count.toLocaleString()}`,
          buttonType: 'danger' as const,
          onClick: start,
        },
      ];
    }
    if (phase === 'running') {
      return [{ content: 'Cancel', buttonType: 'danger' as const, onClick: cancel }];
    }
    return [{ content: 'Done', buttonType: 'primary' as const, onClick: onClose }];
  })();

  return (
    <Dialog
      title={allMatching ? 'Delete all matching overrides' : 'Delete selected overrides'}
      onClose={phase === 'running' ? cancel : onClose}
      width="large"
      footerButtons={footerButtons}
    >
      <div className="dialog-scroll">
        {phase === 'confirm' && (
          <>
            <p style={{ marginTop: 0 }}>
              This permanently removes{' '}
              <strong>
                {count.toLocaleString()} override budget{count === 1 ? '' : 's'}
              </strong>
              . The universal budget will apply to those users instead. This cannot
              be undone.
            </p>
            {isBigJob && (
              <Banner
                variant="warning"
                title="This is a large job"
                description={
                  <>
                    GitHub limits how fast budgets can be changed (about 3 deletes
                    per second), so this will take a while. Keep this tab open — you
                    can cancel at any time, and any rows that don't finish can be
                    exported afterward.
                  </>
                }
              />
            )}
          </>
        )}

        {(phase === 'running' || phase === 'done') && (
          <BulkProgressView
            progress={progress}
            startedAt={startedAt}
            active={phase === 'running'}
          />
        )}

        {phase === 'done' && unfinished.length > 0 && (
          <div className="bulk-done-row">
            <span className="row" style={{ color: 'var(--fgColor-attention)' }}>
              <AlertIcon size={16} />
              <Label variant="attention">{unfinished.length} not deleted</Label>
            </span>
            <Button leadingVisual={DownloadIcon} onClick={downloadUnfinished}>
              Download unfinished rows
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  );
}
