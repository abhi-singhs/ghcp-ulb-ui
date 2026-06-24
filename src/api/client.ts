import type {
  Budget,
  CreateBudgetPayload,
  ListBudgetsParams,
  ListBudgetsResult,
  UpdateBudgetPayload,
} from '../types/budget';

/** Normalized error thrown by every BudgetClient implementation. */
export class BudgetClientError extends Error {
  status: number;
  /** Raw response body, when available. */
  body?: unknown;
  /**
   * True when the request ultimately failed because of a primary or secondary
   * rate limit (after the client exhausted its automatic retries). Lets bulk
   * callers surface and re-run just the rate-limited rows.
   */
  rateLimited: boolean;

  constructor(message: string, status = 0, body?: unknown, rateLimited = false) {
    super(message);
    this.name = 'BudgetClientError';
    this.status = status;
    this.body = body;
    this.rateLimited = rateLimited;
  }
}

/**
 * Abstraction over the GitHub Budgets REST API. Two implementations exist:
 * a live client (api.github.com) and a mock client (in-memory + localStorage).
 */
export interface BudgetClient {
  /** A stable identifier for the client, used to scope query caches. */
  readonly id: string;
  listBudgets(
    params: ListBudgetsParams,
    signal?: AbortSignal,
  ): Promise<ListBudgetsResult>;
  getBudget(id: string): Promise<Budget>;
  createBudget(
    payload: CreateBudgetPayload,
    signal?: AbortSignal,
  ): Promise<Budget>;
  updateBudget(
    id: string,
    payload: UpdateBudgetPayload,
    signal?: AbortSignal,
  ): Promise<Budget>;
  deleteBudget(id: string, signal?: AbortSignal): Promise<void>;
  /** Lightweight reachability/credential check. */
  testConnection(): Promise<void>;
}
