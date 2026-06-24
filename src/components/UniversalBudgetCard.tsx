import { useState } from 'react';
import {
  Banner,
  Button,
  FormControl,
  IconButton,
  Spinner,
  TextInput,
} from '@primer/react';
import {
  GlobeIcon,
  LockIcon,
  PencilIcon,
  SyncIcon,
} from '@primer/octicons-react';
import {
  useCreateBudget,
  useUniversalBudget,
  useUpdateBudget,
} from '../hooks/useBudgets';
import { useToast } from '../context/toast';
import { BudgetClientError } from '../api/client';
import {
  AI_CREDITS_BUDGET_TYPE,
  AI_CREDITS_SKU,
  UNIVERSAL_SCOPE,
} from '../types/budget';
import { formatCurrency } from '../utils/format';

function errorMessage(err: unknown): string {
  if (err instanceof BudgetClientError) {
    return `${err.message}${err.status ? ` (HTTP ${err.status})` : ''}`;
  }
  return (err as Error).message;
}

export function UniversalBudgetCard() {
  const { data, isLoading, isFetching, isError, error, refetch } =
    useUniversalBudget();
  const createBudget = useCreateBudget();
  const updateBudget = useUpdateBudget();
  const { addToast } = useToast();

  const budget = data?.budget ?? null;

  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');

  const startEdit = () => {
    setAmount(budget ? String(budget.budget_amount) : '30');
    setEditing(true);
  };

  const saving = createBudget.isPending || updateBudget.isPending;

  const onSave = async () => {
    const parsed = Number(amount);
    if (!Number.isInteger(parsed) || parsed < 0) {
      addToast({
        variant: 'danger',
        message: 'Enter a whole dollar amount of 0 or more.',
      });
      return;
    }
    const alerting = {
      will_alert: false,
      alert_recipients: [] as string[],
    };
    try {
      if (budget) {
        await updateBudget.mutateAsync({
          id: budget.id,
          payload: {
            budget_amount: parsed,
            prevent_further_usage: true,
            budget_alerting: alerting,
          },
        });
        addToast({ variant: 'success', message: 'Universal budget updated.' });
      } else {
        await createBudget.mutateAsync({
          budget_amount: parsed,
          prevent_further_usage: true,
          budget_scope: UNIVERSAL_SCOPE,
          budget_entity_name: '',
          budget_type: AI_CREDITS_BUDGET_TYPE,
          budget_product_sku: AI_CREDITS_SKU,
          budget_alerting: alerting,
        });
        addToast({ variant: 'success', message: 'Universal budget created.' });
      }
      setEditing(false);
    } catch (err) {
      addToast({
        variant: 'danger',
        title: 'Could not save budget',
        message: errorMessage(err),
      });
    }
  };

  return (
    <section className="card">
      <div className="card__header">
        <GlobeIcon size={20} />
        <div className="card__title-group">
          <h2>Universal user-level budget</h2>
          <p className="card__subtitle">
            The default monthly AI Credits cap applied to every user
            (multi_user_customer scope).
          </p>
        </div>
        {!editing && (
          <IconButton
            icon={SyncIcon}
            aria-label="Refresh universal budget"
            onClick={() => void refetch()}
            loading={isFetching}
          />
        )}
        {!editing && !isLoading && (
          <Button leadingVisual={PencilIcon} onClick={startEdit}>
            {budget ? 'Edit' : 'Set budget'}
          </Button>
        )}
      </div>

      <div className="card__body">
        {isLoading && (
          <div className="center-pad">
            <Spinner />
          </div>
        )}

        {isError && (
          <Banner
            variant="critical"
            title="Failed to load universal budget"
            description={errorMessage(error)}
          />
        )}

        {!isLoading && !isError && editing && (
          <div className="universal-form">
            <div className="universal-grid">
              <FormControl>
                <FormControl.Label>Monthly budget (USD)</FormControl.Label>
                <TextInput
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
                <FormControl.Caption>Whole dollars.</FormControl.Caption>
              </FormControl>
            </div>
            <div className="row" style={{ marginTop: 16 }}>
              <Button variant="primary" onClick={onSave} loading={saving}>
                Save budget
              </Button>
              <Button onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
              <span className="table-toolbar__spacer" />
              <span className="row field-hint">
                <LockIcon size={14} /> Spending is blocked when exceeded
                (required for user budgets).
              </span>
            </div>
          </div>
        )}

        {!isLoading && !isError && !editing && !budget && (
          <div className="empty-state">
            <GlobeIcon size={28} />
            <p>No universal budget set. Every user is currently uncapped.</p>
            <Button variant="primary" leadingVisual={PencilIcon} onClick={startEdit}>
              Set universal budget
            </Button>
          </div>
        )}

        {!isLoading && !isError && !editing && budget && (
          <div className="universal-summary">
            <div className="universal-summary__main">
              <span className="universal-summary__value">
                {formatCurrency(budget.budget_amount)}
              </span>
              <span className="universal-summary__unit">per user · monthly</span>
            </div>
            <span
              className="universal-summary__note"
              title="Spending is blocked when a user exceeds their cap"
            >
              <LockIcon size={14} /> Blocks when exceeded
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
