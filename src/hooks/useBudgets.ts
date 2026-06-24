import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useConnection } from '../context/connection';
import {
  UNIVERSAL_SCOPE,
  OVERRIDE_SCOPE,
  type Budget,
  type CreateBudgetPayload,
  type UpdateBudgetPayload,
} from '../types/budget';

export const OVERRIDES_PER_PAGE = 25;

export function useUniversalBudget() {
  const { client, isConfigured, clientKey } = useConnection();
  return useQuery({
    queryKey: ['universal', clientKey],
    enabled: !!client && isConfigured,
    queryFn: async () => {
      const result = await client!.listBudgets({
        scope: UNIVERSAL_SCOPE,
        per_page: 100,
      });
      return {
        budget: result.budgets[0] ?? null,
        effective: result.effective_budget ?? null,
      };
    },
  });
}

/**
 * Fetch *every* user-scoped override budget, paginating to the end.
 *
 * The Budgets API has no server-side search: its `user` query parameter only
 * scopes the `effective_budget` consumed-amount detail, it does not filter the
 * returned list. So to support searching, filtering and accurate counts we pull
 * the full list once and do all of that client-side. The result is cached by
 * React Query (and reused across pages/searches); every request is paced and
 * retried by the rate-limited client, so this scales to thousands of overrides.
 */
export function useAllOverrides() {
  const { client, isConfigured, clientKey } = useConnection();
  return useQuery({
    queryKey: ['overrides-all', clientKey],
    enabled: !!client && isConfigured,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async ({ signal }) => {
      const all: Budget[] = [];
      let page = 1;
      for (;;) {
        const res = await client!.listBudgets(
          { scope: OVERRIDE_SCOPE, page, per_page: 100 },
          signal,
        );
        for (const b of res.budgets) {
          if (b.budget_scope === OVERRIDE_SCOPE) all.push(b);
        }
        if (!res.has_next_page || res.budgets.length === 0) break;
        page += 1;
      }
      all.sort((a, b) => (a.user ?? '').localeCompare(b.user ?? ''));
      return all;
    },
  });
}

/**
 * The list endpoint doesn't return per-row consumed amounts — only a single
 * `effective_budget` for an explicitly queried user. When the user searches an
 * exact username we fetch that detail so the Usage column can be populated.
 */
export function useUserUsage(search: string) {
  const { client, isConfigured, clientKey } = useConnection();
  const trimmed = search.trim();
  return useQuery({
    queryKey: ['override-usage', clientKey, trimmed.toLowerCase()],
    enabled: !!client && isConfigured && trimmed.length > 0,
    queryFn: async ({ signal }) => {
      const res = await client!.listBudgets(
        { scope: OVERRIDE_SCOPE, user: trimmed, per_page: 1 },
        signal,
      );
      return res.effective_budget ?? null;
    },
  });
}

function useInvalidateBudgets() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['overrides-all'] });
    void queryClient.invalidateQueries({ queryKey: ['override-usage'] });
    void queryClient.invalidateQueries({ queryKey: ['universal'] });
  };
}

export function useCreateBudget() {
  const { client } = useConnection();
  const invalidate = useInvalidateBudgets();
  return useMutation({
    mutationFn: (payload: CreateBudgetPayload): Promise<Budget> =>
      client!.createBudget(payload),
    onSuccess: invalidate,
  });
}

export function useUpdateBudget() {
  const { client } = useConnection();
  const invalidate = useInvalidateBudgets();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: UpdateBudgetPayload;
    }): Promise<Budget> => client!.updateBudget(id, payload),
    onSuccess: invalidate,
  });
}

export function useDeleteBudget() {
  const { client } = useConnection();
  const invalidate = useInvalidateBudgets();
  return useMutation({
    mutationFn: (id: string): Promise<void> => client!.deleteBudget(id),
    onSuccess: invalidate,
  });
}
