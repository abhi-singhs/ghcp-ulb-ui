import { useState } from 'react';
import {
  Dialog,
  FormControl,
  TextInput,
} from '@primer/react';
import { useCreateBudget, useUpdateBudget } from '../hooks/useBudgets';
import { useToast } from '../context/toast';
import { BudgetClientError } from '../api/client';
import {
  AI_CREDITS_BUDGET_TYPE,
  AI_CREDITS_SKU,
  OVERRIDE_SCOPE,
  type Budget,
} from '../types/budget';

interface Props {
  mode: 'create' | 'edit';
  budget?: Budget | null;
  onClose: () => void;
}

function errorMessage(err: unknown): string {
  if (err instanceof BudgetClientError) {
    return `${err.message}${err.status ? ` (HTTP ${err.status})` : ''}`;
  }
  return (err as Error).message;
}

export function OverrideEditDialog({ mode, budget, onClose }: Props) {
  const createBudget = useCreateBudget();
  const updateBudget = useUpdateBudget();
  const { addToast } = useToast();

  const [username, setUsername] = useState(budget?.user ?? '');
  const [amount, setAmount] = useState(
    budget ? String(budget.budget_amount) : '',
  );
  const [userError, setUserError] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);

  const saving = createBudget.isPending || updateBudget.isPending;

  const onSave = async () => {
    let valid = true;
    const cleanUser = username.trim().replace(/^@/, '');
    if (mode === 'create' && !cleanUser) {
      setUserError('Username is required.');
      valid = false;
    } else {
      setUserError(null);
    }
    const parsed = Number(amount);
    if (amount.trim() === '' || !Number.isInteger(parsed) || parsed < 0) {
      setAmountError('Enter a whole dollar amount of 0 or more.');
      valid = false;
    } else {
      setAmountError(null);
    }
    if (!valid) return;

    const alerting = {
      will_alert: false,
      alert_recipients: [] as string[],
    };

    try {
      if (mode === 'edit' && budget) {
        await updateBudget.mutateAsync({
          id: budget.id,
          payload: {
            budget_amount: parsed,
            prevent_further_usage: true,
            budget_alerting: alerting,
          },
        });
        addToast({
          variant: 'success',
          message: `Updated override for ${budget.user}.`,
        });
      } else {
        await createBudget.mutateAsync({
          budget_amount: parsed,
          prevent_further_usage: true,
          budget_scope: OVERRIDE_SCOPE,
          budget_entity_name: '',
          budget_type: AI_CREDITS_BUDGET_TYPE,
          budget_product_sku: AI_CREDITS_SKU,
          budget_alerting: alerting,
          user: cleanUser,
        });
        addToast({
          variant: 'success',
          message: `Created override for ${cleanUser}.`,
        });
      }
      onClose();
    } catch (err) {
      addToast({
        variant: 'danger',
        title: 'Could not save override',
        message: errorMessage(err),
      });
    }
  };

  return (
    <Dialog
      title={mode === 'create' ? 'Add override budget' : `Edit override`}
      subtitle={
        mode === 'create'
          ? 'Set a user-specific AI Credits cap that overrides the universal budget.'
          : `User-specific AI Credits cap for ${budget?.user}.`
      }
      onClose={onClose}
      footerButtons={[
        { content: 'Cancel', onClick: onClose, disabled: saving },
        {
          content: mode === 'create' ? 'Create override' : 'Save changes',
          buttonType: 'primary',
          onClick: onSave,
          loading: saving,
        },
      ]}
    >
      <FormControl required={mode === 'create'} disabled={mode === 'edit'}>
        <FormControl.Label>GitHub username</FormControl.Label>
        <TextInput
          block
          value={username}
          placeholder="octocat"
          autoComplete="off"
          onChange={(e) => setUsername(e.target.value)}
        />
        {userError ? (
          <FormControl.Validation variant="error">
            {userError}
          </FormControl.Validation>
        ) : (
          mode === 'edit' && (
            <FormControl.Caption>
              Username can't be changed. Delete and recreate to reassign.
            </FormControl.Caption>
          )
        )}
      </FormControl>

      <div style={{ height: 16 }} />

      <FormControl required>
        <FormControl.Label>Monthly budget (USD)</FormControl.Label>
        <TextInput
          type="number"
          min={0}
          block
          value={amount}
          placeholder="30"
          onChange={(e) => setAmount(e.target.value)}
        />
        {amountError ? (
          <FormControl.Validation variant="error">
            {amountError}
          </FormControl.Validation>
        ) : (
          <FormControl.Caption>
            Whole dollars. Spending is blocked when exceeded.
          </FormControl.Caption>
        )}
      </FormControl>
    </Dialog>
  );
}
