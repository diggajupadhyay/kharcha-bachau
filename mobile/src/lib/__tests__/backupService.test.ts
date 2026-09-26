import { describe, it, expect } from 'vitest';
import { validateBackup, mergeBackupData } from '../backup';
import type { Expense, Wallet, Category } from '../types';

describe('validateBackup', () => {
  it('returns false for null', () => {
    expect(validateBackup(null)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(validateBackup('string')).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(validateBackup({})).toBe(false);
  });

  it('returns true for valid backup structure', () => {
    const validBackup = {
      version: '0.3.0-beta',
      exportDate: '2024-01-01T00:00:00.000Z',
      data: {
        expenses: [],
        wallets: [],
        budget: 20000,
        customCategories: []
      }
    };
    expect(validateBackup(validBackup)).toBe(true);
  });

  it('returns false when expenses is missing', () => {
    const invalid = {
      version: '0.3.0-beta',
      exportDate: '2024-01-01T00:00:00.000Z',
      data: {
        wallets: [],
        budget: 20000,
        customCategories: []
      }
    };
    expect(validateBackup(invalid)).toBe(false);
  });

  it('returns false when budget is not a number', () => {
    const invalid = {
      version: '0.3.0-beta',
      exportDate: '2024-01-01T00:00:00.000Z',
      data: {
        expenses: [],
        wallets: [],
        budget: '20000',
        customCategories: []
      }
    };
    expect(validateBackup(invalid)).toBe(false);
  });
});

describe('mergeBackupData', () => {
  const existingExpenses: Expense[] = [
    { id: '1', amount: 100, note: 'existing', categoryId: 'food', categoryName: 'Food', categoryEmoji: '🍔', date: '2024-01-01', walletId: 'w1', createdBy: { uid: 'u1', name: 'User' }, createdAt: 100 }
  ];
  const existingWallets: Wallet[] = [
    { id: 'w1', name: 'Wallet 1', ownerId: 'u1', members: ['u1'], currency: 'Rs.', createdAt: 100, isPersonal: true }
  ];
  const existingCategories: Category[] = [
    { id: 'cat1', name: 'Custom', emoji: '📦', color: 'bg-gray-100' }
  ];

  it('merges non-duplicate expenses', () => {
    const backup = {
      version: '0.3.0-beta',
      exportDate: '2024-01-01T00:00:00.000Z',
      userId: 'u2',
      data: {
        expenses: [{ id: '2', amount: 200, note: 'new', categoryId: 'food', categoryName: 'Food', categoryEmoji: '🍔', date: '2024-01-02', walletId: 'w1', createdBy: { uid: 'u2', name: 'User2' }, createdAt: 200 }],
        wallets: [],
        budget: 30000,
        customCategories: []
      }
    };
    const result = mergeBackupData(existingExpenses, existingCategories, backup);
    expect(result.expenses).toHaveLength(2);
  });

  it('deduplicates expenses by ID', () => {
    const backup = {
      version: '0.3.0-beta',
      exportDate: '2024-01-01T00:00:00.000Z',
      userId: 'u2',
      data: {
        expenses: [{ id: '1', amount: 200, note: 'duplicate', categoryId: 'food', categoryName: 'Food', categoryEmoji: '🍔', date: '2024-01-01', walletId: 'w1', createdBy: { uid: 'u1', name: 'User' }, createdAt: 100 }],
        wallets: [],
        budget: 30000,
        customCategories: []
      }
    };
    const result = mergeBackupData(existingExpenses, existingCategories, backup);
    expect(result.expenses).toHaveLength(1);
  });
});
