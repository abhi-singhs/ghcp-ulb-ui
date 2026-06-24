import { BudgetClientError, type BudgetClient } from './client';
import {
  API_VERSION,
  type Budget,
  type CreateBudgetPayload,
  type ListBudgetsParams,
  type ListBudgetsResult,
  type UpdateBudgetPayload,
} from '../types/budget';
import { isAbortError, jitter, RateLimiter, sleep } from '../utils/rateLimiter';

const GITHUB_API = 'https://api.github.com';

/** How many times to retry a single request before giving up. */
const MAX_ATTEMPTS = 6;
/** Cap for exponential backoff between attempts. */
const MAX_BACKOFF_MS = 60_000;
/**
 * Hard cap on how long we'll wait for a primary-limit reset before giving up.
 * The primary PAT limit resets hourly; we don't want a single request to block
 * a bulk job for the better part of an hour, so we surface it as a failure that
 * the user can re-run instead.
 */
const MAX_RESET_WAIT_MS = 5 * 60_000;

interface ListResponseBody {
  budgets: Budget[];
  user?: string;
  effective_budget?: { id: string; budget_amount: number; consumed_amount: number };
  has_next_page?: boolean;
  total_count?: number;
}

interface MutationResponseBody {
  message: string;
  budget: Budget;
}

type RequestKind = 'read' | 'write' | 'create';

/** Internal error carrying the rate-limit signals parsed from a response. */
class HttpError extends Error {
  status: number;
  body: unknown;
  rateLimited: boolean;
  /** Explicit wait derived from `Retry-After` / `x-ratelimit-reset`, in ms. */
  retryWaitMs: number | null;
  /** Whether the wait stems from primary-limit exhaustion (remaining = 0). */
  primaryExhausted: boolean;

  constructor(
    message: string,
    status: number,
    body: unknown,
    rateLimited: boolean,
    retryWaitMs: number | null,
    primaryExhausted: boolean,
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.body = body;
    this.rateLimited = rateLimited;
    this.retryWaitMs = retryWaitMs;
    this.primaryExhausted = primaryExhausted;
  }
}

/**
 * Live client that talks directly to the GitHub Budgets REST API from the
 * browser. GitHub's REST API supports CORS, so this works without a backend.
 *
 * To survive bulk operations on enterprises with thousands of overrides, every
 * request is paced through a shared {@link RateLimiter} (separate buckets for
 * reads, writes and creates) and automatically retried with backoff that
 * honors GitHub's `Retry-After` / `x-ratelimit-reset` headers. When a request
 * is rate limited, the limiter is paused so *all* in-flight workers back off
 * together rather than hammering the API.
 */
export class GitHubBudgetClient implements BudgetClient {
  readonly id: string;
  private readonly enterprise: string;
  private readonly token: string;

  // GETs are cheap (1 point); mutations cost 5 points (~180/min ceiling) and
  // POST creates are further bound by the content-creation limit (~80/min).
  private readonly readLimiter = new RateLimiter({ ratePerSec: 10, concurrency: 8 });
  private readonly writeLimiter = new RateLimiter({ ratePerSec: 3, concurrency: 4 });
  private readonly createLimiter = new RateLimiter({ ratePerSec: 1.1, concurrency: 2 });

  constructor(enterprise: string, token: string) {
    this.enterprise = enterprise.trim();
    this.token = token.trim();
    this.id = `live:${this.enterprise}`;
  }

  private get baseUrl(): string {
    return `${GITHUB_API}/enterprises/${encodeURIComponent(
      this.enterprise,
    )}/settings/billing/budgets`;
  }

  private headers(includeContentType = false): HeadersInit {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${this.token}`,
      'X-GitHub-Api-Version': API_VERSION,
    };
    if (includeContentType) headers['Content-Type'] = 'application/json';
    return headers;
  }

  private limiterFor(kind: RequestKind): RateLimiter {
    if (kind === 'read') return this.readLimiter;
    if (kind === 'create') return this.createLimiter;
    return this.writeLimiter;
  }

  /** Perform a single fetch, parse the body, and throw {@link HttpError} on failure. */
  private async attempt<T>(
    url: string,
    init: RequestInit,
    signal?: AbortSignal,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, { ...init, signal });
    } catch (err) {
      if (isAbortError(err)) throw err;
      // Network/CORS failures are transient-ish; mark retryable via status 0.
      throw new HttpError(
        `Network error: ${(err as Error).message}. This may be a CORS issue or connectivity problem.`,
        0,
        undefined,
        false,
        null,
        false,
      );
    }

    const text = await response.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (response.ok) return body as T;

    const message =
      (body && typeof body === 'object' && 'message' in body
        ? String((body as { message: unknown }).message)
        : undefined) ?? `Request failed with status ${response.status}`;

    const remaining = response.headers.get('x-ratelimit-remaining');
    const reset = response.headers.get('x-ratelimit-reset');
    const retryAfter = response.headers.get('retry-after');
    const primaryExhausted = remaining === '0';

    // A 403 is only a rate limit when it carries rate-limit signals; otherwise
    // it's a real permission/scope error and must NOT be retried.
    const looksRateLimited =
      response.status === 429 ||
      (response.status === 403 &&
        (retryAfter != null ||
          primaryExhausted ||
          /\b(secondary )?rate limit\b/i.test(message)));

    let retryWaitMs: number | null = null;
    if (looksRateLimited) {
      const retryAfterSec = retryAfter ? Number(retryAfter) : NaN;
      if (Number.isFinite(retryAfterSec)) {
        retryWaitMs = Math.max(0, retryAfterSec * 1000);
      } else if (primaryExhausted && reset) {
        const resetSec = Number(reset);
        if (Number.isFinite(resetSec)) {
          retryWaitMs = Math.max(0, resetSec * 1000 - Date.now());
        }
      }
    }

    throw new HttpError(
      message,
      response.status,
      body,
      looksRateLimited,
      retryWaitMs,
      primaryExhausted,
    );
  }

  private async request<T>(
    url: string,
    init: RequestInit,
    kind: RequestKind,
    signal?: AbortSignal,
  ): Promise<T> {
    const limiter = this.limiterFor(kind);

    for (let attempt = 0; ; attempt++) {
      try {
        return await limiter.schedule(() => this.attempt<T>(url, init, signal), signal);
      } catch (err) {
        if (isAbortError(err)) throw err;
        if (!(err instanceof HttpError)) throw err;

        const transient = err.status === 0 || err.status >= 500;
        const retryable = err.rateLimited || transient;
        const last = attempt >= MAX_ATTEMPTS - 1;

        // Give up on a primary-limit reset that's further out than we'll wait.
        const resetTooFar =
          err.primaryExhausted &&
          err.retryWaitMs != null &&
          err.retryWaitMs > MAX_RESET_WAIT_MS;

        if (!retryable || last || resetTooFar) {
          throw new BudgetClientError(err.message, err.status, err.body, err.rateLimited);
        }

        // Determine how long to wait before the next attempt.
        let waitMs: number;
        if (err.retryWaitMs != null) {
          waitMs = err.retryWaitMs;
        } else if (err.rateLimited) {
          // Secondary limit without a header: GitHub asks for >= 60s; ramp up.
          waitMs = jitter(Math.min(MAX_BACKOFF_MS, 15_000 * 2 ** attempt));
        } else {
          // Transient network/5xx: short exponential backoff.
          waitMs = jitter(Math.min(MAX_BACKOFF_MS, 1_000 * 2 ** attempt));
        }

        // Pause the shared limiter so every concurrent worker backs off too,
        // not just this one. Then wait before re-acquiring.
        if (err.rateLimited) limiter.pauseFor(waitMs);
        await sleep(waitMs, signal);
      }
    }
  }

  async listBudgets(
    params: ListBudgetsParams,
    signal?: AbortSignal,
  ): Promise<ListBudgetsResult> {
    const query = new URLSearchParams();
    if (params.scope) query.set('scope', params.scope);
    if (params.user) query.set('user', params.user);
    query.set('page', String(params.page ?? 1));
    query.set('per_page', String(params.per_page ?? 100));

    const body = await this.request<ListResponseBody>(
      `${this.baseUrl}?${query.toString()}`,
      { method: 'GET', headers: this.headers() },
      'read',
      signal,
    );

    const budgets = body.budgets ?? [];

    // When filtered by a single user, attach the effective consumed amount to
    // the matching override row so the table can display usage.
    if (params.user && body.effective_budget) {
      const target = budgets.find(
        (b) => b.user?.toLowerCase() === params.user?.toLowerCase(),
      );
      if (target) target.consumed_amount = body.effective_budget.consumed_amount;
    }

    return {
      budgets,
      effective_budget: body.effective_budget,
      has_next_page: body.has_next_page ?? false,
      total_count: body.total_count ?? budgets.length,
    };
  }

  async getBudget(id: string): Promise<Budget> {
    return this.request<Budget>(
      `${this.baseUrl}/${encodeURIComponent(id)}`,
      { method: 'GET', headers: this.headers() },
      'read',
    );
  }

  async createBudget(
    payload: CreateBudgetPayload,
    signal?: AbortSignal,
  ): Promise<Budget> {
    const body = await this.request<MutationResponseBody>(
      this.baseUrl,
      {
        method: 'POST',
        headers: this.headers(true),
        body: JSON.stringify(payload),
      },
      'create',
      signal,
    );
    return body.budget;
  }

  async updateBudget(
    id: string,
    payload: UpdateBudgetPayload,
    signal?: AbortSignal,
  ): Promise<Budget> {
    const body = await this.request<MutationResponseBody>(
      `${this.baseUrl}/${encodeURIComponent(id)}`,
      {
        method: 'PATCH',
        headers: this.headers(true),
        body: JSON.stringify(payload),
      },
      'write',
      signal,
    );
    return body.budget;
  }

  async deleteBudget(id: string, signal?: AbortSignal): Promise<void> {
    await this.request<{ message: string; id: string }>(
      `${this.baseUrl}/${encodeURIComponent(id)}`,
      { method: 'DELETE', headers: this.headers() },
      'write',
      signal,
    );
  }

  async testConnection(): Promise<void> {
    await this.listBudgets({ per_page: 1, page: 1 });
  }
}
