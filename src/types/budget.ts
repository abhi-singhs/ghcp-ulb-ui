export type BudgetScope =
  | 'enterprise'
  | 'organization'
  | 'repository'
  | 'cost_center'
  | 'multi_user_customer'
  | 'user';

export type BudgetType = 'BundlePricing' | 'ProductPricing' | 'SkuPricing';

export interface BudgetAlerting {
  will_alert: boolean;
  alert_recipients: string[];
}

export interface Budget {
  id: string;
  budget_type: BudgetType;
  budget_amount: number;
  prevent_further_usage: boolean;
  budget_scope: BudgetScope;
  budget_entity_name?: string;
  user?: string;
  budget_product_sku: string;
  budget_alerting: BudgetAlerting;
  /**
   * Consumed amount for this budget. Only available in some responses
   * (mock data, or live responses filtered by a single user). Optional.
   */
  consumed_amount?: number;
}

export interface EffectiveBudget {
  id: string;
  budget_amount: number;
  consumed_amount: number;
}

export interface ListBudgetsParams {
  scope?: BudgetScope;
  /** Filter consumed amount details by a specific user login. */
  user?: string;
  page?: number;
  per_page?: number;
}

export interface ListBudgetsResult {
  budgets: Budget[];
  effective_budget?: EffectiveBudget;
  has_next_page: boolean;
  total_count: number;
}

export interface CreateBudgetPayload {
  budget_amount: number;
  prevent_further_usage: boolean;
  budget_scope: BudgetScope;
  budget_entity_name?: string;
  budget_type: BudgetType;
  budget_product_sku: string;
  budget_alerting: BudgetAlerting;
  user?: string;
}

export interface UpdateBudgetPayload {
  budget_amount?: number;
  prevent_further_usage?: boolean;
  budget_alerting?: BudgetAlerting;
  budget_scope?: BudgetScope;
  budget_entity_name?: string;
  budget_type?: BudgetType;
  budget_product_sku?: string;
  user?: string;
}

/** Constants for AI Credits user-level budgets. */
export const AI_CREDITS_SKU = 'ai_credits';
export const AI_CREDITS_BUDGET_TYPE: BudgetType = 'BundlePricing';

/** The Universal ULB is a multi_user_customer-scope budget. */
export const UNIVERSAL_SCOPE: BudgetScope = 'multi_user_customer';
/** Override budgets are user-scope budgets. */
export const OVERRIDE_SCOPE: BudgetScope = 'user';

export const API_VERSION = '2026-03-10';
