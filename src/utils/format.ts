/** Format a whole-dollar budget amount, e.g. 30 -> "$30". */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Format a possibly-fractional money value, e.g. consumed amounts. */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Mask a token, showing only the last 4 characters. */
export function maskToken(token: string): string {
  const trimmed = token.trim();
  if (trimmed.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(8, trimmed.length - 4))}${trimmed.slice(-4)}`;
}

/** Percentage of a budget that has been consumed (0-100+, clamped at 0). */
export function consumedPercent(consumed: number, budget: number): number {
  if (budget <= 0) return 0;
  return Math.max(0, (consumed / budget) * 100);
}

/** Human-friendly duration like "45s", "3m 20s", or "1h 5m". */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const totalMin = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (totalMin < 60) return sec ? `${totalMin}m ${sec}s` : `${totalMin}m`;
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  return min ? `${hr}h ${min}m` : `${hr}h`;
}
