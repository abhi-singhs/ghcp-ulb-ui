import { useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Banner, Button, Dialog, Label, Link, Spinner } from '@primer/react';
import {
  AlertIcon,
  CheckCircleIcon,
  DownloadIcon,
  FileIcon,
  UploadIcon,
  XCircleIcon,
} from '@primer/octicons-react';
import { useConnection } from '../context/connection';
import { useToast } from '../context/toast';
import { BudgetClientError } from '../api/client';
import {
  AI_CREDITS_BUDGET_TYPE,
  AI_CREDITS_SKU,
  OVERRIDE_SCOPE,
  type Budget,
} from '../types/budget';
import {
  buildOverridesCsv,
  downloadCsv,
  downloadSampleCsv,
  parseOverrideImport,
  type ParsedOverrideRow,
} from '../utils/bulkImport';
import { runBulk, type BulkProgress } from '../utils/pool';
import { isAbortError } from '../utils/rateLimiter';
import { BulkProgressView } from './BulkProgressView';

interface Props {
  onClose: () => void;
}

type Phase = 'select' | 'analyzing' | 'preview' | 'running' | 'done';

interface RowPlan {
  row: ParsedOverrideRow;
  action: 'create' | 'update' | 'skip';
  existing?: Budget;
  status: 'pending' | 'ok' | 'error';
  message?: string;
}

const PREVIEW_LIMIT = 250;

/** Above this many writes, warn that GitHub's limits make the job slow. */
const BIG_JOB_THRESHOLD = 200;

function errorMessage(err: unknown): string {
  if (err instanceof BudgetClientError) {
    return `${err.message}${err.status ? ` (HTTP ${err.status})` : ''}`;
  }
  return (err as Error).message;
}

export function BulkUploadDialog({ onClose }: Props) {
  const { client } = useConnection();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<Phase>('select');
  const [fileName, setFileName] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [plans, setPlans] = useState<RowPlan[]>([]);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<BulkProgress>({
    done: 0,
    ok: 0,
    failed: 0,
    total: 0,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const startedAtRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const validPlans = plans.filter((p) => p.row.errors.length === 0);
  const errorCount = plans.length - validPlans.length;
  const createCount = validPlans.filter((p) => p.action === 'create').length;
  const updateCount = validPlans.filter((p) => p.action === 'update').length;
  const isBigJob = validPlans.length >= BIG_JOB_THRESHOLD;

  async function fetchExistingMap(signal: AbortSignal): Promise<Map<string, Budget>> {
    const map = new Map<string, Budget>();
    if (!client) return map;
    let page = 1;
    // Page through every existing override so users are classified correctly as
    // update vs create. The client paces and retries these reads.
    for (;;) {
      const result = await client.listBudgets(
        {
          scope: OVERRIDE_SCOPE,
          page,
          per_page: 100,
        },
        signal,
      );
      for (const b of result.budgets) {
        if (b.user) map.set(b.user.toLowerCase(), b);
      }
      if (!result.has_next_page || result.budgets.length === 0) break;
      page += 1;
    }
    return map;
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    setParseError(null);
    setPhase('analyzing');
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const [rows, existing] = await Promise.all([
        parseOverrideImport(file),
        fetchExistingMap(controller.signal),
      ]);
      if (rows.length === 0) {
        setParseError(
          'No data rows found. Make sure the file has a header row with a "username" column.',
        );
        setPhase('select');
        return;
      }
      const seen = new Set<string>();
      const nextPlans: RowPlan[] = rows.map((row) => {
        const key = row.username.toLowerCase();
        const errors = [...row.errors];
        if (key && seen.has(key)) {
          errors.push('Duplicate username in file');
        }
        if (key) seen.add(key);
        const existingBudget = existing.get(key);
        return {
          row: { ...row, errors },
          action: errors.length
            ? 'skip'
            : existingBudget
              ? 'update'
              : 'create',
          existing: existingBudget,
          status: 'pending',
        };
      });
      setPlans(nextPlans);
      setPhase('preview');
    } catch (err) {
      if (isAbortError(err)) {
        setPhase('select');
        return;
      }
      setParseError(errorMessage(err));
      setPhase('select');
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  async function runImport() {
    if (!client) return;
    const targets = validPlans;
    const controller = new AbortController();
    abortRef.current = controller;
    startedAtRef.current = Date.now();
    setPhase('running');
    setProgress({ done: 0, ok: 0, failed: 0, total: targets.length });

    const outcome = await runBulk<RowPlan>({
      items: targets,
      concurrency: 6,
      signal: controller.signal,
      onProgress: setProgress,
      worker: async (plan, signal) => {
        const alerting = { will_alert: false, alert_recipients: [] as string[] };
        try {
          if (plan.action === 'update' && plan.existing) {
            await client.updateBudget(
              plan.existing.id,
              {
                budget_amount: plan.row.budgetAmount!,
                prevent_further_usage: true,
                budget_alerting: alerting,
              },
              signal,
            );
          } else {
            await client.createBudget(
              {
                budget_amount: plan.row.budgetAmount!,
                prevent_further_usage: true,
                budget_scope: OVERRIDE_SCOPE,
                budget_entity_name: '',
                budget_type: AI_CREDITS_BUDGET_TYPE,
                budget_product_sku: AI_CREDITS_SKU,
                budget_alerting: alerting,
                user: plan.row.username,
              },
              signal,
            );
          }
          plan.status = 'ok';
        } catch (err) {
          // Cancellation isn't a row failure — let runBulk record it as remaining.
          if (isAbortError(err)) throw err;
          plan.status = 'error';
          plan.message = errorMessage(err);
          throw err;
        }
      },
    });

    setPlans((prev) => [...prev]);
    void queryClient.invalidateQueries({ queryKey: ['overrides-all'] });
    void queryClient.invalidateQueries({ queryKey: ['override-usage'] });
    setPhase('done');

    const { ok, failed, cancelled, remaining } = outcome;
    addToast({
      variant: failed || cancelled ? 'warning' : 'success',
      title: cancelled ? 'Bulk import stopped' : 'Bulk import complete',
      message: `${ok} saved${failed ? `, ${failed} failed` : ''}${
        cancelled ? `, ${remaining.length} not processed` : ''
      }.`,
    });
  }

  function cancel() {
    abortRef.current?.abort();
  }

  function downloadFailed() {
    const rows = plans
      .filter((p) => p.status === 'error' || (p.status === 'pending' && p.row.errors.length === 0))
      .filter((p) => p.row.username && p.row.budgetAmount != null)
      .map((p) => ({ username: p.row.username, budgetAmount: p.row.budgetAmount! }));
    if (rows.length === 0) return;
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`unfinished-import-${stamp}.csv`, buildOverridesCsv(rows));
  }

  const unfinishedCount = plans.filter(
    (p) => p.status === 'error' || (p.status === 'pending' && p.row.errors.length === 0),
  ).length;

  const footerButtons = (() => {
    if (phase === 'preview') {
      return [
        { content: 'Cancel', onClick: onClose },
        {
          content: `Import ${validPlans.length} budget${validPlans.length === 1 ? '' : 's'}`,
          buttonType: 'primary' as const,
          onClick: runImport,
          disabled: validPlans.length === 0,
        },
      ];
    }
    if (phase === 'done') {
      return [{ content: 'Done', buttonType: 'primary' as const, onClick: onClose }];
    }
    if (phase === 'running') {
      return [{ content: 'Cancel', buttonType: 'danger' as const, onClick: cancel }];
    }
    return [{ content: 'Cancel', onClick: onClose }];
  })();

  return (
    <Dialog
      title="Bulk upload override budgets"
      subtitle="Import a CSV or Excel file to create or update many user overrides at once."
      onClose={phase === 'running' ? cancel : onClose}
      width="xlarge"
      footerButtons={footerButtons}
    >
      <div className="dialog-scroll">
        {parseError && (
          <Banner variant="critical" title="Couldn't read that file" description={parseError} />
        )}

        {(phase === 'select' || phase === 'analyzing') && (
          <>
            <div
              className="upload-dropzone"
              data-drag={dragging}
              role="button"
              tabIndex={0}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
            >
              {phase === 'analyzing' ? (
                <div className="row" style={{ justifyContent: 'center' }}>
                  <Spinner size="small" /> Analyzing {fileName}…
                </div>
              ) : (
                <>
                  <UploadIcon size={24} />
                  <p style={{ margin: '8px 0 4px', fontWeight: 600 }}>
                    Drop a CSV or Excel file here, or click to browse
                  </p>
                  <p className="muted" style={{ margin: 0 }}>
                    Accepted: .csv, .xlsx, .xls
                  </p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                hidden
                onChange={onInputChange}
              />
            </div>
            <p className="field-hint" style={{ marginTop: 12 }}>
              Columns: <code>username</code>, <code>budget_amount</code>.
              Existing users are updated; new users are created.{' '}
              <Link
                as="button"
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  downloadSampleCsv();
                }}
              >
                <DownloadIcon size={14} /> Download sample CSV
              </Link>
            </p>
          </>
        )}

        {(phase === 'preview' || phase === 'running' || phase === 'done') && (
          <>
            <div className="upload-summary">
              <span className="row">
                <FileIcon size={16} /> <strong>{fileName}</strong>
              </span>
              <Label variant="accent">{createCount} to create</Label>
              <Label variant="attention">{updateCount} to update</Label>
              {errorCount > 0 && <Label variant="danger">{errorCount} with errors</Label>}
            </div>

            {phase === 'preview' && isBigJob && (
              <Banner
                variant="warning"
                title="This is a large import"
                description={
                  <>
                    GitHub limits how fast budgets can be created (about 1–3 writes
                    per second), so importing {validPlans.length.toLocaleString()}{' '}
                    rows will take a while. Keep this tab open — you can cancel at any
                    time, and any rows that don't finish can be downloaded afterward
                    to re-run.
                  </>
                }
              />
            )}

            {(phase === 'running' || phase === 'done') && (
              <BulkProgressView
                progress={progress}
                startedAt={startedAtRef.current}
                active={phase === 'running'}
              />
            )}

            {phase === 'done' && unfinishedCount > 0 && (
              <div className="bulk-done-row">
                <span className="row" style={{ color: 'var(--fgColor-attention)' }}>
                  <AlertIcon size={16} />
                  <Label variant="attention">{unfinishedCount} not saved</Label>
                </span>
                <Button leadingVisual={DownloadIcon} onClick={downloadFailed}>
                  Download unfinished rows
                </Button>
              </div>
            )}

            <div className="preview-wrap">
              <table className="ulb-table">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Username</th>
                    <th>Amount</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {plans.slice(0, PREVIEW_LIMIT).map((plan, i) => (
                    <tr key={i}>
                      <td className="muted">{plan.row.rowNumber}</td>
                      <td>{plan.row.username || <span className="muted">—</span>}</td>
                      <td className="cell-amount">
                        {plan.row.budgetAmount != null ? `$${plan.row.budgetAmount}` : '—'}
                      </td>
                      <td>
                        {plan.row.errors.length > 0 ? (
                          <span className="row" style={{ color: 'var(--fgColor-danger)' }}>
                            <AlertIcon size={14} /> {plan.row.errors[0]}
                          </span>
                        ) : plan.status === 'ok' ? (
                          <span className="row" style={{ color: 'var(--fgColor-success)' }}>
                            <CheckCircleIcon size={14} /> Saved
                          </span>
                        ) : plan.status === 'error' ? (
                          <span className="row" style={{ color: 'var(--fgColor-danger)' }}>
                            <XCircleIcon size={14} /> {plan.message}
                          </span>
                        ) : (
                          <Label variant={plan.action === 'create' ? 'accent' : 'attention'}>
                            {plan.action === 'create' ? 'Create' : 'Update'}
                          </Label>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {plans.length > PREVIEW_LIMIT && (
              <p className="field-hint">
                Showing first {PREVIEW_LIMIT} of {plans.length} rows. All valid rows
                will be processed.
              </p>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}
