import Papa from 'papaparse';

export type RawRow = Record<string, string>;

function normalizeKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, '_');
}

function normalizeRow(row: Record<string, unknown>): RawRow {
  const out: RawRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (!key) continue;
    out[normalizeKey(key)] = value == null ? '' : String(value).trim();
  }
  return out;
}

function parseCsv(file: File): Promise<RawRow[]> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, unknown>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => normalizeKey(h),
      complete: (results) => resolve(results.data.map(normalizeRow)),
      error: (err) => reject(new Error(err.message)),
    });
  });
}

async function parseExcel(file: File): Promise<RawRow[]> {
  // Loaded on demand so the (large) xlsx library is only pulled in when an
  // Excel file is actually imported.
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });
  return rows.map(normalizeRow);
}

/**
 * Parse a CSV or Excel file into an array of rows keyed by normalized
 * (lower-cased, underscore) header names.
 */
export async function parseTabularFile(file: File): Promise<RawRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.csv') || file.type === 'text/csv') {
    return parseCsv(file);
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return parseExcel(file);
  }
  // Fall back to CSV parsing for unknown/empty types.
  return parseCsv(file);
}
