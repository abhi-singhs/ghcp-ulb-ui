import { formatMoney } from '../utils/format';
import { consumedPercent } from '../utils/format';

interface UsageBarProps {
  consumed: number;
  budget: number;
  showLabel?: boolean;
}

export function UsageBar({ consumed, budget, showLabel = true }: UsageBarProps) {
  const percent = consumedPercent(consumed, budget);
  const clamped = Math.min(100, percent);
  let modifier = '';
  if (percent >= 100) modifier = 'usage__fill--over';
  else if (percent >= 80) modifier = 'usage__fill--warn';

  return (
    <div className="usage">
      <div
        className="usage__track"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`usage__fill ${modifier}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <div className="usage__label">
          {formatMoney(consumed)} used · {Math.round(percent)}%
        </div>
      )}
    </div>
  );
}
