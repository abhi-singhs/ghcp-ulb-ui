import { isAbortError } from './rateLimiter';

export interface BulkProgress {
  /** Items finished (succeeded + failed). */
  done: number;
  ok: number;
  failed: number;
  total: number;
}

export interface BulkItemResult<T> {
  item: T;
  ok: boolean;
  error?: unknown;
}

export interface BulkOutcome<T> {
  results: BulkItemResult<T>[];
  ok: number;
  failed: number;
  /** True if the run was aborted before every item was processed. */
  cancelled: boolean;
  /** Items that failed (in completion order). */
  failedItems: T[];
  /** Items never processed because the run was cancelled. */
  remaining: T[];
}

export interface RunBulkOptions<T> {
  items: T[];
  /** Process one item. Throw to mark it failed; honor `signal` to cancel. */
  worker: (item: T, signal?: AbortSignal) => Promise<void>;
  /**
   * Number of workers feeding the pipeline. The real request rate is governed
   * by the client's rate limiter, so this only needs to keep that limiter busy.
   */
  concurrency?: number;
  signal?: AbortSignal;
  onProgress?: (progress: BulkProgress) => void;
}

/**
 * Run async work over items with bounded concurrency, cancellation and live
 * progress. Rate-limit pacing/backoff is expected to live in the worker (i.e.
 * the rate-limited client), so this executor focuses on scheduling, progress
 * reporting and collecting failures/unprocessed items for re-runs.
 */
export async function runBulk<T>(opts: RunBulkOptions<T>): Promise<BulkOutcome<T>> {
  const { items, worker, concurrency = 6, signal, onProgress } = opts;
  const results: BulkItemResult<T>[] = [];
  const processed = new Set<T>();
  let ok = 0;
  let failed = 0;
  let done = 0;
  let cursor = 0;
  let cancelled = false;

  const emit = () => onProgress?.({ done, ok, failed, total: items.length });
  emit();

  const size = Math.max(1, Math.min(concurrency, items.length || 1));
  const runners = Array.from({ length: size }, async () => {
    for (;;) {
      if (signal?.aborted) {
        cancelled = true;
        return;
      }
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      try {
        await worker(item, signal);
        results.push({ item, ok: true });
        processed.add(item);
        ok += 1;
      } catch (err) {
        if (isAbortError(err)) {
          cancelled = true;
          return;
        }
        results.push({ item, ok: false, error: err });
        processed.add(item);
        failed += 1;
      }
      done += 1;
      emit();
    }
  });

  await Promise.all(runners);

  const failedItems = results.filter((r) => !r.ok).map((r) => r.item);
  const remaining = items.filter((i) => !processed.has(i));
  return { results, ok, failed, cancelled, failedItems, remaining };
}
