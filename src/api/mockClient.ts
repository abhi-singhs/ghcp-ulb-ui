import { BudgetClientError, type BudgetClient } from './client';
import {
  AI_CREDITS_BUDGET_TYPE,
  AI_CREDITS_SKU,
  OVERRIDE_SCOPE,
  UNIVERSAL_SCOPE,
  type Budget,
  type BudgetAlerting,
  type CreateBudgetPayload,
  type ListBudgetsParams,
  type ListBudgetsResult,
  type UpdateBudgetPayload,
} from '../types/budget';

const STORAGE_KEY = 'ghcp-ulb-mock-budgets-v1';

class MockAbortError extends Error {
  constructor() {
    super('Operation aborted');
    this.name = 'AbortError';
  }
}

function delay(ms = 220 + Math.random() * 240, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(new MockAbortError());
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new MockAbortError());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `budget_${Math.random().toString(36).slice(2)}${Date.now()}`;
}

/** Mirror the live API rule: alerting can't be enabled without recipients. */
function assertAlertingValid(alerting?: BudgetAlerting): void {
  if (alerting?.will_alert && alerting.alert_recipients.length === 0) {
    throw new BudgetClientError(
      'Alert recipients are required when budget alerting is enabled',
      400,
    );
  }
}

const SEED_LOGINS = [
  'octocat', 'monalisa', 'hubot', 'defunkt', 'mojombo', 'pjhyett', 'wycats',
  'ezmobius', 'ivey', 'evanphx', 'vanpelt', 'wayneeseguin', 'brynary', 'kevinclark',
  'technoweenie', 'macournoyer', 'takeo', 'caged', 'topfunky', 'anotherjesse',
  'roland', 'lukas', 'fanvsfan', 'tomtt', 'railsjitsu', 'nitay', 'kevwil',
  'KirinDave', 'jamesgolick', 'atmos', 'errfree', 'mojodna', 'bmizerany',
  'jnewland', 'joshknowles', 'hornbeck', 'jwhitmire', 'elbowdonkey', 'reinh',
  'knzconnor', 'bryan-veloso', 'al3x', 'dmitrykudryavtsev', 'sr', 'sigje',
  'bsdrocks', 'rsanheim', 'schacon', 'uggedal', 'bcardarella',
];

function seedBudgets(): Budget[] {
  const budgets: Budget[] = [
    {
      id: uuid(),
      budget_type: AI_CREDITS_BUDGET_TYPE,
      budget_amount: 30,
      prevent_further_usage: true,
      budget_scope: UNIVERSAL_SCOPE,
      budget_entity_name: '',
      budget_product_sku: AI_CREDITS_SKU,
      budget_alerting: { will_alert: false, alert_recipients: [] },
      consumed_amount: 12.47,
    },
  ];

  SEED_LOGINS.forEach((login, i) => {
    const amount = [10, 15, 20, 25, 50, 75, 100][i % 7];
    const consumed = Math.round(amount * (0.1 + (i % 13) / 10) * 100) / 100;
    budgets.push({
      id: uuid(),
      budget_type: AI_CREDITS_BUDGET_TYPE,
      budget_amount: amount,
      prevent_further_usage: true,
      budget_scope: OVERRIDE_SCOPE,
      budget_entity_name: '',
      user: login,
      budget_product_sku: AI_CREDITS_SKU,
      budget_alerting: {
        will_alert: false,
        alert_recipients: [],
      },
      consumed_amount: consumed,
    });
  });

  return budgets;
}

function load(): Budget[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Budget[];
  } catch {
    // ignore corrupt storage
  }
  const seeded = seedBudgets();
  save(seeded);
  return seeded;
}

function save(budgets: Budget[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(budgets));
  } catch {
    // storage may be unavailable; demo still works in-memory
  }
}

/**
 * In-memory mock client backed by localStorage, used by Demo mode. Mirrors the
 * relevant behaviors of the real API (pagination, user filtering, duplicate
 * rejection) so the UI behaves identically to Live mode.
 */
export class MockBudgetClient implements BudgetClient {
  readonly id = 'demo';
  private budgets: Budget[];

  constructor() {
    this.budgets = load();
  }

  private persist() {
    save(this.budgets);
  }

  /** Restore the original seeded demo dataset. */
  reset(): void {
    this.budgets = seedBudgets();
    this.persist();
  }

  async listBudgets(
    params: ListBudgetsParams,
    signal?: AbortSignal,
  ): Promise<ListBudgetsResult> {
    await delay(undefined, signal);
    let filtered = this.budgets;
    if (params.scope) {
      filtered = filtered.filter((b) => b.budget_scope === params.scope);
    }
    if (params.user) {
      const needle = params.user.toLowerCase();
      filtered = filtered.filter((b) => b.user?.toLowerCase().includes(needle));
    }

    const total = filtered.length;
    const perPage = params.per_page ?? 100;
    const page = params.page ?? 1;
    const start = (page - 1) * perPage;
    const pageItems = filtered.slice(start, start + perPage).map((b) => ({ ...b }));

    let effective: ListBudgetsResult['effective_budget'];
    const exact = params.user
      ? filtered.find((b) => b.user?.toLowerCase() === params.user?.toLowerCase())
      : undefined;
    if (exact) {
      effective = {
        id: exact.id,
        budget_amount: exact.budget_amount,
        consumed_amount: exact.consumed_amount ?? 0,
      };
    }

    return {
      budgets: pageItems,
      effective_budget: effective,
      has_next_page: start + perPage < total,
      total_count: total,
    };
  }

  async getBudget(id: string): Promise<Budget> {
    await delay(120);
    const found = this.budgets.find((b) => b.id === id);
    if (!found) throw new BudgetClientError('Budget not found', 404);
    return { ...found };
  }

  async createBudget(
    payload: CreateBudgetPayload,
    signal?: AbortSignal,
  ): Promise<Budget> {
    await delay(undefined, signal);
    assertAlertingValid(payload.budget_alerting);
    if (payload.budget_scope === OVERRIDE_SCOPE && payload.user) {
      const exists = this.budgets.some(
        (b) =>
          b.budget_scope === OVERRIDE_SCOPE &&
          b.budget_product_sku === payload.budget_product_sku &&
          b.user?.toLowerCase() === payload.user?.toLowerCase(),
      );
      if (exists) {
        throw new BudgetClientError(
          `A budget already exists for user "${payload.user}"`,
          422,
        );
      }
    }
    if (payload.budget_scope === UNIVERSAL_SCOPE) {
      const exists = this.budgets.some(
        (b) =>
          b.budget_scope === UNIVERSAL_SCOPE &&
          b.budget_product_sku === payload.budget_product_sku,
      );
      if (exists) {
        throw new BudgetClientError(
          'A universal budget already exists for this product',
          422,
        );
      }
    }

    const budget: Budget = {
      id: uuid(),
      budget_type: payload.budget_type,
      budget_amount: payload.budget_amount,
      prevent_further_usage: payload.prevent_further_usage,
      budget_scope: payload.budget_scope,
      budget_entity_name: payload.budget_entity_name ?? '',
      user: payload.user,
      budget_product_sku: payload.budget_product_sku,
      budget_alerting: payload.budget_alerting,
      consumed_amount: 0,
    };
    this.budgets = [budget, ...this.budgets];
    this.persist();
    return { ...budget };
  }

  async updateBudget(
    id: string,
    payload: UpdateBudgetPayload,
    signal?: AbortSignal,
  ): Promise<Budget> {
    await delay(undefined, signal);
    assertAlertingValid(payload.budget_alerting);
    const index = this.budgets.findIndex((b) => b.id === id);
    if (index === -1) throw new BudgetClientError('Budget not found', 404);
    const updated: Budget = {
      ...this.budgets[index],
      ...('budget_amount' in payload && payload.budget_amount != null
        ? { budget_amount: payload.budget_amount }
        : {}),
      ...('prevent_further_usage' in payload && payload.prevent_further_usage != null
        ? { prevent_further_usage: payload.prevent_further_usage }
        : {}),
      ...(payload.budget_alerting
        ? { budget_alerting: payload.budget_alerting }
        : {}),
    };
    this.budgets[index] = updated;
    this.persist();
    return { ...updated };
  }

  async deleteBudget(id: string, signal?: AbortSignal): Promise<void> {
    await delay(160, signal);
    const before = this.budgets.length;
    this.budgets = this.budgets.filter((b) => b.id !== id);
    if (this.budgets.length === before) {
      throw new BudgetClientError('Budget not found', 404);
    }
    this.persist();
  }

  async testConnection(): Promise<void> {
    await delay(80);
  }
}

let singleton: MockBudgetClient | null = null;

/** Demo mode uses a single shared client so data persists across renders. */
export function getMockClient(): MockBudgetClient {
  if (!singleton) singleton = new MockBudgetClient();
  return singleton;
}
