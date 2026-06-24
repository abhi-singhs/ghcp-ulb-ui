import { Checkbox, IconButton } from '@primer/react';
import { PencilIcon, PersonIcon, TrashIcon } from '@primer/octicons-react';
import type { Budget } from '../types/budget';
import { formatCurrency } from '../utils/format';
import { UsageBar } from './UsageBar';

interface Props {
  budgets: Budget[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  someSelected: boolean;
  onEdit: (b: Budget) => void;
  onDelete: (b: Budget) => void;
}

export function OverridesTable({
  budgets,
  selected,
  onToggle,
  onToggleAll,
  allSelected,
  someSelected,
  onEdit,
  onDelete,
}: Props) {
  return (
    <div className="table-wrap">
      <table className="ulb-table">
        <thead>
          <tr>
            <th className="cell-checkbox">
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected && !allSelected}
                onChange={onToggleAll}
                aria-label="Select all overrides on this page"
              />
            </th>
            <th>User</th>
            <th>Monthly cap</th>
            <th>Usage</th>
            <th className="cell-actions">Actions</th>
          </tr>
        </thead>
        <tbody>
          {budgets.map((b) => {
            const isSelected = selected.has(b.id);
            return (
              <tr key={b.id} data-selected={isSelected}>
                <td className="cell-checkbox">
                  <Checkbox
                    checked={isSelected}
                    onChange={() => onToggle(b.id)}
                    aria-label={`Select ${b.user}`}
                  />
                </td>
                <td>
                  <span className="cell-user">
                    <span className="user-avatar" aria-hidden>
                      <PersonIcon size={14} />
                    </span>
                    {b.user}
                  </span>
                </td>
                <td className="cell-amount">{formatCurrency(b.budget_amount)}</td>
                <td>
                  {b.consumed_amount != null ? (
                    <UsageBar
                      consumed={b.consumed_amount}
                      budget={b.budget_amount}
                    />
                  ) : (
                    <span
                      className="muted"
                      title="Search this exact username to load usage"
                    >
                      —
                    </span>
                  )}
                </td>
                <td className="cell-actions">
                  <span className="row" style={{ justifyContent: 'flex-end' }}>
                    <IconButton
                      icon={PencilIcon}
                      aria-label={`Edit override for ${b.user}`}
                      variant="invisible"
                      size="small"
                      onClick={() => onEdit(b)}
                    />
                    <IconButton
                      icon={TrashIcon}
                      aria-label={`Delete override for ${b.user}`}
                      variant="invisible"
                      size="small"
                      onClick={() => onDelete(b)}
                    />
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
