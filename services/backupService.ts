import { Expense, Wallet, Category } from '../types';
import { format } from 'date-fns';

export interface BackupData {
  version: string;
  exportDate: string;
  userId?: string;
  data: {
    expenses: Expense[];
    wallets: Wallet[];
    budget: number;
    customCategories: Category[];
  };
}

const APP_VERSION = __APP_VERSION__;

/**
 * Export all data to JSON backup file
 */
export const exportBackup = (
  expenses: Expense[],
  wallets: Wallet[],
  budget: number,
  customCategories: Category[],
  userId?: string
): void => {
  const backup: BackupData = {
    version: APP_VERSION,
    exportDate: new Date().toISOString(),
    userId,
    data: {
      expenses,
      // `memberProfiles` maps other people's uids to their real names. A backup file
      // gets emailed around and attached to support threads; nobody else's identity
      // belongs in it, and nothing on restore reads the field.
      wallets: wallets.map(({ memberProfiles: _ignored, ...rest }) => rest),
      budget,
      customCategories
    }
  };
  
  const jsonString = JSON.stringify(backup, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `kharcha_bachau_backup_${format(new Date(), 'yyyyMMdd_HHmmss')}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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
 * Validates a single expense from a backup file.
 *
 * Cloud restores are protected by the Firestore security rules, but guest restores
 * write straight to local storage with nothing in between. A row with a malformed
 * `date` used to be persisted and then throw during render on the History screen —
 * every reload, with no way out of it from inside the app.
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
 * Import backup from JSON file
 */
// Refused before a byte is read. The size test used to run *after* the file had been
// loaded into a string and JSON.parsed, which is exactly the part that freezes the
// tab — by then the damage was done and all it did was log a warning.
const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

export const importBackup = async (file: File): Promise<BackupData> => {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_BACKUP_BYTES) {
      reject(new Error('That backup file is too large to open (over 25 MB).'));
      return;
    }

    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);

        if (!validateBackup(data)) {
          reject(new Error('Invalid backup file format'));
          return;
        }

        resolve(data);
      } catch (error) {
        reject(new Error('Failed to parse backup file. Please ensure it is a valid JSON file.'));
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read backup file'));
    };
    
    reader.readAsText(file);
  });
};

/**
 * Preview backup data (get summary without importing)
 */
export const previewBackup = async (file: File): Promise<{
  version: string;
  exportDate: string;
  expenseCount: number;
  rejectedCount: number;
  walletCount: number;
  budget: number;
  customCategoryCount: number;
}> => {
  const backup = await importBackup(file);
  const { valid, rejected } = sanitizeBackupExpenses(backup.data.expenses);
  return {
    version: backup.version,
    exportDate: backup.exportDate,
    expenseCount: valid.length,
    rejectedCount: rejected,
    walletCount: backup.data.wallets.length,
    budget: backup.data.budget,
    customCategoryCount: backup.data.customCategories.length
  };
};

/**
 * Merge backup data with existing data (for merge import option)
 */
export const mergeBackupData = (
  existingExpenses: Expense[],
  existingWallets: Wallet[],
  existingCustomCategories: Category[],
  backup: BackupData
): {
  expenses: Expense[];
  wallets: Wallet[];
  customCategories: Category[];
} => {
  // Merge expenses (avoid duplicates by ID)
  const existingExpenseIds = new Set(existingExpenses.map(e => e.id));
  const newExpenses = backup.data.expenses.filter(e => !existingExpenseIds.has(e.id));
  const mergedExpenses = [...existingExpenses, ...newExpenses];
  
  // Merge wallets (avoid duplicates by ID)
  const existingWalletIds = new Set(existingWallets.map(w => w.id));
  const newWallets = backup.data.wallets.filter(w => !existingWalletIds.has(w.id));
  const mergedWallets = [...existingWallets, ...newWallets];
  
  // Merge custom categories (avoid duplicates by ID)
  const existingCategoryIds = new Set(existingCustomCategories.map(c => c.id));
  const newCategories = backup.data.customCategories.filter(c => !existingCategoryIds.has(c.id));
  const mergedCategories = [...existingCustomCategories, ...newCategories];
  
  return {
    expenses: mergedExpenses,
    wallets: mergedWallets,
    customCategories: mergedCategories
  };
};

