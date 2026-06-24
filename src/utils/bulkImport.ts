import { parseTabularFile, type RawRow } from './csv';

export interface ParsedOverrideRow {
  rowNumber: number;
  username: string;
  budgetAmount: number | null;
  errors: string[];
}

function parseAmount(value: string, errors: string[]): number | null {
  const v = value.trim().replace(/^\$/, '').replace(/,/g, '');
  if (v === '') {
    errors.push('budget_amount is required');
    return null;
  }
  const num = Number(v);
  if (!Number.isFinite(num)) {
    errors.push(`budget_amount "${value}" is not a number`);
    return null;
  }
  if (!Number.isInteger(num)) {
    errors.push('budget_amount must be a whole dollar amount');
    return null;
  }
  if (num < 0) {
    errors.push('budget_amount must be 0 or greater');
    return null;
  }
  return num;
}

function mapRow(raw: RawRow, index: number): ParsedOverrideRow {
  const errors: string[] = [];
  const username = (raw.username ?? raw.user ?? raw.login ?? '')
    .trim()
    .replace(/^@/, '');
  if (!username) errors.push('username is required');

  const budgetAmount = parseAmount(
    raw.budget_amount ?? raw.amount ?? raw.budget ?? '',
    errors,
  );

  return {
    rowNumber: index + 1, // 1-based row number across data rows
    username,
    budgetAmount,
    errors,
  };
}

export async function parseOverrideImport(
  file: File,
): Promise<ParsedOverrideRow[]> {
  const rows = await parseTabularFile(file);
  return rows
    .map(mapRow)
    .filter((r) => r.username !== '' || r.budgetAmount !== null);
}

export const SAMPLE_CSV = `username,budget_amount
octocat,30
monalisa,50
hubot,10
`;

/** Escape a single CSV cell, quoting when it contains commas, quotes or newlines. */
function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** Build a `username,budget_amount` CSV from override rows (header included). */
export function buildOverridesCsv(
  rows: { username: string; budgetAmount: number }[],
): string {
  const lines = rows.map((r) => `${csvCell(r.username)},${r.budgetAmount}`);
  return ['username,budget_amount', ...lines].join('\n') + '\n';
}

/** Trigger a client-side download of text content as a file. */
export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadSampleCsv(): void {
  downloadCsv('override-budgets-sample.csv', SAMPLE_CSV);
}
