/**
 * Client-side pacing primitives used to stay under GitHub's REST rate limits
 * when performing many requests from the browser.
 *
 * GitHub's documented secondary limits that matter here:
 *  - <= 100 concurrent requests,
 *  - <= 900 points/min per endpoint (GET = 1pt, POST/PATCH/PUT/DELETE = 5pts)
 *    => ~180 mutations/min (~3/sec),
 *  - content creation <= 80/min and <= 500/hour.
 * Plus the primary limit of 5,000 requests/hour for a PAT.
 *
 * The {@link RateLimiter} throttles the *start rate* and concurrency of work
 * regardless of how many callers schedule against it, and exposes a shared
 * `pause` window so the request layer can apply backpressure (honoring
 * `Retry-After` / `x-ratelimit-reset`) to every in-flight worker at once.
 */

/** Error thrown when a scheduled/sleeping operation is aborted. */
export class AbortError extends Error {
  constructor(message = 'Operation aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

export function isAbortError(err: unknown): boolean {
  return (
    err instanceof AbortError ||
    (err instanceof Error && err.name === 'AbortError')
  );
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AbortError();
}

/** Promise-based sleep that rejects with {@link AbortError} if aborted. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new AbortError());
  if (ms <= 0) return Promise.resolve();
  return new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Apply +/- `ratio` random jitter to a delay so retries don't synchronize. */
export function jitter(ms: number, ratio = 0.25): number {
  const delta = ms * ratio;
  return Math.max(0, Math.round(ms + (Math.random() * 2 - 1) * delta));
}

export interface RateLimiterOptions {
  /** Steady-state number of operations that may *start* per second. */
  ratePerSec: number;
  /** Maximum number of operations allowed in flight at once. */
  concurrency: number;
}

interface SlotWaiter {
  resolve: () => void;
  reject: (err: unknown) => void;
}

/**
 * Throttles the start rate and concurrency of scheduled async work. Safe to
 * share across many concurrent callers: reservations are serialized through an
 * internal promise mutex so spacing is enforced globally.
 */
export class RateLimiter {
  private readonly minIntervalMs: number;
  private readonly concurrency: number;
  private inFlight = 0;
  private nextStartAt = 0;
  private pausedUntil = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private readonly slotWaiters: SlotWaiter[] = [];

  constructor(opts: RateLimiterOptions) {
    this.concurrency = Math.max(1, Math.floor(opts.concurrency));
    this.minIntervalMs = opts.ratePerSec > 0 ? 1000 / opts.ratePerSec : 0;
  }

  /** Epoch ms until which new work is paused (0 when not paused). */
  get pausedUntilTs(): number {
    return this.pausedUntil;
  }

  /** Pause all future starts until the given epoch-ms timestamp. */
  pauseUntil(epochMs: number): void {
    if (epochMs > this.pausedUntil) this.pausedUntil = epochMs;
  }

  /** Pause all future starts for `ms` from now. */
  pauseFor(ms: number): void {
    this.pauseUntil(Date.now() + Math.max(0, ms));
  }

  /** Schedule `fn`, respecting the configured rate, concurrency and pauses. */
  async schedule<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    await this.acquire(signal);
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  private acquire(signal?: AbortSignal): Promise<void> {
    const result = this.tail.then(() => this.reserve(signal));
    // Next acquire waits for this reservation to settle; swallow rejections so
    // an aborted reservation doesn't poison the queue for later callers.
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async reserve(signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);
    while (this.inFlight >= this.concurrency) {
      await this.waitForSlot(signal);
      throwIfAborted(signal);
    }
    const now = Date.now();
    const startAt = Math.max(now, this.nextStartAt, this.pausedUntil);
    if (startAt > now) await sleep(startAt - now, signal);
    this.inFlight += 1;
    this.nextStartAt = Date.now() + this.minIntervalMs;
  }

  private release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    const next = this.slotWaiters.shift();
    if (next) next.resolve();
  }

  private waitForSlot(signal?: AbortSignal): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const entry: SlotWaiter = {
        resolve: () => {
          signal?.removeEventListener('abort', onAbort);
          resolve();
        },
        reject: (err) => {
          signal?.removeEventListener('abort', onAbort);
          reject(err);
        },
      };
      const onAbort = () => {
        const i = this.slotWaiters.indexOf(entry);
        if (i >= 0) this.slotWaiters.splice(i, 1);
        entry.reject(new AbortError());
      };
      if (signal?.aborted) {
        reject(new AbortError());
        return;
      }
      this.slotWaiters.push(entry);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }
}
