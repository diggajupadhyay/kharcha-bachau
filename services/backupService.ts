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

const APP_VERSION = '0.3.0-beta';

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
      wallets,
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
 * Import backup from JSON file
 */
export const importBackup = async (file: File): Promise<BackupData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);
        
        if (!validateBackup(data)) {
          reject(new Error('Invalid backup file format'));
          return;
        }
        
        // Check file size (warn if > 10MB)
        if (file.size > 10 * 1024 * 1024) {
          console.warn('Backup file is large (>10MB). Import may take a while.');
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
  walletCount: number;
  budget: number;
  customCategoryCount: number;
}> => {
  const backup = await importBackup(file);
  return {
    version: backup.version,
    exportDate: backup.exportDate,
    expenseCount: backup.data.expenses.length,
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

