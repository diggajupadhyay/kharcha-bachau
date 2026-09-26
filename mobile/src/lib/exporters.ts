import { Expense, Wallet, Category, BackupData } from './types';
import { format } from 'date-fns';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { getCurrencySymbol } from './money';
import { buildBackup, validateBackup } from './backup';

const CURRENCY = getCurrencySymbol();

// ---- CSV -----------------------------------------------------------------

// Spreadsheets execute a leading =, +, - or @ as a formula, so a note could run
// when someone opens the export. Prefixing with a tab makes the cell inert while
// still reading correctly.
const neutralise = (value: string): string =>
  /^[=+\-@\t\r]/.test(value) ? `\t${value}` : value;

// Every field is quoted, not just the note: a category or note containing a comma
// used to shift all following columns.
const cell = (value: unknown): string => {
  const str = value === null || value === undefined ? '' : String(value);
  return `"${neutralise(str).replace(/"/g, '""')}"`;
};

export const buildCSV = (expenses: Expense[]): string => {
  const headers = ['Date', 'Category', `Amount (${CURRENCY})`, 'Note', 'Added By', 'Created At'];

  const rows = expenses.map(expense => {
    const createdAt = Number.isFinite(expense.createdAt)
      ? format(new Date(expense.createdAt), 'yyyy-MM-dd HH:mm:ss')
      : '';
    // `.toFixed` on a non-number throws, and one corrupt row must not abort the
    // whole export.
    const amount = Number.isFinite(expense.amount) ? expense.amount.toFixed(2) : '';
    return [
      cell(expense.date),
      cell(`${expense.categoryEmoji ?? ''} ${expense.categoryName ?? ''}`.trim()),
      cell(amount),
      cell(expense.note || ''),
      cell(expense.createdBy?.name || 'Guest'),
      cell(createdAt),
    ].join(',');
  });

  return [headers.map(h => `"${h}"`).join(','), ...rows].join('\n');
};

const shareFile = async (contents: string, fileName: string, mimeType: string): Promise<void> => {
  const file = new File(Paths.cache, fileName);
  // BOM for UTF-8 so the CSV opens correctly in Excel.
  file.write(mimeType === 'text/csv' ? '\uFEFF' + contents : contents);
  try {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('Sharing is not available on this device');
    }
    await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
  } finally {
    file.delete();
  }
};

export const exportCSV = async (expenses: Expense[]): Promise<void> => {
  if (!expenses || expenses.length === 0) throw new Error('No expenses to export');
  await shareFile(
    buildCSV(expenses),
    `kharcha_bachau_export_${format(new Date(), 'yyyyMMdd_HHmmss')}.csv`,
    'text/csv'
  );
};

export const exportBackup = async (
  expenses: Expense[],
  wallet: Wallet,
  budget: number,
  customCategories: Category[],
  appVersion: string
): Promise<void> => {
  const contents = buildBackup(expenses, wallet, budget, customCategories, appVersion);
  await shareFile(
    contents,
    `kharcha_bachau_backup_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`,
    'application/json'
  );
};

// Refused before a byte is read — the size test runs first so an oversized file
// never gets loaded and parsed at all.
const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

/**
 * Import backup from a picked file (expo-document-picker + expo-file-system).
 */
export const readBackupFile = async (fileUri: string, fileSize?: number): Promise<BackupData> => {
  if (fileSize !== undefined && fileSize > MAX_BACKUP_BYTES) {
    throw new Error('That backup file is too large to open (over 25 MB).');
  }
  let text: string;
  try {
    const file = new File(fileUri);
    text = await file.text();
  } catch (error) {
    if (error instanceof Error && error.message.includes('large')) throw error;
    throw new Error('Failed to read backup file');
  }
  if (text.length > MAX_BACKUP_BYTES) {
    throw new Error('That backup file is too large to open (over 25 MB).');
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('Failed to parse backup file. Please ensure it is a valid JSON file.');
  }
  if (!validateBackup(data)) {
    throw new Error('Invalid backup file format');
  }
  return data;
};
