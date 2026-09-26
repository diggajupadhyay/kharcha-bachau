import { Expense, Wallet, Category, BackupData } from './types';
import { getCurrencySymbol } from './money';

const CURRENCY = getCurrencySymbol();

export const buildBackup = (
  expenses: Expense[],
  wallet: Wallet,
  budget: number,
  customCategories: Category[],
  appVersion: string
): string => {
  const backup: BackupData = {
    version: appVersion,
    exportDate: new Date().toISOString(),
    data: {
      expenses,
      // `memberProfiles` maps other people's uids to their real names. A backup file
      // gets shared around; nobody else's identity belongs in it.
      wallets: [{ ...wallet, memberProfiles: undefined }],
      budget,
      customCategories,
    },
  };
  return JSON.stringify(backup, null, 2);
};

/**
 * Validate backup file structure
 */
export const validateBackup = (data: any): data is BackupData => {
  if (!data || typeof data !== 'object') return false;
  if (!data.version || typeof data.version !== 'string') return false;
  if (!data.exportDate || typeof data.exportDate !== 'string') return false;
  if (!data.data || typeof data.data !== 'object') return false;
  if (!Array.isArray(data.data.expenses)) return false;
  if (!Array.isArray(data.data.wallets)) return false;
  if (typeof data.data.budget !== 'number') return false;
  if (!Array.isArray(data.data.customCategories)) return false;
  return true;
};

/**
 * True only for a real calendar date in YYYY-MM-DD form. `new Date()` rolls invalid
 * days forward (Feb 30 becomes Mar 2), so the parts are compared after the round trip.
 */
const isRealDateString = (value: unknown): boolean => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const parsed = new Date(y, m - 1, d);
  return parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d;
};

/**
 * Validates a single expense from a backup file. Restores write straight into local
 * storage with nothing in between — a row with a malformed `date` would otherwise
 * persist and then throw during render, every time, with no way back out.
 */
export const isValidBackupExpense = (value: unknown): value is Expense => {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, any>;
  return (
    typeof e.id === 'string' && e.id.length > 0 &&
    typeof e.amount === 'number' && Number.isFinite(e.amount) && e.amount > 0 &&
    isRealDateString(e.date) &&
    typeof e.categoryId === 'string' && e.categoryId.length > 0 &&
    typeof e.categoryName === 'string' && e.categoryName.length > 0 &&
    typeof e.categoryEmoji === 'string' &&
    typeof e.note === 'string' &&
    typeof e.createdAt === 'number' && Number.isFinite(e.createdAt) &&
    !!e.createdBy && typeof e.createdBy === 'object' &&
    typeof e.createdBy.uid === 'string' &&
    typeof e.createdBy.name === 'string'
  );
};

/**
 * Splits a backup's expenses into the usable ones and a count of what was dropped.
 */
export const sanitizeBackupExpenses = (
  expenses: unknown[]
): { valid: Expense[]; rejected: number } => {
  const valid = expenses.filter(isValidBackupExpense);
  return { valid, rejected: expenses.length - valid.length };
};

/**
 * Merge backup data with existing data (for merge import option)
 */
export const mergeBackupData = (
  existingExpenses: Expense[],
  existingCustomCategories: Category[],
  backup: BackupData
): { expenses: Expense[]; customCategories: Category[] } => {
  // Merge expenses (avoid duplicates by ID)
  const existingExpenseIds = new Set(existingExpenses.map(e => e.id));
  const newExpenses = backup.data.expenses.filter(e => !existingExpenseIds.has(e.id));
  const mergedExpenses = [...existingExpenses, ...newExpenses];

  // Merge custom categories (avoid duplicates by ID)
  const existingCategoryIds = new Set(existingCustomCategories.map(c => c.id));
  const newCategories = backup.data.customCategories.filter(c => !existingCategoryIds.has(c.id));
  const mergedCategories = [...existingCustomCategories, ...newCategories];

  return { expenses: mergedExpenses, customCategories: mergedCategories };
};
